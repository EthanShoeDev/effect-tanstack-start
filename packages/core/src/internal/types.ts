/**
 * Type helpers for deriving the full HttpApiClient type from an HttpApi definition.
 * @internal
 */

import type { Effect } from "effect";
import type { HttpApi, HttpApiClient, HttpApiGroup } from "effect/unstable/httpapi";

/**
 * Derives the full typed client from an HttpApi definition.
 * Preserves strongly typed errors (e.g. TodoNotFound) per endpoint.
 */
export type ClientOf<Api extends HttpApi.HttpApi<string, HttpApiGroup.Any>> =
  Api extends HttpApi.HttpApi<infer _Id, infer Groups>
    ? HttpApiClient.Client<Groups, never, never>
    : never;

// ── Error extraction from Client shape ────────────────────────────────

/** Extract the error type from a single endpoint method. */
type MethodError<M> = M extends (...args: Array<any>) => Effect.Effect<any, infer E, any>
  ? E
  : never;

/** Union of all error types across all methods in a group (or top-level methods). */
type GroupErrors<G> = { [K in keyof G]: MethodError<G[K]> }[keyof G];

/**
 * Union of every error type across all groups and endpoints in a Client.
 *
 * Includes both domain errors (e.g. `TodoNotFound`) and infrastructure
 * errors (e.g. `HttpClientError`, `ParseError`).
 */
export type AllClientErrors<C> = { [G in keyof C]: GroupErrors<C[G]> }[keyof C];

/**
 * Union of `_tag` string literals for all tagged errors in a Client.
 *
 * Useful for constraining `throwOnTag` keys at the global registration level.
 */
export type ClientErrorTags<C> = Extract<AllClientErrors<C>, { readonly _tag: string }>["_tag"];

/**
 * Extract the specific error type for a given `_tag` from a Client.
 */
export type ClientErrorByTag<C, Tag extends string> = Extract<
  AllClientErrors<C>,
  { readonly _tag: Tag }
>;
