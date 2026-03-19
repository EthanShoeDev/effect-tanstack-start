/**
 * Isomorphic runtime getter and convenience helpers.
 *
 * Uses createIsomorphicFn to pick the correct runtime at compile time.
 * The server runtime uses a dynamic import so the server-only code
 * is fully excluded from the client bundle.
 */

import { createIsomorphicFn } from "@tanstack/react-start";
import { makeCallApiPromise } from "effect-tanstack-start";
import { ApiClient } from "@/effect-tanstack";
import { clientRuntime } from "./client-runtime";

export const getRuntime = createIsomorphicFn()
  .server(async () => {
    // Comment needs to go here
    const { serverRuntime } = await import("./server-runtime.server");
    return serverRuntime;
  })
  .client(() => clientRuntime);

export const callApiPromise = makeCallApiPromise(ApiClient, getRuntime);
