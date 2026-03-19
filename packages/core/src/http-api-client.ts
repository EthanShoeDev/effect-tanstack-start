/**
 * Creates a Layer providing the ApiClient tag via HTTP (for client-side runtime).
 * Uses HttpApiClient.make + FetchHttpClient under the hood.
 */

import { Context, Effect, Layer } from "effect";
import { FetchHttpClient, HttpApiClient, type HttpApi, type HttpApiGroup } from "@effect/platform";

/**
 * Create a Layer that provides the ApiClient via HTTP fetch.
 * Use this in the client-side runtime for browser navigation.
 *
 * @param api - Your HttpApi contract definition
 * @param clientTag - The ApiClient tag (from makeApiClientTag)
 * @param options - Optional base URL override
 *
 * @example
 * ```ts
 * const HttpApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient)
 * ```
 */
export function makeHttpApiClientLayer<
  ApiId extends string,
  Groups extends HttpApiGroup.HttpApiGroup.Any,
  ApiError,
  ApiR,
  ClientTag extends Context.Tag<any, any>,
>(
  api: HttpApi.HttpApi<ApiId, Groups, ApiError, ApiR>,
  clientTag: ClientTag,
  options?: { baseUrl?: string | URL },
): Layer.Layer<Context.Tag.Identifier<ClientTag>> {
  const baseUrl =
    options?.baseUrl?.toString() ??
    (typeof globalThis !== "undefined" && "location" in globalThis
      ? (globalThis as any).location.origin
      : "http://localhost:3000");

  return Layer.effect(
    clientTag,
    Effect.gen(function* () {
      return (yield* HttpApiClient.make(api, { baseUrl })) as Context.Tag.Service<ClientTag>;
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer)) as Layer.Layer<Context.Tag.Identifier<ClientTag>>;
}
