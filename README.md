# effect-tanstack-start

Seamlessly integrate [Effect](https://effect.website/) `HttpApi` with [TanStack Start](https://tanstack.com/start).

Define your API once as an Effect `HttpApi` contract, mount it on a TanStack Start splat route, and call it from route loaders and components using a single typed client — with zero HTTP overhead at SSR time.

## How it works

Effect `HttpApi` gives you a typed API contract, typed handlers, and a derived typed client. TanStack Start gives you isomorphic route loaders that run on both server and client.

This library bridges them:

- **At SSR time** — the client calls your handlers directly as Effect functions. No HTTP request, no serialization overhead, no URL routing. Same result as if you called the handler yourself.
- **In the browser** — the client makes real HTTP requests to your API splat route, using Effect's `HttpApiClient` with `fetch`.
- **Same typed interface** — both environments use the same `Context.Tag`. Your route loaders and components don't know or care which one they're using.

## Install

```sh
npm install effect-tanstack-start
# peer dependencies
npm install effect @effect/platform @tanstack/react-start @tanstack/react-router react
```

## Setup

There are four files to set up. The example below uses a Todos API.

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
).pipe(Layer.provide(TodosService.Default));

export const ApiImplLive = HttpApiBuilder.api(ApiContract).pipe(Layer.provide(TodosGroupLive));
```

### 3. Shared API client tag

Create the shared `Context.Tag`. This is the only thing imported by both server and client runtimes. It must not import any server-only code.

```ts
// src/services/api-client-tag.ts
import { makeApiClientTag } from "effect-tanstack-start";
import { ApiContract } from "@/api/api-contract";

export const ApiClient = makeApiClientTag(ApiContract);
```

`makeApiClientTag` returns a `Context.Tag` whose service type is the full `HttpApiClient.Client` shape derived from your contract — all endpoint methods with typed errors included.

### 4. Server runtime

The `.server.ts` suffix is important — TanStack Start's [import protection](https://tanstack.com/router/latest/docs/start/framework/react/guide/import-protection) automatically excludes this file from the client bundle.

```ts
// src/runtimes/server-runtime.server.ts
import { makeSsrApiClientLayer, mountApi } from "effect-tanstack-start";
import { Layer, Logger, ManagedRuntime } from "effect";
import { ApiContract } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { TodosService } from "@/services/todos-service";
import { ApiClient } from "@/services/api-client-tag";

// SSR client — calls handlers directly, no HTTP
const SsrApiClientLive = makeSsrApiClientLayer(ApiContract, ApiImplLive, ApiClient);

export const serverRuntime = ManagedRuntime.make(
  Layer.mergeAll(TodosService.Default, SsrApiClientLive, Logger.pretty),
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
import { makeHttpApiClientLayer } from "effect-tanstack-start";
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
import { createIsomorphicFn } from "@tanstack/react-start";
import { makeCallApiPromise } from "effect-tanstack-start";
import { ApiClient } from "@/services/api-client-tag";
import { serverRuntime } from "./server-runtime.server";
import { clientRuntime } from "./client-runtime";

export const getRuntime = createIsomorphicFn()
  .server(() => serverRuntime)
  .client(() => clientRuntime);

export const callApiPromise = makeCallApiPromise(ApiClient, getRuntime);
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
  loader: () => callApiPromise((api) => api.todos.list()),
  component: Todos,
});
```

This works identically on server (SSR) and client (navigation). At SSR time, the handler is called directly. In the browser, it makes an HTTP request to `/api/todos`.

### Components

```ts
const addTodo = async (title: string) => {
  await callApiPromise((api) => api.todos.create({ payload: { title } }));
};

const deleteTodo = async (id: string) => {
  await callApiPromise((api) => api.todos.remove({ path: { id } }));
};
```

### Using the Effect client directly

If you need more control (e.g. combining multiple API calls in one Effect), use the `ApiClient` tag directly:

```ts
import { Effect } from "effect";
import { ApiClient } from "@/services/api-client-tag";

const effect = Effect.gen(function* () {
  const api = yield* ApiClient;
  const todos = yield* api.todos.list();
  const first = yield* api.todos.getById({ path: { id: todos[0].id } });
  return first;
});

// Run with the appropriate runtime
const runtime = getRuntime();
const result = await runtime.runPromise(effect);
```

## API Reference

### `makeApiClientTag(api)`

Creates a `Context.Tag` typed from your `HttpApi` contract. The tag's service type is the full `HttpApiClient.Client` shape with typed errors per endpoint.

Both `makeSsrApiClientLayer` and `makeHttpApiClientLayer` provide this tag with different implementations.

### `makeSsrApiClientLayer(api, apiImplLayer, clientTag)`

Creates a `Layer` that provides the `ApiClient` via direct handler invocation. Use this in your server runtime for zero-overhead SSR.

Internally, it builds the full API Layer runtime, extracts the `HttpRouter`, and creates endpoint functions that call route handlers directly — same pipeline (schema decoding, middleware, business logic, response encoding) minus HTTP transport.

### `makeHttpApiClientLayer(api, clientTag, options?)`

Creates a `Layer` that provides the `ApiClient` via HTTP `fetch`. Use this in your client runtime.

Options are passed through to `HttpApiClient.make`:

| Option              | Type                                 | Description                                             |
| ------------------- | ------------------------------------ | ------------------------------------------------------- |
| `baseUrl`           | `string \| URL`                      | Defaults to `window.location.origin` in the browser     |
| `transformClient`   | `(client: HttpClient) => HttpClient` | Transform the underlying HTTP client (e.g. add headers) |
| `transformResponse` | `(effect: Effect) => Effect`         | Transform response effects (e.g. add logging)           |

### `mountApi(api, options)`

Creates a request handler `({ request: Request }) => Promise<Response>` for an Effect HttpApi. Assign it to every HTTP method in your splat route's `server.handlers`.

Options:

| Option          | Type             | Description                            |
| --------------- | ---------------- | -------------------------------------- |
| `serverRuntime` | `ManagedRuntime` | Your server `ManagedRuntime`           |
| `apiLayer`      | `Layer`          | Your composed API implementation Layer |

### `makeCallApiPromise(clientTag, getRuntime)`

Creates a convenience function that resolves the `ApiClient` from the appropriate runtime and runs the effect as a `Promise`. Designed for use in route loaders and event handlers.

```ts
const callApiPromise = makeCallApiPromise(ApiClient, getRuntime);

// Usage — one-liner in a loader
loader: () => callApiPromise((api) => api.todos.list());
```

### `ClientOf<Api>` (type)

Type-level utility that extracts the `HttpApiClient.Client` type from an `HttpApi` definition.

```ts
import type { ClientOf } from "effect-tanstack-start";
type MyClient = ClientOf<typeof ApiContract>;
```

## Tree-shaking and import protection

TanStack Start route files are loaded in both server and client environments. The library relies on TanStack Start's [import protection](https://tanstack.com/router/latest/docs/start/framework/react/guide/import-protection) to keep server code out of the client bundle:

- **`server-runtime.server.ts`** — the `.server.ts` suffix triggers import protection. This file is automatically excluded from the client bundle.
- **`api-client-tag.ts`** — only contains the shared tag. Safe for both environments.
- **`get-runtime.ts`** — statically imports `server-runtime.server.ts`, but import protection mocks it on the client side.
- **`api.$.ts`** — imports `apiHandler` from the `.server.ts` file. Same protection applies.

## Acknowledgements

Inspired by:

- [effect-nextjs](https://github.com/mcrovero/effect-nextjs) — isomorphic runtime pattern for Effect + Next.js
- [effect-query](https://github.com/voidhashcom/effect-query) — Effect integration with TanStack Query
- [better-call](https://github.com/better-auth/better-call) — shares the same core idea: endpoints callable as direct functions or via HTTP, no reason to go through the network when you're already on the server

## License

MIT
