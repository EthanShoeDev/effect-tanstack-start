---
"effect-tanstack-start": patch
---

Fix `mountApi` rejecting real API implementation layers under `effect@4.0.0-beta.101`.

`mountApi`'s `MountApiOptions.apiLayer` (and `serverRuntime`) were typed as `Layer.Layer<any, any, any>` / `ManagedRuntime.ManagedRuntime<any, any>` to sidestep `Layer`/`ManagedRuntime`'s variance annotations. Under beta.101, `Layer`'s `ROut` and `ManagedRuntime`'s `R` are explicitly contravariant (`in`), and comparing a concrete layer/runtime whose `ROut`/`R` is `never` — the normal shape for a fully-composed, self-contained layer, e.g. plain `HttpApiBuilder.layer(api)` before any `Layer.provideMerge`, or any `ManagedRuntime.make` over a fully-provided layer — against the fixed `any` in these fields now fails to typecheck ("Type 'any' is not assignable to type 'never'"). This affects any `apiLayer`/`serverRuntime` shaped this way, not just ones with unusual requirements.

Fix: `MountApiOptions` and `mountApi` are now properly generic (`MountApiOptions<R, ER, ImplOut, ImplErr, ImplIn>`), inferring the real type parameters from the caller's arguments instead of erasing them to `any` — the same pattern `makeSsrApiClientLayer` already used for its `apiImplLayer` parameter. No behavior change; this is a type-only fix.

Also adds `ClientOfApi<Api>`, exported from `effect-tanstack-start/client`: derives the typed client directly from an `HttpApi` contract type (e.g. `ClientOfApi<typeof ApiContract>`) instead of requiring callers to manually extract the group union first via `Api extends HttpApi.HttpApi<string, infer Groups> ? Groups : never` before passing it to `ClientOf<Groups>`.
