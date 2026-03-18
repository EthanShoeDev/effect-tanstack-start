/**
 * In-process ApiClient that calls the HttpApp Effect directly,
 * skipping the async web handler wrapper.
 *
 * Instead of going through HttpApiBuilder.toWebHandler (which creates its own
 * runtime and runs the Effect asynchronously), this approach builds the HttpApp
 * from the API layer and runs it directly as an Effect.
 *
 * The flow:
 *   HttpApiClient encodes request (schema validation) →
 *   Custom HttpClient converts HttpClientRequest → HttpServerRequest (via fromWeb) →
 *   Runs HttpApp Effect directly (full HttpApi pipeline + middleware) →
 *   Converts HttpServerResponse → web Response → HttpClientResponse →
 *   HttpApiClient decodes response (schema validation)
 *
 * Pros: Full schema contract and middleware pipeline. Avoids the toWebHandler
 *       runtime wrapper. Runs the HttpApp directly in the caller's Effect context.
 * Cons: Still converts through web Request/Response for HttpServerRequest.fromWeb.
 *       Needs investigation into direct HttpClientRequest → HttpServerRequest conversion.
 *
 * This is the "effect-direct" approach from the implementation notes.
 */

import { Effect, Layer } from "effect";
import {
  HttpApiBuilder,
  HttpApiClient,
  HttpApp,
  HttpClient,
  HttpClientResponse,
  HttpMiddleware,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import { DomainApi } from "@/api/domain-api";
import { TodosApiLive } from "@/api/todos-api-live";
import { ApiClient } from "./shared";

// Build the API layer.
const MyApiLive = HttpApiBuilder.api(DomainApi).pipe(Layer.provide(TodosApiLive));
const ApiLayer = Layer.mergeAll(MyApiLive, HttpServer.layerContext);

// Resolve the HttpApp with full middleware pipeline.
const resolvedHttpApp = Effect.gen(function* () {
  const fullLayer = ApiLayer.pipe(
    Layer.provideMerge(HttpApiBuilder.Router.Live),
    Layer.provideMerge(HttpApiBuilder.Middleware.layer),
  );
  const apiRuntime = yield* Layer.toRuntime(fullLayer);
  const app = yield* Effect.provide(HttpApiBuilder.httpApp, apiRuntime);
  return HttpMiddleware.logger(app as HttpApp.Default);
}).pipe(Effect.scoped);

// Custom HttpClient that runs the HttpApp Effect directly.
const inProcessEffectClient = HttpClient.make((request, url) =>
  Effect.gen(function* () {
    const webRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers as Record<string, string>,
    });
    const serverRequest = HttpServerRequest.fromWeb(webRequest);

    const app = yield* resolvedHttpApp;
    const serverResponse = yield* Effect.provideService(
      app,
      HttpServerRequest.HttpServerRequest,
      serverRequest,
    );

    const webResponse = HttpServerResponse.toWeb(serverResponse);
    return HttpClientResponse.fromWeb(request, webResponse);
  }),
);

export const InProcessEffectDirectApiClientLive = Layer.effect(
  ApiClient,
  HttpApiClient.make(DomainApi, {
    baseUrl: "http://localhost",
    transformClient: () => inProcessEffectClient,
  }),
);
