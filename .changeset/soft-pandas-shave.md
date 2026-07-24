---
"effect-tanstack-start": patch
---

Fix `makeSsrApiClientLayer` failing to typecheck against `@tanstack/react-start@1.163+`.

TanStack Start 1.163 adopted [`fetchdts`](https://github.com/hi-ogawa/fetchdts) typed headers, changing `getRequestHeaders()`'s return type from a plain header record to `TypedHeaders<RequestHeaderMap>`. `ssr-api-client.ts`'s internal `getForwardedHeaders` cast that value directly to `Record<string, string>`, which no longer typechecks — `TypedHeaders` has no string index signature, so the two types don't sufficiently overlap:

```
error TS2352: Conversion of type 'TypedHeaders<RequestHeaderMap>' to type
'Record<string, string>' may be a mistake because neither type sufficiently
overlaps with the other. Index signature for type 'string' is missing in type
'TypedHeaders<RequestHeaderMap>'.
```

This surfaced in any consumer importing `effect-tanstack-start/server` (the `/client` entrypoint is unaffected) while on a recent `@tanstack/react-start`.

Fix: route the cast through `unknown`. Type-only change — `getRequestHeaders()` still returns the same plain object at runtime, and the `instanceof Headers` branch that handles the real `Headers` case is untouched.
