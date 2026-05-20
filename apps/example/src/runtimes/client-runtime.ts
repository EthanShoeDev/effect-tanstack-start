import { Layer, Logger, ManagedRuntime } from "effect";
import { makeHttpApiClientLayer } from "effect-tanstack-start/client";
import { ApiContract } from "@/api/api-contract";
import { ApiClient } from "@/services/api-client-tag";

const HttpApiClientLive = makeHttpApiClientLayer(ApiContract, ApiClient);

export const clientRuntime = ManagedRuntime.make(
  Layer.mergeAll(HttpApiClientLive, Logger.layer([Logger.consolePretty()])),
);
