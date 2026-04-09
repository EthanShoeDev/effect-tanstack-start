# Changelog

## Unreleased

### Features

- **Typesafe error mapping via `catchTags`** — `makeCallApiPromise` now accepts a `catchTags` option that maps Effect error `_tag` values to TanStack Router signals like `notFound()` and `redirect()`, with full type safety and autocomplete.

  **Global defaults** (at factory time) — keys autocompleted from all API error tags:

  ```ts
  import { notFound } from "@tanstack/react-router";

  export const callApiPromise = makeCallApiPromise(ApiClient, getRuntime, {
    catchTags: {
      TodoNotFound: () => notFound(),
    },
  });

  // TodoNotFound is automatically caught — one-liner loaders:
  loader: ({ params }) =>
    callApiPromise((api) => api.todos.getById({ path: { id: params.id } })),
  ```

  **Per-call overrides** — keys constrained to the specific endpoint's error types:

  ```ts
  const session = await callApiPromise((api) => api.auth.me(), {
    catchTags: { Unauthorized: () => redirect({ to: "/login" }) },
  });
  ```

  Per-call handlers take priority over global defaults. Unhandled errors still throw `FiberFailure` as before.

- **New type utilities** — `AllClientErrors<C>`, `ClientErrorTags<C>`, and `ClientErrorByTag<C, Tag>` exported from `effect-tanstack-start/client` for extracting error types from the API client shape.

- **Example app: todo detail route** — Added `/todos/$id` route demonstrating `notFound()` mapping with `notFoundComponent`.

### Changed

- `callApiPromise` now uses `runPromiseExit` internally instead of `runPromise` for clean error extraction. This is not a breaking change — unhandled errors still throw `FiberFailure`.

## 0.0.1

Initial release.
