/**
 * Shared ApiClient tag used by both the server and client runtimes.
 *
 * The server runtime provides an in-process implementation (no HTTP round-trip).
 * The client runtime provides an HTTP-based implementation that calls the splat route.
 *
 * Route loaders and components use this tag via whichever runtime is active,
 * so the same loader code works in both SSR and client-side navigation.
 *
 * The derived client preserves full type safety including strongly typed errors
 * (e.g. TodoNotFound, ParseError) from the HttpApi contract — not just success values.
 * Each endpoint method returns Effect<Success, Error, R> with the exact error union
 * defined in the API contract.
 */

import { Context, Effect } from "effect";
import { HttpApiClient } from "@effect/platform";
import { DomainApi } from "@/api/domain-api";

// Helper to derive the client type. This is never called at runtime —
// it only exists so TypeScript can infer the full client type including
// all endpoint methods, success types, and error types.
function _makeClient() {
  return HttpApiClient.make(DomainApi);
}

export type DomainApiClient = Effect.Effect.Success<ReturnType<typeof _makeClient>>;

export class ApiClient extends Context.Tag("ApiClient")<ApiClient, DomainApiClient>() {}
