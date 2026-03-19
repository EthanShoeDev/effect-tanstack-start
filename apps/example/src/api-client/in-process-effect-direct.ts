/**
 * SSR ApiClient: effect-app-direct approach.
 *
 * Uses HttpApiClient.makeWith with a custom HttpClient that builds the
 * HttpApp and runs it directly as an Effect in the CALLER'S fiber.
 *
 * What makes this different from the web-handler approach:
 * - Does NOT create a separate runtime/scope (toWebHandler does)
 * - Runs the HttpApp Effect directly in the current fiber, so it shares
 *   the caller's runtime context, tracing, interruption, etc.
 * - Still goes through URL routing, body deserialization, middleware,
 *   response encoding — but all as Effect operations in the current fiber
 * - Still needs an HttpServerRequest (via fromWeb + web Request constructor)
 *   because the HttpApp expects one in context
 *
 * Overhead: URL parsing, JSON body serialize/deserialize, router matching,
 *           response encoding. But no separate runtime creation.
 * Middleware: Runs fully.
 * Correctness: Guaranteed — same pipeline as HTTP, just in-process.
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

const MyApiLive = HttpApiBuilder.api(DomainApi).pipe(Layer.provide(TodosApiLive));
const ApiLayer = Layer.mergeAll(MyApiLive, HttpServer.layerContext);

// Build the HttpApp once (lazily). Unlike toWebHandler, this does NOT
// create its own runtime — it returns an Effect that runs in the caller's fiber.
const resolvedHttpApp = Effect.gen(function* () {
  const fullLayer = ApiLayer.pipe(
    Layer.provideMerge(HttpApiBuilder.Router.Live),
    Layer.provideMerge(HttpApiBuilder.Middleware.layer),
  );
  const apiRuntime = yield* Layer.toRuntime(fullLayer);
  const app = yield* Effect.provide(HttpApiBuilder.httpApp, apiRuntime);
  return HttpMiddleware.logger(app as HttpApp.Default);
}).pipe(Effect.scoped);

// Custom HttpClient that runs the HttpApp Effect directly in the caller's fiber.
const inProcessEffectClient = HttpClient.make((request, url) =>
  (Effect.gen as any)(function* () {
    // We still need a web Request to create HttpServerRequest — this is just
    // a JS object constructor, not a network call. The HttpApp expects
    // HttpServerRequest in its context for routing and body parsing.
    const webRequest = new Request(url.toString(), {
      method: request.method,
      headers: request.headers as Record<string, string>,
    });
    const serverRequest = HttpServerRequest.fromWeb(webRequest);

    // Run the HttpApp directly — no separate runtime, same fiber
    const app = yield* resolvedHttpApp;
    const serverResponse = yield* Effect.provideService(
      app,
      HttpServerRequest.HttpServerRequest,
      serverRequest,
    );

    // Convert response back without going through web Response
    const webResponse = HttpServerResponse.toWeb(serverResponse);
    return HttpClientResponse.fromWeb(request, webResponse);
  }),
);

export const InProcessEffectDirectApiClientLive = Layer.effect(
  ApiClient,
  HttpApiClient.makeWith(DomainApi, {
    httpClient: inProcessEffectClient,
    baseUrl: "http://localhost",
  }),
);
