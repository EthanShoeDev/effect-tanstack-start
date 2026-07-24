# effect-tanstack-start

## 1.0.0-beta.3

### Patch Changes

- [`a2eca73`](https://github.com/EthanShoeDev/effect-tanstack-start/commit/a2eca73e88686575f4de84dfa853247a6522e5a8) Thanks [@EthanShoeDev](https://github.com/EthanShoeDev)! - Fix `makeSsrApiClientLayer` failing to typecheck against `@tanstack/react-start@1.163+`.

  TanStack Start 1.163 adopted [`fetchdts`](https://github.com/hi-ogawa/fetchdts) typed headers, changing `getRequestHeaders()`'s return type from a plain header record to `TypedHeaders<RequestHeaderMap>`. `ssr-api-client.ts`'s internal `getForwardedHeaders` cast that value directly to `Record<string, string>`, which no longer typechecks — `TypedHeaders` has no string index signature, so the two types don't sufficiently overlap:

  ```
  error TS2352: Conversion of type 'TypedHeaders<RequestHeaderMap>' to type
  'Record<string, string>' may be a mistake because neither type sufficiently
  overlaps with the other. Index signature for type 'string' is missing in type
  'TypedHeaders<RequestHeaderMap>'.
  ```

  This surfaced in any consumer importing `effect-tanstack-start/server` (the `/client` entrypoint is unaffected) while on a recent `@tanstack/react-start`.

  Fix: route the cast through `unknown`. Type-only change — `getRequestHeaders()` still returns the same plain object at runtime, and the `instanceof Headers` branch that handles the real `Headers` case is untouched.

## 1.0.0-beta.2

### Patch Changes

- [`5eff82f`](https://github.com/EthanShoeDev/effect-tanstack-start/commit/5eff82f3d95252db90e8632e0ca36feb079e3e76) Thanks [@EthanShoeDev](https://github.com/EthanShoeDev)! - Fix `mountApi` rejecting real API implementation layers under `effect@4.0.0-beta.101`.

  `mountApi`'s `MountApiOptions.apiLayer` (and `serverRuntime`) were typed as `Layer.Layer<any, any, any>` / `ManagedRuntime.ManagedRuntime<any, any>` to sidestep `Layer`/`ManagedRuntime`'s variance annotations. Under beta.101, `Layer`'s `ROut` and `ManagedRuntime`'s `R` are explicitly contravariant (`in`), and comparing a concrete layer/runtime whose `ROut`/`R` is `never` — the normal shape for a fully-composed, self-contained layer, e.g. plain `HttpApiBuilder.layer(api)` before any `Layer.provideMerge`, or any `ManagedRuntime.make` over a fully-provided layer — against the fixed `any` in these fields now fails to typecheck ("Type 'any' is not assignable to type 'never'"). This affects any `apiLayer`/`serverRuntime` shaped this way, not just ones with unusual requirements.

  Fix: `MountApiOptions` and `mountApi` are now properly generic (`MountApiOptions<R, ER, ImplOut, ImplErr, ImplIn>`), inferring the real type parameters from the caller's arguments instead of erasing them to `any` — the same pattern `makeSsrApiClientLayer` already used for its `apiImplLayer` parameter. No behavior change; this is a type-only fix.

  Also adds `ClientOfApi<Api>`, exported from `effect-tanstack-start/client`: derives the typed client directly from an `HttpApi` contract type (e.g. `ClientOfApi<typeof ApiContract>`) instead of requiring callers to manually extract the group union first via `Api extends HttpApi.HttpApi<string, infer Groups> ? Groups : never` before passing it to `ClientOf<Groups>`.

## 1.0.0-beta.1

### Patch Changes

- [`d02dc98`](https://github.com/EthanShoeDev/effect-tanstack-start/commit/d02dc9861f0bb8bb566c5d0d1be6d411923c1848) Thanks [@EthanShoeDev](https://github.com/EthanShoeDev)! - Bump `effect` peer/dev dependency to `4.0.0-beta.101` (from `4.0.0-beta.68`) and update the `effect` peer range floor to match (`>=4.0.0-beta.101 <5.0.0`).

  Effect v4 beta.101 removed the `HttpApiGroup.Any`/`HttpApiEndpoint.AnyWithProps`-style generic bounds in favor of `Constraint` (for generic type parameter bounds) and `Top` (for widened-but-concrete instance types). This release updates all internal usages accordingly:
  - `makeApiClientTag`, `makeHttpApiClientLayer`, `mountApi`, and `makeSsrApiClientLayer` now bound their `Groups` type parameter with `HttpApiGroup.Constraint` instead of the removed `HttpApiGroup.Any`.
  - The internal `ClientOf<Groups>` helper now takes the endpoint-group union directly (`Groups extends HttpApiGroup.Constraint`) instead of unwrapping it from an `HttpApi<Id, Groups>` type, since embedding an abstract `Groups` inside a nested `HttpApi<...>` type argument no longer type-checks against beta.101's now-invariant `HttpApi` group parameter.
  - `ssr-api-client.ts`'s internal `HttpApi.reflect` usage now casts to `HttpApi.Top` and reads `HttpApiEndpoint.Top`/`HttpApiGroup.Top`, and endpoint identifiers are read via `.identifier` (beta.101 renamed `HttpApiEndpoint`'s `name` field to `identifier`, matching `HttpApiGroup`).

  No public API or behavior changes — this is purely internal-typing churn to track the upstream beta. Consumers on `effect@4.0.0-beta.101` (the exact version required by beta.101-pinned monorepos) can now typecheck against this package again.

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
