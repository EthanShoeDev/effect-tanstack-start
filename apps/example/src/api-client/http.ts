/**
 * HTTP-based ApiClient implementation for the client runtime.
 *
 * This creates a standard HttpApiClient that makes real HTTP requests
 * to the Effect HttpApi mounted on the splat route (/api/$).
 * Used during client-side navigation when the browser calls the server.
 *
 * This is the "normal" path — the client sends HTTP requests, the server
 * handles them through the full HttpApi pipeline including middleware.
 */

import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { DomainApi } from "@/api/domain-api";
import { ApiClient } from "./shared";

export const HttpApiClientLive = Layer.effect(
  ApiClient,
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(DomainApi, {
      baseUrl: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    });
    return client;
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
