/**
 * SSR ApiClient: web-handler approach.
 *
 * Uses HttpApiClient.makeWith with a custom HttpClient that calls the
 * toWebHandler function directly in-process (no network). This is the
 * simplest correct approach.
 *
 * What makes this different from the other approaches:
 * - Uses HttpApiBuilder.toWebHandler which creates its OWN internal runtime
 *   and scope, separate from the caller
 * - The full HTTP pipeline runs: URL routing, request body
 *   serialization/deserialization, middleware, response encoding
 * - The custom HttpClient constructs a web Request object and passes it
 *   to the handler. new Request() is NOT a network call — it's just
 *   constructing a JS object — but the handler still parses the URL,
 *   deserializes the body, runs through the router, etc.
 *
 * Overhead: URL parsing, JSON body serialize/deserialize, router matching,
 *           response encoding, separate runtime/scope creation.
 * Middleware: Runs fully.
 * Correctness: Guaranteed — identical to a real HTTP call.
 */

import { Effect, Layer } from "effect";
import {
  HttpApiBuilder,
  HttpApiClient,
  HttpClient,
  HttpClientResponse,
  HttpServer,
} from "@effect/platform";
import { DomainApi } from "@/api/domain-api";
import { TodosApiLive } from "@/api/todos-api-live";
import { ApiClient } from "./shared";

const MyApiLive = HttpApiBuilder.api(DomainApi).pipe(Layer.provide(TodosApiLive));
const ApiLayer = Layer.mergeAll(MyApiLive, HttpServer.layerContext);
const { handler: webHandler } = HttpApiBuilder.toWebHandler(ApiLayer as any);

const inProcessHttpClient = HttpClient.make((request, url) =>
  Effect.tryPromise({
    try: async () => {
      const webRequest = new Request(url.toString(), {
        method: request.method,
        headers: request.headers as Record<string, string>,
      });
      const webResponse = await webHandler(webRequest);
      return HttpClientResponse.fromWeb(request, webResponse);
    },
    catch: (error) => {
      throw error;
    },
  }),
);

export const InProcessWebHandlerApiClientLive = Layer.effect(
  ApiClient,
  HttpApiClient.makeWith(DomainApi, {
    httpClient: inProcessHttpClient,
    baseUrl: "http://localhost",
  }),
);
