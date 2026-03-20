# Implementation Notes

Design decisions and implementation notes for `effect-tanstack-start`.

## What the Library Provides

The library (`packages/core`) exports four functions:

- **`makeApiClientTag(ApiContract)`** — Creates a shared `Context.Tag` for the typed API client. Both server and client runtimes provide this tag with different implementations.
- **`makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient)`** — Creates a Layer providing the ApiClient via direct handler invocation (no HTTP). For the server runtime.
- **`makeHttpApiClientLayer(ApiContract, ApiClient)`** — Creates a Layer providing the ApiClient via HTTP fetch. For the client runtime.
- **`mountApi(ApiContract, { serverRuntime, apiLayer })`** — Creates a request handler for a TanStack Start API splat route.
- **`makeCallApiPromise(ApiClient, getRuntime)`** — Creates a convenience helper that picks the right runtime, yields the ApiClient, and runs the effect as a Promise.

The library ships as raw TypeScript source (`"exports": { ".": "./src/index.ts" }`) so that TanStack Start's Vite plugin can process it.

## How the User Sets Things Up

Four files in the user's app:

### 1. Registration file (`effect-tanstack.ts`)

Creates the shared `ApiClient` tag. This is the only thing shared between server and client. No server-only imports.

```ts
import { makeApiClientTag } from "effect-tanstack-start";
import { ApiContract } from "@/api/api-contract";

export const ApiClient = makeApiClientTag(ApiContract);
```

### 2. Server runtime (`runtimes/server-runtime.server.ts`)

The `.server.ts` suffix triggers TanStack Start's import protection — this file is automatically excluded from the client bundle.

```ts
import { makeSsrApiClientLayer, mountApi } from "effect-tanstack-start";

const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);

export const serverRuntime = globalValue("ServerRuntime", () => {
  const ServerLayer = Layer.mergeAll(TodosService.Default, SsrApiClientLive, Logger.pretty);
  return ManagedRuntime.make(ServerLayer);
});

// Handler for the API splat route
export const apiHandler = mountApi(ApiContract, { serverRuntime, apiLayer: ApiImplLive });
```

### 3. Client runtime (`runtimes/client-runtime.ts`)

```ts
import { makeHttpApiClientLayer } from "effect-tanstack-start";

const HttpApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient);

export const clientRuntime = globalValue("ClientRuntime", () =>
  ManagedRuntime.make(Layer.mergeAll(HttpApiClientLive, Logger.pretty)),
);
```

### 4. Isomorphic runtime getter (`runtimes/get-runtime.ts`)

Uses `createIsomorphicFn` to select the correct runtime at compile time. Statically imports the `.server.ts` file — import protection handles exclusion from the client bundle.

```ts
import { serverRuntime } from "./server-runtime.server";
import { clientRuntime } from "./client-runtime";

export const getRuntime = createIsomorphicFn()
  .server(() => serverRuntime)
  .client(() => clientRuntime);

export const callApiPromise = makeCallApiPromise(ApiClient, getRuntime);
```

### Usage in routes

```ts
// Loader — one-liner, works on both server and client
loader: () => callApiPromise((api) => api.todos.list()),

// Splat route — config must be inline, not an imported object (see below)
import { apiHandler } from "@/runtimes/server-runtime.server";
export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: apiHandler, POST: apiHandler, PUT: apiHandler,
      PATCH: apiHandler, DELETE: apiHandler, OPTIONS: apiHandler,
    },
  },
});
```

## How the SSR Client Works

The `makeSsrApiClientLayer` builds a client with the same typed interface as `HttpApiClient.Client` but calls the route handlers directly — no HTTP.

1. Builds the full API Layer (including `HttpApiBuilder.Router.Live` and `HttpApiBuilder.Middleware.layer`)
2. Calls `Layer.toRuntime()` to get the built runtime with the router
3. Extracts the `HttpRouter` from the runtime context — it contains all registered routes
4. Uses `HttpApi.reflect()` to iterate the API definition and create endpoint functions
5. Each endpoint function provides a minimal fake `HttpServerRequest` (just method, URL, and payload via `request.json`) and a `RouteContext` with path params
6. Calls the route handler Effect directly with this context
7. Extracts the response body from the `HttpServerResponse`

The handler runs the full pipeline: schema decoding, middleware, business logic, response encoding. The only thing skipped is actual HTTP transport.

Reference: `packages/core/src/ssr-api-client.ts`

## Tree-Shaking and Import Protection

### The problem

TanStack Start route files are loaded in both client and server environments (the route tree imports them). Top-level imports in route files end up in the client bundle.

### The solution

Server-only code uses the `.server.ts` naming convention. TanStack Start's import protection plugin automatically blocks `.server.*` files from the client bundle, replacing them with mocks.

Key rules:

- **`server-runtime.server.ts`** — named with `.server.` so import protection blocks it from the client
- **`effect-tanstack.ts`** — only contains the shared `ApiClient` tag, safe for both environments
- **`get-runtime.ts`** — statically imports `server-runtime.server.ts`, but import protection handles the client-side exclusion
- **`api.$.ts`** — imports `apiHandler` from the `.server.ts` file, same protection applies

Reference: `docs/cloned-repos-as-docs/router/docs/start/framework/react/guide/import-protection.md`

### The `createFileRoute` config must be inline

TanStack's router generator performs **static AST analysis** on route files at build time. In `@tanstack/router-generator` (`packages/router-generator/src/transform/transform.ts`, lines 45–57), the transform function parses the first argument to `createFileRoute(path)(config)`:

```ts
// From TanStack router-generator transform.ts
const firstArgument = callExpression.arguments[0];
if (firstArgument) {
  if (firstArgument.type === "ObjectExpression") {
    const staticProperties = firstArgument.properties.flatMap((p) => {
      if (p.type === "ObjectProperty" && p.key.type === "Identifier") {
        return p.key.name;
      }
      return [];
    });
    node.createFileRouteProps = new Set(staticProperties);
  }
}
```

It expects an `ObjectExpression` AST node — a literal `{ ... }` in source. It extracts property names (`server`, `component`, `loader`, etc.) into `createFileRouteProps` to classify the route.

When the config is an opaque imported variable — e.g. `createFileRoute("/api/$")(apiRouteConfig)` — the first argument is an `Identifier` node, not an `ObjectExpression`. The generator extracts **no properties**, so `createFileRouteProps` is never set. This has two consequences:

1. **Runtime error:** `"Route cannot have both an 'id' and a 'path' option"` — thrown by the `Route` constructor (`@tanstack/router-core`, `packages/router-core/src/route.ts`, line 1754). Import protection mocks the `.server.ts` import on the client side, and the mock value (likely `undefined` or an empty proxy) gets merged into route options in a way that sets both `id` and `path`.
2. **Broken route classification:** Without `createFileRouteProps`, the generator can't determine this is an API-only route (no `component`, just `server.handlers`), which may affect tree-shaking and import protection decisions.

**The fix:** Always write the route config object inline. `mountApi` returns just the handler function, and the route file assembles the `{ server: { handlers: { ... } } }` structure itself. This way the AST parser sees an `ObjectExpression` with a `server` property and correctly classifies the route.

### The server-code-in-client-bundle wild goose chase

We had a test checking that `SUPER_SECRET` (a string in `TodosService`) didn't appear in the client bundle. It was appearing, and we spent significant time investigating the wrong cause.

**What we thought was happening:** `createIsomorphicFn` in `get-runtime.ts` statically imports `server-runtime.server.ts`. We assumed this import was pulling the entire server runtime (including `TodosService` and its `SUPER_SECRET` string) into the client bundle. We tried many approaches to fix this:

- Dynamic `import()` in the server branch of `createIsomorphicFn`
- Marking packages with `sideEffects: false`
- Using `@tanstack/react-start/server-only` in various files
- Disabling minification to inspect the bundle

None of these worked, and we kept seeing the string in the client output.

**What was actually happening:** The real culprit was `api.$.ts` — the splat route file. It imported `apiRouteConfig` (the full route config object) from `server-runtime.server.ts`. Because `createFileRoute("/api/$")(apiRouteConfig)` passes an opaque variable, the compiler couldn't statically determine this was an API-only route. Import protection was either not kicking in properly or the mock was still pulling in transitive dependencies.

**The fix was simple:** Have `mountApi` return just the handler function, and write the route config inline in `api.$.ts`. Once we did this, import protection correctly identified the `.server.ts` import and mocked it on the client. The `SUPER_SECRET` string disappeared from the client bundle.

**Lesson:** When server code leaks into the client bundle, check all import sites — not just the obvious ones. Route files are loaded in both environments, and how their config is structured matters for TanStack's static analysis. The `.server.ts` naming convention works, but only if the compiler can see the route config shape.

### What doesn't work

- `createIsomorphicFn` does NOT automatically prune top-level imports of modules with side effects (like `globalValue` calls). The `.server.ts` naming convention is required.
- `sideEffects: false` in `package.json` was not sufficient for Rolldown to tree-shake these imports.
- Marking a route file with `import '@tanstack/react-start/server-only'` fails because the route tree needs the file in both environments.
- Passing the entire `mountApi` result (a config object) directly to `createFileRoute` breaks static analysis and causes runtime errors.

## TODO

- [ ] Write README.md with full documentation
- [ ] Integrate with TanStack Query and effect-query for data fetching — reference: `docs/cloned-repos-as-docs/router/examples/react/start-basic-react-query` and `docs/cloned-repos-as-docs/effect-query`
- [ ] Handle auth middleware story: document how Effect HttpApi auth middleware interacts with TanStack Start auth middleware
- [ ] Add example route using TanStack Query + effect-query for SSR data fetching
- [ ] Investigate reducing `as any` casts in `ssr-api-client.ts` and `mount-api.ts`
- [ ] Consider whether the library should provide a helper for the `apiHandler` pattern (splat route setup)
- [ ] Investigate publishing as bundled `.js` + `.d.ts` instead of raw `.ts` source — requires understanding how TanStack Start's Vite plugin interacts with pre-bundled code containing `createIsomorphicFn`
