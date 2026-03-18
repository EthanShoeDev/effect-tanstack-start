import { Logger, ManagedRuntime, Layer } from "effect";
import { globalValue } from "effect/GlobalValue";
import { HttpApiClientLive } from "@/api-client/http";

// All client-only services go here.
const ClientLayer = Layer.mergeAll(HttpApiClientLive, Logger.pretty);

export const clientRuntime = globalValue("effect-tanstack-start/ClientRuntime", () =>
  ManagedRuntime.make(ClientLayer),
);
