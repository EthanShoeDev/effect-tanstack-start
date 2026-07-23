---
"effect-tanstack-start": patch
---

Bump `effect` peer/dev dependency to `4.0.0-beta.101` (from `4.0.0-beta.68`) and update the `effect` peer range floor to match (`>=4.0.0-beta.101 <5.0.0`).

Effect v4 beta.101 removed the `HttpApiGroup.Any`/`HttpApiEndpoint.AnyWithProps`-style generic bounds in favor of `Constraint` (for generic type parameter bounds) and `Top` (for widened-but-concrete instance types). This release updates all internal usages accordingly:

- `makeApiClientTag`, `makeHttpApiClientLayer`, `mountApi`, and `makeSsrApiClientLayer` now bound their `Groups` type parameter with `HttpApiGroup.Constraint` instead of the removed `HttpApiGroup.Any`.
- The internal `ClientOf<Groups>` helper now takes the endpoint-group union directly (`Groups extends HttpApiGroup.Constraint`) instead of unwrapping it from an `HttpApi<Id, Groups>` type, since embedding an abstract `Groups` inside a nested `HttpApi<...>` type argument no longer type-checks against beta.101's now-invariant `HttpApi` group parameter.
- `ssr-api-client.ts`'s internal `HttpApi.reflect` usage now casts to `HttpApi.Top` and reads `HttpApiEndpoint.Top`/`HttpApiGroup.Top`, and endpoint identifiers are read via `.identifier` (beta.101 renamed `HttpApiEndpoint`'s `name` field to `identifier`, matching `HttpApiGroup`).

No public API or behavior changes — this is purely internal-typing churn to track the upstream beta. Consumers on `effect@4.0.0-beta.101` (the exact version required by beta.101-pinned monorepos) can now typecheck against this package again.
