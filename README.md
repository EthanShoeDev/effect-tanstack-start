# effect-tanstack-start

[![npm version](https://img.shields.io/npm/v/effect-tanstack-start)](https://www.npmjs.com/package/effect-tanstack-start)

Seamlessly integrate [Effect](https://effect.website/) `HttpApi` with [TanStack Start](https://tanstack.com/start).

Define your API once as an Effect `HttpApi` contract, mount it on a TanStack Start splat route, and call it from route loaders and components using a single typed client — with zero HTTP overhead at SSR time.

## Versioning — Effect v3 vs Effect v4

This package ships two parallel release lines so you don't have to wait on the Effect v4 beta to use it:

| Package version             | Effect version                        | Branch                                                                              | Status                       |
| --------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------- |
| `effect-tanstack-start@0.x` | `effect@^3.20.0` + `@effect/platform` | [`main`](https://github.com/EthanShoeDev/effect-tanstack-start/tree/main)           | Maintained for bug fixes     |
| `effect-tanstack-start@1.x` | `effect@^4.0.0-beta`                  | [`effect-v4`](https://github.com/EthanShoeDev/effect-tanstack-start/tree/effect-v4) | Beta, tracks Effect v4 betas |

Effect v4 is a major release with significant API changes (`@effect/platform` is consolidated into `effect/unstable/*`, `Context.Tag` becomes `Context.Service`, `HttpApiBuilder.api` becomes `HttpApiBuilder.layer`, endpoints take an options object, etc.). The 1.x line of this package follows those changes; the 0.x line stays on the stable Effect v3 surface.

```sh
# Effect v3 (stable)
npm install effect-tanstack-start@v3-latest
npm install effect @effect/platform @tanstack/react-start @tanstack/react-router react

# Effect v4 (beta — tracks the latest effect@4.0.0-beta.*)
npm install effect-tanstack-start@v4-latest
npm install effect @tanstack/react-start @tanstack/react-router react
```

The rest of this README documents the **v1.x / Effect v4** API. The v3 docs live on the [`main`](https://github.com/EthanShoeDev/effect-tanstack-start/tree/main#readme) branch.

## How it works

Effect `HttpApi` gives you a typed API contract, typed handlers, and a derived typed client. TanStack Start gives you isomorphic route loaders that run on both server and client.

This library bridges them:

- **At SSR time** — the client calls your handlers directly as Effect functions. No HTTP request, no serialization overhead, no URL routing. Same result as if you called the handler yourself.
- **In the browser** — the client makes real HTTP requests to your API splat route, using Effect's `HttpApiClient` with `fetch`.
- **Same typed interface** — both environments use the same `Context.Service` key. Your route loaders and components don't know or care which one they're using.

The library exports two entry points:

- `effect-tanstack-start/server` — SSR client layer, API route handler (server-only, imports `@tanstack/react-start/server` internally)
- `effect-tanstack-start/client` — HTTP client layer, shared key, call helper (safe for both environments)

## Install

```sh
npm install effect-tanstack-start
# peer dependencies (note: no @effect/platform — v4 consolidated it into effect)
npm install effect @tanstack/react-start @tanstack/react-router react
```

## Setup

### 1. API contract

Define your API using Effect `HttpApi`. This is standard Effect v4 — nothing library-specific here.

```ts
// src/api/api-contract.ts
import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

export const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
  createdAt: Schema.DateTimeUtc,
});

export class TodoNotFound extends Schema.TaggedErrorClass<TodoNotFound>()(
  "TodoNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

export class TodosApiGroup extends HttpApiGroup.make("todos").add(
  HttpApiEndpoint.get("list", "/todos", {
    success: Schema.Array(Todo),
  }),
  HttpApiEndpoint.get("getById", "/todos/:id", {
    params: { id: Schema.String },
    success: Todo,
    error: TodoNotFound,
  }),
  HttpApiEndpoint.post("create", "/todos", {
    payload: Schema.Struct({ title: Schema.String }),
    success: Todo,
  }),
) {}

export class ApiContract extends HttpApi.make("api").add(TodosApiGroup).prefix("/api") {}
```

### 2. API implementation

Implement your handlers with `HttpApiBuilder`. In v4, you compose `HttpApiBuilder.layer(api)` with each group's `HttpApiBuilder.group(...)` layer via `Layer.provideMerge`.

**Important:** Don't provide stateful services (those backed by `Ref`, database connections, etc.) inside `ApiImplLive`. They should come from the runtime so that both the SSR client and HTTP handler share the same instances.

```ts
// src/api/api-impl.ts
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { ApiContract } from "./api-contract";
import { TodosService } from "../services/todos-service";

const TodosGroupLive = HttpApiBuilder.group(ApiContract, "todos", (handlers) =>
  handlers
    .handle("list", () => Effect.flatMap(TodosService, (s) => s.list))
    .handle("getById", ({ params }) => Effect.flatMap(TodosService, (s) => s.getById(params.id)))
    .handle("create", ({ payload }) => Effect.flatMap(TodosService, (s) => s.create(payload))),
);

// HttpApiBuilder.layer registers the implemented groups with the HttpRouter.
// Provide each group layer (and any middleware layers) to it via provideMerge.
// TodosService is NOT provided here — it comes from the runtime.
export const ApiImplLive = HttpApiBuilder.layer(ApiContract).pipe(
  Layer.provideMerge(TodosGroupLive),
);
```

### 3. Shared API client key

Create the shared `Context.Service` key. This is the only thing imported by both server and client runtimes. It must not import any server-only code.

```ts
// src/services/api-client-tag.ts
import { makeApiClientTag } from "effect-tanstack-start/client";
import { ApiContract } from "@/api/api-contract";

export const ApiClient = makeApiClientTag(ApiContract);
```

### 4. Server runtime

The `.server.ts` suffix is important — TanStack Start's [import protection](https://tanstack.com/router/latest/docs/start/framework/react/guide/import-protection) automatically excludes this file from the client bundle.

```ts
// src/runtimes/server-runtime.server.ts
import { Layer, Logger, ManagedRuntime } from "effect";
import { makeSsrApiClientLayer, mountApi } from "effect-tanstack-start/server";
import { ApiContract } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { TodosServiceLive } from "@/services/todos-service";
import { ApiClient } from "@/services/api-client-tag";

// SSR client — calls handlers directly, no HTTP.
// Automatically forwards browser request headers (cookies, auth tokens)
// to middleware via getRequestHeaders() internally.
const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);

// Stateful services are provided here so both the SSR client and
// HTTP handler (mountApi) share the same instances.
export const serverRuntime = ManagedRuntime.make(
  SsrApiClientLive.pipe(
    Layer.provideMerge(TodosServiceLive),
    Layer.provideMerge(Logger.layer([Logger.consolePretty()])),
  ),
);

// Handler for the API splat route
export const apiHandler = mountApi(ApiContract, {
  serverRuntime,
  apiLayer: ApiImplLive,
});
```

### 5. Client runtime

```ts
// src/runtimes/client-runtime.ts
import { Layer, Logger, ManagedRuntime } from "effect";
import { makeHttpApiClientLayer } from "effect-tanstack-start/client";
import { ApiContract } from "@/api/api-contract";
import { ApiClient } from "@/services/api-client-tag";

// HTTP client — makes fetch requests to the API splat route
const HttpApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient);

export const clientRuntime = ManagedRuntime.make(
  Layer.mergeAll(HttpApiClientLive, Logger.layer([Logger.consolePretty()])),
);
```

### 6. Isomorphic runtime getter

Uses TanStack Start's `createIsomorphicFn` to pick the correct runtime at compile time. The static import of the `.server.ts` file is safe — import protection handles client-side exclusion.

```ts
// src/runtimes/get-runtime.ts
import { notFound } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { makeCallApiPromise } from "effect-tanstack-start/client";
import { ApiClient } from "@/services/api-client-tag";
import { serverRuntime } from "./server-runtime.server";
import { clientRuntime } from "./client-runtime";

export const getRuntime = createIsomorphicFn()
  .server(() => serverRuntime)
  .client(() => clientRuntime);

export const callApiPromise = makeCallApiPromise(ApiClient, getRuntime, {
  throwOnTag: {
    TodoNotFound: () => notFound(),
  },
});
```

### 7. API splat route

Mount the Effect API on a TanStack Start route. `mountApi` returns a single handler function — wire it into `server.handlers` inline so TanStack's compiler can statically analyze the route config.

```ts
// src/routes/api.$.ts
import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/runtimes/server-runtime.server";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: apiHandler,
      POST: apiHandler,
      PUT: apiHandler,
      PATCH: apiHandler,
      DELETE: apiHandler,
      OPTIONS: apiHandler,
    },
  },
});
```

> **Important:** The route config object must be written inline — not passed as an imported variable. TanStack's router generator performs static AST analysis on the config to classify routes. An opaque imported object prevents this analysis and causes runtime errors.

## Usage

### Route loaders

```ts
import { createFileRoute } from "@tanstack/react-router";
import { callApiPromise } from "@/runtimes/get-runtime";

export const Route = createFileRoute("/")({
  loader: ({ abortController }) =>
    callApiPromise((api) => api.todos.list(), {
      signal: abortController.signal,
    }),
  component: Todos,
});
```

This works identically on server (SSR) and client (navigation). At SSR time, the handler is called directly. In the browser, it makes an HTTP request to `/api/todos`. Passing `signal` ensures in-flight API calls are cancelled when the user navigates away.

### Components

```ts
const addTodo = async (title: string) => {
  await callApiPromise((api) => api.todos.create({ payload: { title } }));
};

const deleteTodo = async (id: string) => {
  await callApiPromise((api) => api.todos.remove({ params: { id } }));
};
```

> **Effect v4 call-site naming:** path parameters are passed as `{ params }` (v3 used `path`), query string params are `{ query }` (v3 used `urlParams`). `payload` and `headers` are unchanged.

### Using Effect composition

The callback passed to `callApiPromise` returns an `Effect`, so you can compose freely:

```ts
import { Effect } from "effect";

// Combine multiple API calls
loader: ({ abortController }) =>
  callApiPromise(
    (api) =>
      Effect.all({
        todos: api.todos.list(),
        stats: api.dashboard.stats(),
      }),
    { signal: abortController.signal },
  ),
```

### Protected routes

Use a layout route with `beforeLoad` to check auth before loading child routes. `throwOnTag` maps Effect error tags to thrown values — TanStack Router intercepts these to trigger redirects, `notFound()`, etc.

```ts
// src/routes/_authed.tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { callApiPromise } from "@/runtimes/get-runtime";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location, abortController }) => {
    const session = await callApiPromise((api) => api.auth.me(), {
      throwOnTag: {
        Unauthorized: () => redirect({ to: "/login", search: { redirect: location.href } }),
      },
      signal: abortController.signal,
    });
    return { user: session };
  },
  component: () => <Outlet />,
});
```

Child routes under `_authed/` are automatically protected — no per-route auth boilerplate.

## Auth middleware

The SSR client automatically forwards browser request headers (cookies, Authorization tokens) to your Effect `HttpApi` middleware. This is done internally via TanStack Start's `getRequestHeaders()` — no configuration needed.

In Effect v4, define auth middleware with `HttpApiMiddleware.Service` and security with `HttpApiSecurity`. The middleware implementation wraps the inner endpoint effect:

```ts
import { Layer, Redacted } from "effect";
import { HttpApiMiddleware } from "effect/unstable/httpapi";

export class AuthMiddleware extends HttpApiMiddleware.Service<
  AuthMiddleware,
  { provides: CurrentSession }
>()("AuthMiddleware", {
  error: Unauthorized,
  security: { session: sessionSecurity },
}) {}

export const AuthMiddlewareLive = Layer.effect(AuthMiddleware)(
  Effect.gen(function* () {
    const store = yield* SessionStore;
    return {
      session: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const session = yield* store.get(Redacted.value(credential));
          if (!session) return yield* new Unauthorized();
          return yield* Effect.provideService(httpEffect, CurrentSession, session);
        }),
    };
  }),
);
```

See the [example app](apps/example/) for a complete auth implementation with cookie-based sessions, login/logout, and protected routes.

## Using with TanStack Query (effect-query)

Integration with [`effect-query`](https://github.com/voidhashcom/effect-query) is a work in progress. The basics — isomorphic factory + component `useQuery` — work without any library changes, but the loader path has unresolved tension around router sentinels (`notFound()` / `redirect()`) when error wrapping is in play. See [`docs/wip-effect-query.md`](./docs/wip-effect-query.md) for the current state, the tensions, and the patterns we've evaluated.

## API Reference

### `effect-tanstack-start/client`

#### `makeApiClientTag(api)`

Creates a `Context.Service` key typed from your `HttpApi` contract. The service shape is the full `HttpApiClient.Client` shape with typed errors per endpoint.

Both `makeSsrApiClientLayer` and `makeHttpApiClientLayer` provide this key with different implementations.

#### `makeCallApiPromise(clientTag, getRuntime, options?)`

Creates a convenience function that resolves the `ApiClient` from the appropriate runtime and runs the effect as a `Promise`. Designed for use in route loaders and event handlers.

Factory-level options:

| Option       | Type                         | Description                                                                                                 |
| ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `throwOnTag` | `Record<string, (e) => any>` | Global error mappings — keys are error `_tag` strings, handlers return a value to throw (e.g. `notFound()`) |

Per-call options:

| Option       | Type                         | Description                                                  |
| ------------ | ---------------------------- | ------------------------------------------------------------ |
| `throwOnTag` | `Record<string, (e) => any>` | Per-call error mappings — override or extend global mappings |
| `signal`     | `AbortSignal`                | Abort signal to cancel the underlying Effect fiber           |

```ts
const callApiPromise = makeCallApiPromise(ApiClient, getRuntime, {
  throwOnTag: {
    TodoNotFound: () => notFound(),
  },
});

// In a loader — pass signal for cancellation on navigation
loader: ({ abortController }) =>
  callApiPromise((api) => api.todos.list(), {
    signal: abortController.signal,
  });

// Per-call throwOnTag for context-dependent mappings
const session = await callApiPromise((api) => api.auth.me(), {
  throwOnTag: { Unauthorized: () => redirect({ to: "/login" }) },
});
```

> **Effect v4 note:** when no handler matches, the library throws `Cause.squash(cause)` — typically the underlying error object — instead of the v3 `Runtime.FiberFailure` wrapper. Catch with `instanceof` or check `_tag`.

#### `makeHttpApiClientLayer(api, clientTag, options?)`

Creates a `Layer` that provides the `ApiClient` via HTTP `fetch`. Use this in your client runtime.

Options are passed through to `HttpApiClient.make`:

| Option              | Type                                 | Description                                             |
| ------------------- | ------------------------------------ | ------------------------------------------------------- |
| `baseUrl`           | `string \| URL`                      | Defaults to `window.location.origin` in the browser     |
| `transformClient`   | `(client: HttpClient) => HttpClient` | Transform the underlying HTTP client (e.g. add headers) |
| `transformResponse` | `(effect: Effect) => Effect`         | Transform response effects (e.g. add logging)           |

#### `ClientOf<Api>` (type)

Type-level utility that extracts the `HttpApiClient.Client` type from an `HttpApi` definition.

```ts
import type { ClientOf } from "effect-tanstack-start/client";
type MyClient = ClientOf<typeof ApiContract>;
```

### `effect-tanstack-start/server`

#### `makeSsrApiClientLayer(api, apiImplLayer, clientTag)`

Creates a `Layer` that provides the `ApiClient` via direct handler invocation. Use this in your server runtime for zero-overhead SSR.

Internally, it builds the user's composed API layer, reads each group's routes directly from the built context (the v4 group layer stores `{ routes }` per group key), and creates endpoint functions that invoke each route's handler Effect with a minimal request context — same pipeline (schema decoding, middleware, business logic, response encoding) minus HTTP transport.

Browser request headers are automatically forwarded to middleware via `getRequestHeaders()` from `@tanstack/react-start/server`.

#### `mountApi(api, options)`

Creates a request handler `({ request: Request }) => Promise<Response>` for an Effect HttpApi. Assign it to every HTTP method in your splat route's `server.handlers`.

| Option          | Type             | Description                            |
| --------------- | ---------------- | -------------------------------------- |
| `serverRuntime` | `ManagedRuntime` | Your server `ManagedRuntime`           |
| `apiLayer`      | `Layer`          | Your composed API implementation Layer |

## Stateful services

Services backed by mutable state (`Ref`, in-memory stores, database connections) must be provided by the **runtime**, not by `ApiImplLive`. This ensures that both the SSR client (direct handler invocation) and the HTTP handler (`mountApi`) share the same instances.

```ts
// Wrong — creates separate instances for SSR and HTTP
const ApiImplLive = HttpApiBuilder.layer(ApiContract).pipe(
  Layer.provideMerge(TodosGroupLive),
  Layer.provideMerge(TodosServiceLive), // new Ref created here
);

// Right — runtime provides stateful services, both paths share them
const ServerLayer = SsrApiClientLive.pipe(
  Layer.provideMerge(TodosServiceLive), // single Ref instance
  Layer.provideMerge(Logger.layer([Logger.consolePretty()])),
);
```

## Tree-shaking and import protection

TanStack Start route files are loaded in both server and client environments. The library relies on TanStack Start's [import protection](https://tanstack.com/router/latest/docs/start/framework/react/guide/import-protection) to keep server code out of the client bundle:

- **`server-runtime.server.ts`** — the `.server.ts` suffix triggers import protection. This file is automatically excluded from the client bundle.
- **`api-client-tag.ts`** — only contains the shared key. Safe for both environments.
- **`get-runtime.ts`** — statically imports `server-runtime.server.ts`, but import protection mocks it on the client side.
- **`api.$.ts`** — imports `apiHandler` from the `.server.ts` file. Same protection applies.

The library's split entry points (`/server` and `/client`) ensure that importing from `effect-tanstack-start/client` never pulls in server-only code like `@tanstack/react-start/server`.

## Future goals

- Integrate with [TanStack Query](https://tanstack.com/query) and [effect-query](https://github.com/voidhashcom/effect-query) for data fetching with caching, refetching, and optimistic updates
- Allow the user to define a route loader using an Effect generator function
- Allow the user to define a `createServerFn` using an Effect generator function (without wrapping the impl in `Effect.runPromise` or `Runtime.runPromise`)
- Distant goal: a Vite plugin that automatically code-splits an Effect `HttpApi` into per-route SSR chunks, transmuting Effect HttpApi routes into TanStack Start API routes and middleware

## Acknowledgements

Inspired by:

- [effect-nextjs](https://github.com/mcrovero/effect-nextjs) — isomorphic runtime pattern for Effect + Next.js
- [effect-query](https://github.com/voidhashcom/effect-query) — Effect integration with TanStack Query
- [better-call](https://github.com/better-auth/better-call) — shares the same core idea: endpoints callable as direct functions or via HTTP, no reason to go through the network when you're already on the server

## License

MIT
