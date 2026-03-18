import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as HttpApiClient from "@effect/platform/HttpApiClient";
import * as Effect from "effect/Effect";
import { globalValue } from "effect/GlobalValue";
import { DomainApi } from "@/api/domain-api";

// Typed HttpApiClient derived from the DomainApi definition.
export class ApiClient extends Effect.Service<ApiClient>()("ApiClient", {
  dependencies: [FetchHttpClient.layer],
  scoped: Effect.gen(function* () {
    const client = yield* HttpApiClient.make(DomainApi, {
      baseUrl: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
    });
    return { client };
  }),
}) {}

// All client-only services go here.
const ClientLayer = Layer.mergeAll(ApiClient.Default, Logger.pretty);

export const clientRuntime = globalValue("effect-tanstack-start/ClientRuntime", () =>
  ManagedRuntime.make(ClientLayer),
);
