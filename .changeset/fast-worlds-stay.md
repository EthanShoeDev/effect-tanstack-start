---
"effect-tanstack-start": minor
---

Add optional `signal` support and rename `catchTags` to `throwOnTag`

- `callApiPromise` now accepts `signal?: AbortSignal` in its options, passed through to Effect's `runPromiseExit` to interrupt the fiber on abort. Enables TanStack Router loaders to forward `abortController.signal`, so in-flight API calls are cancelled on navigation.
- **Breaking:** Rename `catchTags` to `throwOnTag` (both global and per-call). The old name implied errors were caught/swallowed, but the handlers actually return values that get **thrown** for TanStack Router to intercept (e.g. `notFound()`, `redirect()`).
