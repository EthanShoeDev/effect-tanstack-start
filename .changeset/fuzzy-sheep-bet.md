---
"effect-tanstack-start": minor
---

Add typesafe error mapping via `catchTags` option in `makeCallApiPromise`

- `makeCallApiPromise` now accepts a `catchTags` option that maps Effect error `_tag` values to TanStack Router signals (e.g. `notFound()`, `redirect()`), with full  
  type safety and autocomplete.

- Global defaults can be set at factory time; per-call overrides take priority.
- Internally switches to `runPromiseExit` for clean error extraction (not a breaking change — unhandled errors still throw `FiberFailure`).
- New type utilities exported from `effect-tanstack-start/client`: `AllClientErrors`, `ClientErrorTags`, `ClientErrorByTag`.
