/**
 * Creates a shared Context.Tag for the API client.
 *
 * Both the SSR and HTTP client layers fulfill this same tag.
 * The typed client preserves strongly typed errors per endpoint.
 */

import { Context } from "effect";
import type { HttpApi, HttpApiGroup } from "@effect/platform";
import type { ClientOf } from "./internal/types.js";

/**
 * Create a typed ApiClient Context.Tag from an HttpApi definition.
 *
 * The tag's service type is the full HttpApiClient.Client shape derived
 * from the contract, including all endpoint methods with typed errors.
 *
 * @param api - Your HttpApi contract definition
 * @returns A Context.Tag for the typed API client
 *
 * @example
 * ```ts
 * import { makeApiClientTag } from "effect-tanstack-start"
 * import { ApiContract } from "./api/api-contract"
 *
 * export const ApiClient = makeApiClientTag(ApiContract)
 * ```
 */
export function makeApiClientTag<
  ApiId extends string,
  Groups extends HttpApiGroup.HttpApiGroup.Any,
  ApiError,
  ApiR,
>(
  api: HttpApi.HttpApi<ApiId, Groups, ApiError, ApiR>,
): Context.Tag<
  `effect-tanstack-start/ApiClient/${ApiId}`,
  ClientOf<HttpApi.HttpApi<ApiId, Groups, ApiError, ApiR>>
> {
  return Context.GenericTag(`effect-tanstack-start/ApiClient/${api.identifier}`);
}
