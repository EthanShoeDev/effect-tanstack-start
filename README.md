# effect-tanstack-start

[![npm version](https://img.shields.io/npm/v/effect-tanstack-start)](https://www.npmjs.com/package/effect-tanstack-start)

Seamlessly integrate [Effect](https://effect.website/) `HttpApi` with [TanStack Start](https://tanstack.com/start).

Define your API once as an Effect `HttpApi` contract, mount it on a TanStack Start splat route, and call it from route loaders and components using a single typed client — with zero HTTP overhead at SSR time.

## How it works

Effect `HttpApi` gives you a typed API contract, typed handlers, and a derived typed client. TanStack Start gives you isomorphic route loaders that run on both server and client.

This library bridges them:

- **At SSR time** — the client calls your handlers directly as Effect functions. No HTTP request, no serialization overhead, no URL routing. Same result as if you called the handler yourself.
- **In the browser** — the client makes real HTTP requests to your API splat route, using Effect's `HttpApiClient` with `fetch`.
- **Same typed interface** — both environments use the same `Context.Tag`. Your route loaders and components don't know or care which one they're using.

The library exports two entry points:

- `effect-tanstack-start/server` — SSR client layer, API route handler (server-only, imports `@tanstack/react-start/server` internally)
- `effect-tanstack-start/client` — HTTP client layer, shared tag, call helper (safe for both environments)

## Install

```sh
npm install effect-tanstack-start
# peer dependencies
npm install effect @effect/platform @tanstack/react-start @tanstack/react-router react
```

## Setup

### 1. API contract

Define your API using Effect `HttpApi`. This is standard Effect — nothing library-specific here.

```ts
// src/api/api-contract.ts
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

export const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
  createdAt: Schema.DateTimeUtc,
});

export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
  "TodoNotFound",
  { id: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class TodosApiGroup extends HttpApiGroup.make("todos")
  .add(HttpApiEndpoint.get("list", "/todos").addSuccess(Schema.Array(Todo)))
  .add(
    HttpApiEndpoint.get("getById", "/todos/:id")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Todo)
      .addError(TodoNotFound),
  )
  .add(
    HttpApiEndpoint.post("create", "/todos")
      .setPayload(Schema.Struct({ title: Schema.String }))
      .addSuccess(Todo),
  ) {}

export class ApiContract extends HttpApi.make("api").add(TodosApiGroup).prefix("/api") {}
```

### 2. API implementation

Implement your handlers with `HttpApiBuilder`. Also standard Effect.

**Important:** Don't provide stateful services (those backed by `Ref`, database connections, etc.) inside `ApiImplLive`. They should come from the runtime so that both the SSR client and HTTP handler share the same instances.

```ts
// src/api/api-impl.ts
import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { ApiContract } from "./api-contract";
import { TodosService } from "../services/todos-service";

const TodosGroupLive = HttpApiBuilder.group(ApiContract, "todos", (handlers) =>
  handlers
    .handle("list", () => Effect.flatMap(TodosService, (s) => s.list))
    .handle("getById", ({ path }) => Effect.flatMap(TodosService, (s) => s.getById(path.id)))
    .handle("create", ({ payload }) => Effect.flatMap(TodosService, (s) => s.create(payload))),
);

// TodosService is NOT provided here — it comes from the runtime
export const ApiImplLive = HttpApiBuilder.api(ApiContract).pipe(Layer.provide(TodosGroupLive));
```

### 3. Shared API client tag

Create the shared `Context.Tag`. This is the only thing imported by both server and client runtimes. It must not import any server-only code.

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
import { makeSsrApiClientLayer, mountApi } from "effect-tanstack-start/server";
import { Layer, Logger, ManagedRuntime } from "effect";
import { ApiContract } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { TodosService } from "@/services/todos-service";
import { ApiClient } from "@/services/api-client-tag";

// SSR client — calls handlers directly, no HTTP.
// Automatically forwards browser request headers (cookies, auth tokens)
// to middleware via getRequestHeaders() internally.
const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);

// Stateful services are provided here so both the SSR client and
// HTTP handler (mountApi) share the same instances.
export const serverRuntime = ManagedRuntime.make(
  SsrApiClientLive.pipe(
    Layer.provideMerge(TodosService.Default),
    Layer.provideMerge(Logger.pretty),
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
import { makeHttpApiClientLayer } from "effect-tanstack-start/client";
import { Layer, Logger, ManagedRuntime } from "effect";
import { ApiContract } from "@/api/api-contract";
import { ApiClient } from "@/services/api-client-tag";

// HTTP client — makes fetch requests to the API splat route
const HttpApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient);

export const clientRuntime = ManagedRuntime.make(Layer.mergeAll(HttpApiClientLive, Logger.pretty));
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
  await callApiPromise((api) => api.todos.remove({ path: { id } }));
};
```

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

Define auth middleware in your API contract using `HttpApiSecurity` and `HttpApiMiddleware.Tag`, implement the handler, and both SSR and HTTP paths will run the same auth pipeline.

See the [example app](apps/example/) for a complete auth implementation with cookie-based sessions, login/logout, and protected routes.

## API Reference

### `effect-tanstack-start/client`

#### `makeApiClientTag(api)`

Creates a `Context.Tag` typed from your `HttpApi` contract. The tag's service type is the full `HttpApiClient.Client` shape with typed errors per endpoint.

Both `makeSsrApiClientLayer` and `makeHttpApiClientLayer` provide this tag with different implementations.

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

Internally, it builds the full API Layer runtime, extracts the `HttpRouter`, and creates endpoint functions that call route handlers directly — same pipeline (schema decoding, middleware, business logic, response encoding) minus HTTP transport.

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
const ApiImplLive = HttpApiBuilder.api(ApiContract).pipe(
  Layer.provide(TodosGroupLive),
  Layer.provide(TodosService.Default), // new Ref created here
);

// Right — runtime provides stateful services, both paths share them
const ServerLayer = SsrApiClientLive.pipe(
  Layer.provideMerge(TodosService.Default), // single Ref instance
  Layer.provideMerge(Logger.pretty),
);
```

## Tree-shaking and import protection

TanStack Start route files are loaded in both server and client environments. The library relies on TanStack Start's [import protection](https://tanstack.com/router/latest/docs/start/framework/react/guide/import-protection) to keep server code out of the client bundle:

- **`server-runtime.server.ts`** — the `.server.ts` suffix triggers import protection. This file is automatically excluded from the client bundle.
- **`api-client-tag.ts`** — only contains the shared tag. Safe for both environments.
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
