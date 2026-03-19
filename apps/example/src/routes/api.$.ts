import { createFileRoute } from "@tanstack/react-router";
import { mountApi } from "effect-tanstack-start";
import { ApiContract } from "@/api/api-contract";
import { ApiImplLive } from "@/api/api-impl";
import { serverRuntime } from "@/effect-tanstack";

export const Route = createFileRoute("/api/$")(
  mountApi(ApiContract, {
    serverRuntime,
    apiLayer: ApiImplLive,
  }),
);
