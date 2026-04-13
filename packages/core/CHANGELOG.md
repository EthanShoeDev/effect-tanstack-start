# effect-tanstack-start

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
