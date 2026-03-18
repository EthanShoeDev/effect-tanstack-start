/**
 * In-process ApiClient that invokes HttpApiBuilder handlers directly,
 * bypassing HTTP routing entirely.
 *
 * Instead of going through the HttpApp router, this approach aims to call the
 * endpoint handler Effects directly. Schema validation still runs because
 * HttpApiClient.make encodes/decodes on the client side.
 *
 * Pros: Maximum performance — no routing, no HTTP abstractions.
 * Cons: Most complex. Need to extract individual handler Effects from
 *       HttpApiBuilder internals.
 *
 * Middleware note: Effect HttpApi middleware is wired into the Layer via
 * HttpApiBuilder, so if we go through the full Layer, middleware DOES run.
 * If we extracted individual handler Effects directly, we'd need to apply
 * middleware manually.
 *
 * CURRENT STATUS: This implementation is functionally identical to the
 * effect-direct approach. The TODO is to investigate extracting individual
 * endpoint handler Effects from HttpApiBuilder internals to skip routing
 * while preserving middleware.
 *
 * This is the "direct-call" approach from the implementation notes.
 *
 * TODO: Investigate HttpApiBuilder internals for direct endpoint extraction.
 *       See: docs/cloned-repos-as-docs/effect/packages/platform/src/HttpApiBuilder.ts
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

// Build the full API layer with all middleware.
const MyApiLive = HttpApiBuilder.api(DomainApi).pipe(Layer.provide(TodosApiLive));
const ApiLayer = Layer.mergeAll(MyApiLive, HttpServer.layerContext);

// Resolve the HttpApp — currently same as effect-direct.
// Future: extract individual endpoint handlers to skip routing.
const resolvedHttpApp = Effect.gen(function* () {
  const fullLayer = ApiLayer.pipe(
    Layer.provideMerge(HttpApiBuilder.Router.Live),
    Layer.provideMerge(HttpApiBuilder.Middleware.layer),
  );
  const apiRuntime = yield* Layer.toRuntime(fullLayer);
  const app = yield* Effect.provide(HttpApiBuilder.httpApp, apiRuntime);
  return HttpMiddleware.logger(app as HttpApp.Default);
}).pipe(Effect.scoped);

// Custom HttpClient — currently routes through HttpApp (same as effect-direct).
// Future: invoke individual endpoint handlers directly.
const directCallClient = HttpClient.make((request, url) =>
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

export const InProcessDirectCallApiClientLive = Layer.effect(
  ApiClient,
  HttpApiClient.make(DomainApi, {
    baseUrl: "http://localhost",
    transformClient: () => directCallClient,
  }),
);
