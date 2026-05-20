/**
 * Creates a Layer providing the ApiClient key via HTTP (for client-side runtime).
 * Uses HttpApiClient.make + FetchHttpClient under the hood.
 */

import { type Context, Effect, Layer } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { FetchHttpClient } from "effect/unstable/http";
import type { HttpApi, HttpApiGroup } from "effect/unstable/httpapi";
import { HttpApiClient } from "effect/unstable/httpapi";

/**
 * Create a Layer that provides the ApiClient via HTTP fetch.
 * Use this in the client-side runtime for browser navigation.
 *
 * All options from `HttpApiClient.make` (e.g. `transformClient`, `transformResponse`)
 * are passed through. The `baseUrl` defaults to `window.location.origin` in the browser.
 *
 * @param api - Your HttpApi contract definition
 * @param clientTag - The ApiClient key (from makeApiClientTag)
 * @param options - Options forwarded to HttpApiClient.make
 *
 * @example
 * ```ts
 * const HttpApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient)
 * ```
 */
export function makeHttpApiClientLayer<
  ApiId extends string,
  Groups extends HttpApiGroup.Any,
  ClientTag extends Context.Service<any, any>,
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  clientTag: ClientTag,
  options?: {
    readonly baseUrl?: URL | string | undefined;
    readonly transformClient?:
      | ((client: HttpClient.HttpClient) => HttpClient.HttpClient)
      | undefined;
    readonly transformResponse?:
      | ((
          effect: Effect.Effect<unknown, unknown, unknown>,
        ) => Effect.Effect<unknown, unknown, unknown>)
      | undefined;
  },
): Layer.Layer<Context.Service.Identifier<ClientTag>> {
  const baseUrl =
    options?.baseUrl?.toString() ??
    (typeof globalThis !== "undefined" && "location" in globalThis
      ? (globalThis as unknown as { readonly location: { readonly origin: string } }).location
          .origin
      : "http://localhost:3000");

  return Layer.effect(clientTag)(
    Effect.gen(function* () {
      return (yield* HttpApiClient.make(api, {
        ...options,
        baseUrl,
      })) as Context.Service.Shape<ClientTag>;
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer)) as Layer.Layer<
    Context.Service.Identifier<ClientTag>
  >;
}
