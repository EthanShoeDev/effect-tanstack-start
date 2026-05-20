# effect-tanstack-start

## 1.0.0-beta.0

### Major Changes

- [`87cceaa`](https://github.com/EthanShoeDev/effect-tanstack-start/commit/87cceaa51b7069eb78b2d79551719ca7ea32420e) Thanks [@EthanShoeDev](https://github.com/EthanShoeDev)! - Effect v4 compatibility (1.0.0-beta.0)

  This is the first major release of `effect-tanstack-start` and tracks Effect v4 (currently in beta as `effect@4.0.0-beta.*`). The `0.x` line continues to be maintained on `main` for Effect v3.

  **Breaking changes:**
  - **Peer dependencies:** drop `@effect/platform` (consolidated into `effect/unstable/*` in v4); bump `effect` peer to `>=4.0.0-beta.0 <5.0.0`.
  - **Imports:** all `@effect/platform` imports move under `effect/unstable/*` — primarily `effect/unstable/httpapi` (HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiBuilder, HttpApiMiddleware, HttpApiSecurity, HttpApiClient) and `effect/unstable/http` (HttpRouter, HttpServerRequest, HttpServerResponse, HttpClient, FetchHttpClient).
  - **`makeApiClientTag`** now returns a `Context.Service<...>` (Effect v4) instead of `Context.Tag<...>` (Effect v3). Internally it calls `Context.Service` instead of `Context.GenericTag`.
  - **`mountApi`** now expects the user's `apiLayer` to be the composed v4 layer: `HttpApiBuilder.layer(api)` provided with each group layer via `Layer.provideMerge` (v3's `HttpApiBuilder.api(...)` is gone). Internally `mountApi` uses `HttpRouter.toWebHandler` instead of `HttpApp.toWebHandlerRuntime`.
  - **`makeSsrApiClientLayer`** updated for v4: reads per-group `{ routes }` entries directly from the built layer context (the v4 group layer stores them by `group.key`), provides the minimal request context (`HttpServerRequest`, `HttpRouter.RouteContext`, `HttpServerRequest.ParsedSearchParams`) to each route handler, and extracts the body without re-serialising through HTTP.
  - **`makeCallApiPromise`** — when no `throwOnTag` handler matches, the library now throws `Cause.squash(cause)` (typically the underlying error object) instead of the v3 `Runtime.FiberFailure` wrapper. Effect v4 removed `Runtime.makeFiberFailure`.

  **Call-site changes users will see:**
  - Endpoint path parameters are passed as `{ params }` instead of `{ path }`.
  - Endpoint query string parameters are passed as `{ query }` instead of `{ urlParams }`.
  - `Schema.TaggedError` becomes `Schema.TaggedErrorClass`. Status codes are passed as `{ httpApiStatus: 404 }` in the annotations slot instead of `HttpApiSchema.annotations({ status: 404 })`.
  - `Context.Tag` services become `Context.Service`.
  - `Effect.catchAll` is now `Effect.catch`.
  - **`throwOnTag` handlers receive a plain tagged object, not a class instance.** v4's HttpApiBuilder encodes endpoint errors into the response body and the SSR client re-decodes them, so the handler argument has the right `_tag` and fields but `error instanceof TodoNotFound` is now `false`. Dispatch on `error._tag` (or read the fields directly) instead of using `instanceof` or methods defined on the error class.

  See the updated `README.md` for the full v4 setup walkthrough, and the example app (`apps/example/`) for a complete migrated reference.

## 0.2.0

### Minor Changes

- [`47c7afb`](https://github.com/EthanShoeDev/effect-tanstack-start/commit/47c7afb9553afb03c92b4db7304946623e5cf39d) Thanks [@EthanShoeDev](https://github.com/EthanShoeDev)! - Add optional `signal` support and rename `catchTags` to `throwOnTag`
  - `callApiPromise` now accepts `signal?: AbortSignal` in its options, passed through to Effect's `runPromiseExit` to interrupt the fiber on abort. Enables TanStack Router loaders to forward `abortController.signal`, so in-flight API calls are cancelled on navigation.
  - **Breaking:** Rename `catchTags` to `throwOnTag` (both global and per-call). The old name implied errors were caught/swallowed, but the handlers actually return values that get **thrown** for TanStack Router to intercept (e.g. `notFound()`, `redirect()`).

## 0.1.0

### Minor Changes

- [#1](https://github.com/EthanShoeDev/effect-tanstack-start/pull/1) [`0f39830`](https://github.com/EthanShoeDev/effect-tanstack-start/commit/0f3983091f6847d42bb1d97378f5908d5bd3dcba) Thanks [@EthanShoeDev](https://github.com/EthanShoeDev)! - Add typesafe error mapping via `catchTags` option in `makeCallApiPromise`
  - `makeCallApiPromise` now accepts a `catchTags` option that maps Effect error `_tag` values to TanStack Router signals (e.g. `notFound()`, `redirect()`), with full
    type safety and autocomplete.

  - Global defaults can be set at factory time; per-call overrides take priority.
  - Internally switches to `runPromiseExit` for clean error extraction (not a breaking change — unhandled errors still throw `FiberFailure`).
  - New type utilities exported from `effect-tanstack-start/client`: `AllClientErrors`, `ClientErrorTags`, `ClientErrorByTag`.
