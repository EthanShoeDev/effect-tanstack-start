/**
 * Type helpers for deriving the full HttpApiClient type from an HttpApi definition.
 * @internal
 */

import type { HttpApi, HttpApiClient, HttpApiGroup } from "@effect/platform";

/**
 * Derives the full typed client from an HttpApi definition.
 * Preserves strongly typed errors (e.g. TodoNotFound) per endpoint.
 */
export type ClientOf<Api extends HttpApi.HttpApi<string, HttpApiGroup.HttpApiGroup.Any, any, any>> =
  Api extends HttpApi.HttpApi<infer _Id, infer Groups, infer E, infer _R>
    ? HttpApiClient.Client<Groups, E, never>
    : never;
