# WIP: Integrating `effect-tanstack-start` with `effect-query`

This document captures the state of an in-progress design exploration: how should users marry [`effect-query`](https://github.com/voidhashcom/effect-query) with this library to get TanStack Query semantics (caching, refetching, observers) for an Effect-typed `HttpApi` client, without breaking TanStack Router's loader contract.

The integration is **not landed in user-facing docs**. The README points here. Treat the patterns below as candidates, not recommendations.

## Goal

A user with `effect-tanstack-start` set up has:

- An Effect `HttpApi` contract with typed errors per endpoint
- A shared `ApiClient` `Context.Tag`
- An isomorphic `getRuntime()` returning `serverRuntime` / `clientRuntime` (both `ManagedRuntime`)
- A `callApiPromise` helper that runs Effects through that runtime and surfaces tagged errors as thrown sentinels via `throwOnTag`

They now want to use TanStack Query (via `effect-query`) for cached/observable data fetching while preserving:

1. Typed errors at every layer (no `any`, no untyped catches)
2. Correct `notFound()` / `redirect()` propagation from route loaders so SSR returns proper 404 / 3xx
3. Correct cancellation when a user navigates away mid-load
4. Idiomatic Effect style (no native `try`/`catch` if avoidable)

## What `effect-query` provides

From reading `docs/cloned-repos-as-docs/effect-query/`:

- `createEffectQuery(layer)` / `createEffectQueryFromManagedRuntime(runtime)` → an `EffectQuery<Input>` object with `queryOptions`, `mutationOptions`, `infiniteQueryOptions` builders
- The builders accept an Effect-returning function and adapt it to a TanStack Query–compatible options object
- Internally, `EffectQueryRunner.run()` calls `runtime.runPromiseExit(effect, { signal })` and converts the `Exit` to a Promise — successes resolve, failures reject with `EffectQueryFailure<TFailure>`, defects with `EffectQueryDefect`
- `EffectQueryFailure` exposes a `.match({ TagA: ..., TagB: ..., OrElse: ... })` method for typed pattern matching on the wrapped tagged error

Source pointers:

- `packages/effect-query/src/runner.ts:4-25` — runtime bridge
- `packages/effect-query/src/queryOptions.ts:177-248` — queryOptions factory
- `packages/effect-query/src/errors.ts:21-74` — `EffectQueryFailure` / `EffectQueryDefect`

## What works out of the box

These two patterns require **no library changes** and are uncontroversial:

### 1. Isomorphic factory

```ts
// src/runtimes/get-effect-query.ts
import { createEffectQueryFromManagedRuntime } from "effect-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { serverRuntime } from "./server-runtime.server";
import { clientRuntime } from "./client-runtime";

export const getEffectQuery = createIsomorphicFn()
  .server(() => createEffectQueryFromManagedRuntime(serverRuntime))
  .client(() => createEffectQueryFromManagedRuntime(clientRuntime));
```

Both runtimes are `ManagedRuntime`s — exactly what `effect-query` consumes. Pick the right one per environment via `createIsomorphicFn`.

### 2. Components

```tsx
const todosQueryOptions = getEffectQuery().queryOptions({
  queryKey: ["todos"],
  queryFn: () => Effect.flatMap(ApiClient, (api) => api.todos.list()),
});

function Todos() {
  const { data, status, error } = useQuery(todosQueryOptions);
  if (status === "error") {
    return error.match({
      // ...typed handlers per error tag
      OrElse: (cause) => <div>Error: {Cause.pretty(cause)}</div>,
    });
  }
  // ...
}
```

Typed error matching works exactly as `effect-query` advertises.

## Where the tensions live

### Tension 1: Two abort signals in loaders

When a loader uses `queryClient.ensureQueryData`:

- `abortController.signal` on the loader fires on **navigation away mid-load**
- The `signal` TanStack Query passes to `queryFn` fires on **query cancellation** (observer cleanup, refetch supersession)

These are independent. Forwarding only one loses cancellation on the other path. The fix is straightforward: combine with `AbortSignal.any([routeSignal, queryFnSignal])` inside whatever ends up being the queryFn. Not really a tension — just a footgun if forgotten.

### Tension 2: Router sentinels through wrapped errors

This is the real problem.

TanStack Router detects loader sentinels by **runtime shape**, not by class:

- `notFound()` — `isNotFound(obj) = !!obj?.isNotFound` — see `router/packages/router-core/src/not-found.ts:39-41`
- `redirect()` — `isRedirect(obj) = obj instanceof Response && !!obj.options` — see `router/packages/router-core/src/redirect.ts:159-161`

Both are detected when **thrown from a loader** (or from something a loader awaits and the throw bubbles unchanged).

`effect-query` wraps every queryFn failure in `EffectQueryFailure`. So if a queryFn does `throw notFound()`, what surfaces from `ensureQueryData` is an `EffectQueryFailure` instance whose `.failure` is the `notFound()` object — neither `isNotFound` nor `isRedirect` returns true on the wrapper.

The router docs consistently show sentinels being thrown **from the loader itself**, after data is fetched:

> "You can manually throw not-found errors in loader methods and components using the `notFound` utility."  
> — `router/docs/router/guide/not-found-errors.md:145`

The `external-data-loading` guide shows `loader: () => queryClient.ensureQueryData(opts)` but **never shows throwing sentinels from inside a queryFn**. That absence is meaningful — it's not the documented path.

So: if we want `notFound()` to surface to the router from a loader that uses `ensureQueryData`, _something_ has to translate "EffectQueryFailure wrapping a tagged error" into "thrown sentinel" between `ensureQueryData`'s rejection and the loader's return.

## Approaches considered

### Approach A — `callApiPromise` as the queryFn

Skip `effect-query`'s wrapping for the loader path. Use the existing `callApiPromise` (which already does Effect-native tag→sentinel mapping via `Cause.failureOption` + `throwOnTag`) directly inside the queryFn.

```ts
loader: ({ params, abortController, context }) =>
  context.queryClient.ensureQueryData({
    queryKey: ["todos", params.id],
    queryFn: ({ signal }) =>
      callApiPromise((api) => api.todos.getById({ path: { id: params.id } }), {
        signal: AbortSignal.any([signal, abortController.signal]),
      }),
  }),
```

**Pros**

- No `EffectQueryFailure` in the loader path, so `notFound()` thrown by `callApiPromise` propagates clean through `ensureQueryData` to the router
- No `try`/`catch`
- Tag mapping configured once on the `callApiPromise` factory
- Component-side `useQuery(sameQueryOptions)` still reads the cache via the shared `queryKey`

**Cons**

- Mixes two idioms in the same conceptual unit (effect-query for components, callApiPromise for loaders) — a user reasonably asks "if I'm using effect-query, why am I also using callApiPromise?"
- The component-side `queryOptions` defines a queryFn that _won't run_ during initial load (the loader populated the cache via a different queryFn). That queryFn only executes on background refetch. Subtle, easy to confuse a reader.

### Approach B — `try`/`catch` + `EffectQueryFailure.match()` in the loader

Keep effect-query everywhere. Unwrap the failure in the loader.

```ts
loader: async ({ params, abortController, context }) => {
  const options = todoQueryOptions(params.id);
  try {
    return await context.queryClient.ensureQueryData({
      ...options,
      queryFn: (ctx) =>
        options.queryFn!({
          ...ctx,
          signal: AbortSignal.any([ctx.signal, abortController.signal]),
        }),
    });
  } catch (e) {
    if (e instanceof EffectQueryFailure) {
      throw e.match({
        TodoNotFound: () => notFound(),
        OrElse: () => e,
      });
    }
    throw e;
  }
},
```

**Pros**

- Single idiom (effect-query) for both loader and component
- Works correctly — sentinels surface as required
- Uses `effect-query`'s own typed `.match()` for tag dispatch

**Cons**

- Native `try`/`catch` in user code, which the maintainer wants to avoid for stylistic / Effect-idiom reasons
- Per-loader boilerplate for signal merging and error unwrapping — repeats across every loader using a query

### Approach C — A library helper (`makeEnsureApiQueryData`)

Move the try/catch + signal merging + tag mapping into a helper that mirrors `callApiPromise`'s factory shape.

```ts
const ensureApiQueryData = makeEnsureApiQueryData(ApiClient, {
  throwOnTag: { TodoNotFound: () => notFound() },
});

loader: ({ params, abortController, context }) =>
  ensureApiQueryData(context.queryClient, todoQueryOptions(params.id), {
    signal: abortController.signal,
  });
```

Type safety: factory `throwOnTag` constrained to `AllClientErrors<TagService>`; per-call `throwOnTag` constrained to the specific query's `TFailure` tag union; phantom client tag for inference (same trick as `makeCallApiPromise`).

**Pros**

- Zero per-loader boilerplate
- Type-safe end to end
- Familiar shape — mirrors `callApiPromise`

**Cons**

- Adds API surface to a library whose stated value is "thin glue, mostly docs"
- The helper is essentially `try`/`catch` in a trench coat — solves the symptom (visible try/catch) without changing the underlying mechanism
- One more thing to maintain, document, version

## Where we are

Maintainer position (current):

- Approach A is fine technically but conceptually awkward
- Approach B is correct but has un-Effect-y `try`/`catch`
- Approach C is ugly and grows the API surface — the library's value is in instructing users on how to compose existing tools, not in shipping more helpers
- Preference is to keep `try`/`catch` over a helper if helpers are the alternative
- This doc is the holding pattern until a cleaner answer surfaces

## Open questions

1. Is there an Effect-native pattern that bridges "Promise that rejects with a wrapper" → "thrown sentinel" without `try`/`catch` and without a custom helper? `Effect.tryPromise` + `Effect.catchTag` runs into the boundary problem: throwing inside an Effect produces a defect, and `runPromise` rejects with `FiberFailure` — the router's property/instance checks don't pierce that.
2. Should `effect-query` itself expose an "unwrapped" variant of its queryFn — i.e., re-throw the inner failure raw rather than wrapping in `EffectQueryFailure`? That would be a change upstream, not here. Worth raising with the `effect-query` maintainers.
3. If we accept Approach A, is there a way to phrase the `queryOptions` once such that the same definition is used by both loader and component, with the tag-mapping concern lifted out? Today the loader writes a queryFn that calls `callApiPromise`, and the component writes one that uses an Effect — different functions for the same key.
4. Is there value in making `callApiPromise` aware of `EffectQueryFailure` (i.e., if it sees one in a thrown error, unwrap and apply `throwOnTag` to the inner failure)? That would let `try { await ensureQueryData(opts) } catch (e) { rethrow(e) }` collapse to a one-line wrapper without growing the public API.

## Reference material in this repo

- `docs/cloned-repos-as-docs/effect-query/` — vendored source
- `docs/cloned-repos-as-docs/router/docs/router/guide/not-found-errors.md`
- `docs/cloned-repos-as-docs/router/docs/router/guide/external-data-loading.md`
- `docs/cloned-repos-as-docs/router/packages/router-core/src/not-found.ts:39-41` — sentinel detection
- `docs/cloned-repos-as-docs/router/packages/router-core/src/redirect.ts:159-161` — sentinel detection
- `packages/core/src/call-api-promise.ts` — existing throwOnTag pattern this doc keeps comparing to
