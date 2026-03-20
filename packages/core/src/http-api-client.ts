/**
 * Creates a Layer providing the ApiClient tag via HTTP (for client-side runtime).
 * Uses HttpApiClient.make + FetchHttpClient under the hood.
 */

import { Context, Effect, Layer } from "effect";
import {
  FetchHttpClient,
  HttpApiClient,
  HttpClient,
  type HttpApi,
  type HttpApiGroup,
} from "@effect/platform";

/**
 * Create a Layer that provides the ApiClient via HTTP fetch.
 * Use this in the client-side runtime for browser navigation.
 *
 * All options from `HttpApiClient.make` (e.g. `transformClient`, `transformResponse`)
 * are passed through. The `baseUrl` defaults to `window.location.origin` in the browser.
 *
 * @param api - Your HttpApi contract definition
 * @param clientTag - The ApiClient tag (from makeApiClientTag)
 * @param options - Options forwarded to HttpApiClient.make
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
  options?: {
    readonly baseUrl?: URL | string | undefined;
    readonly transformClient?:
      | ((client: HttpClient.HttpClient) => HttpClient.HttpClient)
      | undefined;
    readonly transformResponse?:
      | ((effect: Effect.Effect<unknown, unknown>) => Effect.Effect<unknown, unknown>)
      | undefined;
  },
): Layer.Layer<Context.Tag.Identifier<ClientTag>> {
  const baseUrl =
    options?.baseUrl?.toString() ??
    (typeof globalThis !== "undefined" && "location" in globalThis
      ? (globalThis as any).location.origin
      : "http://localhost:3000");

  return Layer.effect(
    clientTag,
    Effect.gen(function* () {
      return (yield* HttpApiClient.make(api, {
        ...options,
        baseUrl,
      })) as Context.Tag.Service<ClientTag>;
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer)) as Layer.Layer<Context.Tag.Identifier<ClientTag>>;
}
