# Implementation Notes

We want to keep track of important design decisions and implementation notes here.

## Library API: Accept both runtimes and layers

Following the pattern from effect-nextjs, our library should accept either a `ManagedRuntime` or a `Layer` from the user. The user is responsible for defining their server and client runtimes/layers (including HMR-safe setup via `globalValue`, disposal on SIGINT/SIGTERM, etc.). The library handles the TanStack Start-specific wiring — mounting HttpApi on splat routes, bridging `createServerFn`, running effects in loaders, etc.

This mirrors `Next.make("BasePage", AppLive)` (accepts a Layer) and `Next.makeWithRuntime("BasePage", statefulRuntime)` (accepts a ManagedRuntime) from effect-nextjs.

Reference: `docs/cloned-repos-as-docs/effect-nextjs/README.md`

## Core Problem: Calling Effect HttpApi endpoints from SSR

The user defines an Effect HttpApi with typed schemas and mounts it on a TanStack Start splat route (`api.$.ts`). From the client, the derived `HttpApiClient` calls these endpoints over HTTP — this works fine.

The hard problem: calling these same endpoints from SSR (route loaders, server functions) **without**:

- Making an HTTP request to yourself (wasteful round-trip)
- Wrapping each endpoint in `createServerFn` (duplicates every endpoint)
- Calling services directly and bypassing the HttpApi contract (loses schema validation and type safety)

**We want to use the derived `HttpApiClient` everywhere** — it enforces the Effect Schema contract at both the type level (TypeScript) and runtime (schema validation). The API implementations may not always be backed by a directly-exposed service — they may compose multiple services, have custom validation logic, or transform data. The `HttpApiClient` is the universal typed interface.

**Strongly typed errors are essential.** A huge reason to use Effect at all is typed error channels. Each endpoint method on the derived client returns `Effect<Success, Error, R>` where `Error` is the exact union of errors defined in the API contract (e.g., `TodoNotFound | HttpApiDecodeError`). All three SSR implementation options must preserve these typed errors — they are not just success-value wrappers.

### Deriving the shared ApiClient type

To share the same `ApiClient` tag between server and client runtimes, we need to extract the full client type from `HttpApiClient.make`. The cleanest approach is a dummy helper function:

```ts
function _makeClient() {
  return HttpApiClient.make(DomainApi);
}
type DomainApiClient = Effect.Effect.Success<ReturnType<typeof _makeClient>>;

class ApiClient extends Context.Tag("ApiClient")<ApiClient, DomainApiClient>() {}
```

This captures the full typed client including all endpoint methods, success types, and error types. The helper is never called at runtime.

Reference: `apps/example/src/api-client/shared.ts`

## Key Architectural Facts

### TanStack Start route loaders are isomorphic

Route loaders run on BOTH the server and client. During SSR, the loader runs on the server and the data is dehydrated into the HTML. On client-side navigation, the loader runs again on the client. This means you **cannot** put server-only code directly in a loader — it must work in both environments.

Reference: `docs/cloned-repos-as-docs/router/packages/router-core/src/load-matches.ts` (lines 656-703)

This has a critical implication: the loader needs a way to call the Effect HttpApi that works in both environments. See "The Isomorphic Runtime Pattern" below.

### TanStack Start's createServerFn at SSR time

`createServerFn` does NOT make an HTTP request at SSR time. The Vite plugin splits the code at compile time — on the server, the handler is imported and called directly in-process. Only client-side calls go through HTTP. This is zero-overhead SSR. The full middleware chain still runs at SSR time (deduplicating any request middleware that already ran).

Reference:

- `docs/cloned-repos-as-docs/router/packages/start-client-core/src/createServerFn.ts` (lines 151-183, `__executeServer`)
- `docs/cloned-repos-as-docs/router/packages/start-server-core/src/createSsrRpc.ts`
- `docs/cloned-repos-as-docs/router/packages/start-plugin-core/src/start-compiler-plugin/handleCreateServerFn.ts`

### Effect HttpApi middleware runs server-side only

Effect's `HttpApiMiddleware` (e.g., auth middleware) runs on the server before every handler. The client does not know about middleware — it just sends the required headers (e.g., `Authorization: Bearer <token>`). The server's middleware extracts, validates, and injects the result (e.g., `CurrentSession`) into the Effect context.

Reference:

- `docs/cloned-repos-as-docs/effect/packages/platform/src/HttpApiBuilder.ts` (applyMiddleware)
- `docs/cloned-repos-as-docs/listening-astro/packages/core/api-contract/src/middleware.ts` (auth middleware definition)
- `docs/cloned-repos-as-docs/listening-astro/apps/api/src/api-impl/auth-middleware.ts` (auth middleware implementation)

For Option C (direct handler invocation), middleware DOES still run as long as we go through the Effect handler layer — middleware is part of the Effect pipeline, not the HTTP transport. It runs because it's wired into the Layer, not because there's an HTTP request.

### HttpApiClient.make internals — the injection point

`HttpApiClient.make()` builds a typed client object by iterating through the API definition. Each endpoint becomes an Effect-returning function that:

1. Schema-encodes the request (path, payload, headers, url params)
2. Calls `httpClient.execute(httpClientRequest)` — **this is the injection point**
3. Schema-decodes the response by status code

The `transformClient` option lets us replace the `HttpClient` used in step 2. The `makeWith` function also accepts an `httpClient` directly.

Reference: `docs/cloned-repos-as-docs/effect/packages/platform/src/HttpApiClient.ts` (lines 107-268)

## The Isomorphic Runtime Pattern

Because loaders are isomorphic, the cleanest approach is: **both the server and client runtimes provide the same Effect Context tag for the derived API client, but with different implementations.**

```ts
// Shared tag — both runtimes provide this
class ApiClient extends Effect.Tag("ApiClient")<
  ApiClient,
  HttpApiClient.Client<typeof DomainApi>
>() {}
```

**Server runtime provides:** an in-process `ApiClient` that calls the Effect handler directly (no HTTP).

**Client runtime provides:** an HTTP-based `ApiClient` that calls the splat route over the network.

The loader uses whichever runtime is active:

```ts
// createIsomorphicFn selects the runtime at compile time
const getRuntime = createIsomorphicFn()
  .server(() => serverRuntime)
  .client(() => clientRuntime);

export const Route = createFileRoute("/todos")({
  loader: () =>
    getRuntime().runPromise(
      Effect.gen(function* () {
        const api = yield* ApiClient;
        return yield* api.todos.list();
      }),
    ),
  component: TodosPage,
});
```

The loader code is written once. At SSR time, `serverRuntime` runs it with the in-process client. At client navigation time, `clientRuntime` runs it with the HTTP client.

Reference for `createIsomorphicFn`:

- `docs/cloned-repos-as-docs/router/packages/start-client-core/src/createIsomorphicFn.ts`
- `docs/cloned-repos-as-docs/router/packages/start-plugin-core/src/start-compiler-plugin/handleCreateIsomorphicFn.ts`

## Options for the server-side ApiClient implementation

All three options provide the same typed `ApiClient` interface. They differ in how the server-side implementation calls the Effect HttpApi handlers.

### Option A: In-process HttpClient via transformClient (web Request/Response round-trip)

Use `HttpApiClient.make()` with a custom `HttpClient` that:

1. Converts `HttpClientRequest` → web `Request`
2. Calls the `toWebHandler` handler function directly (same handler mounted on the splat route)
3. Converts web `Response` → `HttpClientResponse`

**Pros:** Simplest to implement. Full HTTP pipeline runs (routing, all middleware, error handling). Guaranteed correctness — identical behavior to a real HTTP call.

**Cons:** Unnecessary serialization overhead. The data goes: Effect types → web Request → Effect types → handler → Effect types → web Response → Effect types. The round-trip through web primitives is wasted work.

**Middleware:** Runs fully — the web handler includes all middleware.

Reference for toWebHandler internals:

- `docs/cloned-repos-as-docs/effect/packages/platform/src/HttpApiBuilder.ts` (lines 182-203)
- `docs/cloned-repos-as-docs/effect/packages/platform/src/HttpApp.ts` (lines 211-300, `toWebHandlerRuntime`)

### Option B: Effect-level in-process client (skip web types)

Instead of going through the web handler, call the `HttpApp` Effect directly:

1. `HttpApiClient` encodes the request into an `HttpClientRequest` (schema validation here)
2. Convert `HttpClientRequest` → `HttpServerRequest` (Effect internal types, not web types — much cheaper)
3. Run the `HttpApp` Effect directly with the server runtime
4. Convert `HttpServerResponse` → `HttpClientResponse`
5. `HttpApiClient` decodes the response (schema validation here)

**Pros:** Full schema contract, no web serialization overhead. Middleware runs because the `HttpApp` includes the full middleware pipeline.

**Cons:** Needs investigation into whether Effect platform has `HttpClientRequest` ↔ `HttpServerRequest` conversion utilities or if we'd need to build them. More complex than Option A.

**Middleware:** Runs fully — the `HttpApp` includes all middleware.

Reference:

- `docs/cloned-repos-as-docs/effect/packages/platform/src/HttpApp.ts` (HttpApp is `Effect<HttpServerResponse, E, R | HttpServerRequest>`)

### Option C: Direct handler invocation (bypass HTTP routing)

Call the `HttpApiBuilder.group` handler for a specific endpoint directly:

1. Schema-encode the input
2. Call the handler Effect directly (the same Effect that `HttpApiBuilder.group().handle()` wraps)
3. Schema-decode the output

**Pros:** Maximum performance — no routing, no HTTP abstractions. Just schema validation and the handler.

**Cons:** Most complex. Must replicate parts of `HttpApiBuilder` internals to correctly invoke handlers. Need to handle middleware ourselves.

**Middleware:** Does NOT automatically run because we're bypassing the HttpApp pipeline. We would need to either:

- Manually apply middleware layers before invoking the handler (complex but possible — the middleware is just Effect Layers)
- Accept that SSR calls skip Effect HttpApi middleware (may be acceptable if auth is handled by TanStack Start's own middleware at the request level)

In practice, many apps handle auth at the TanStack Start request middleware level (e.g., `beforeLoad` in the root route), not at the Effect HttpApi middleware level. In that case, skipping Effect middleware at SSR time is fine — the auth context is already established. But this is an assumption we shouldn't force on users.

Reference for how middleware is applied in HttpApiBuilder:

- `docs/cloned-repos-as-docs/effect/packages/platform/src/HttpApiBuilder.ts` (search `applyMiddleware`)

## Recommendation

Start with **Option A** — it's the simplest, guaranteed correct, and lets us validate the isomorphic runtime pattern end-to-end. The library API should be the same regardless of which option is used internally, so we can optimize later without breaking user code.

The library could expose a configuration option:

```ts
// Default: Option A (safe, correct)
mountApi(DomainApi, { transport: "web-handler" });

// Optimized: Option B (skip web types)
mountApi(DomainApi, { transport: "effect-direct" });
```

## Example App Layout

All three SSR approaches live side-by-side in `apps/example/src/api-client/` for comparison:

```
apps/example/src/api-client/
  shared.ts                      # shared ApiClient Effect tag (used by all approaches)
  http.ts                        # HTTP-based impl for client runtime
  in-process-web-handler.ts      # web Request/Response round-trip approach
  in-process-effect-direct.ts    # Effect-level HttpApp direct approach
  in-process-direct-call.ts      # direct handler invocation approach (placeholder)
```

`server-runtime.ts` imports whichever server approach to try. `client-runtime.ts` always uses `http.ts`.

## TODO

- [ ] Wire `server-runtime.ts` and `client-runtime.ts` to use the shared `ApiClient` tag
- [ ] Wire up `createIsomorphicFn` to select the correct runtime in loaders
- [ ] Test all three SSR approaches end-to-end with the isomorphic loader pattern
- [ ] Integrate with TanStack Query and effect-query for data fetching — reference: `docs/cloned-repos-as-docs/router/examples/react/start-basic-react-query` and `docs/cloned-repos-as-docs/effect-query`
- [ ] Investigate direct `HttpClientRequest` → `HttpServerRequest` conversion to avoid web Request intermediate in effect-direct approach
- [ ] Investigate extracting individual endpoint handler Effects from HttpApiBuilder internals for the direct-call approach
- [ ] Handle auth middleware story: document how Effect HttpApi auth middleware interacts with TanStack Start auth middleware, and what the recommended pattern is
- [ ] Add example route that uses TanStack Query + effect-query for SSR data fetching (mirroring start-basic-react-query pattern)
- [ ] Extract the finished patterns from the example app into `packages/core` as the publishable library
