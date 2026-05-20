/**
 * Creates a shared Context.Service key for the API client.
 *
 * Both the SSR and HTTP client layers fulfill this same key.
 * The typed client preserves strongly typed errors per endpoint.
 */

import { Context } from "effect";
import type { HttpApi, HttpApiGroup } from "effect/unstable/httpapi";
import type { ClientOf } from "./internal/types.js";

/**
 * Create a typed ApiClient Context.Service key from an HttpApi definition.
 *
 * The service shape is the full HttpApiClient.Client derived from the contract,
 * including all endpoint methods with typed errors.
 *
 * @param api - Your HttpApi contract definition
 * @returns A Context.Service key for the typed API client
 *
 * @example
 * ```ts
 * import { makeApiClientTag } from "effect-tanstack-start/client"
 * import { ApiContract } from "./api/api-contract"
 *
 * export const ApiClient = makeApiClientTag(ApiContract)
 * ```
 */
export function makeApiClientTag<ApiId extends string, Groups extends HttpApiGroup.Any>(
  api: HttpApi.HttpApi<ApiId, Groups>,
): Context.Service<
  `effect-tanstack-start/ApiClient/${ApiId}`,
  ClientOf<HttpApi.HttpApi<ApiId, Groups>>
> {
  return Context.Service<
    `effect-tanstack-start/ApiClient/${ApiId}`,
    ClientOf<HttpApi.HttpApi<ApiId, Groups>>
  >(`effect-tanstack-start/ApiClient/${api.identifier}`);
}
