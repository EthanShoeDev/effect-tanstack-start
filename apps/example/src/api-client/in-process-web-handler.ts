/**
 * In-process ApiClient using web Request/Response round-trip.
 *
 * This creates an HttpApiClient with a custom HttpClient that, instead of
 * making a real HTTP fetch, calls the toWebHandler handler function directly
 * in-process. The handler is the same one mounted on the splat route.
 *
 * The flow:
 *   HttpApiClient encodes request (schema validation) →
 *   Custom HttpClient converts HttpClientRequest → web Request →
 *   Calls handler(webRequest) in-process (full HttpApi pipeline + middleware) →
 *   Converts web Response → HttpClientResponse →
 *   HttpApiClient decodes response (schema validation)
 *
 * Pros: Simplest approach. Guaranteed correctness — identical behavior to a
 *       real HTTP call. Full middleware pipeline runs.
 * Cons: Unnecessary serialization overhead from the web Request/Response
 *       round-trip. Data goes Effect types → web → Effect types → handler →
 *       Effect types → web → Effect types.
 *
 * This is the "web-handler" approach from the implementation notes.
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

// Build the web handler from the API layer — same as what the splat route uses.
const MyApiLive = HttpApiBuilder.api(DomainApi).pipe(Layer.provide(TodosApiLive));
const ApiLayer = Layer.mergeAll(MyApiLive, HttpServer.layerContext);
const { handler: webHandler } = HttpApiBuilder.toWebHandler(ApiLayer);

// Custom HttpClient that calls the web handler in-process instead of fetching.
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
  HttpApiClient.make(DomainApi, {
    baseUrl: "http://localhost",
    transformClient: () => inProcessHttpClient,
  }),
);
