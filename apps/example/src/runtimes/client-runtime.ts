import { makeHttpApiClientLayer } from "effect-tanstack-start";
import { Layer, Logger, ManagedRuntime } from "effect";
import { globalValue } from "effect/GlobalValue";
import { ApiContract } from "@/api/api-contract";
import { ApiClient } from "@/effect-tanstack";

const HttpApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient);

export const clientRuntime = globalValue("ClientRuntime", () =>
  ManagedRuntime.make(Layer.mergeAll(HttpApiClientLive, Logger.pretty)),
);
