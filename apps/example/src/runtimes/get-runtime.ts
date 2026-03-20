/**
 * Isomorphic runtime getter and convenience helpers.
 *
 * Uses createIsomorphicFn to pick the correct runtime at compile time.
 */

import { createIsomorphicFn } from "@tanstack/react-start";
import { makeCallApiPromise } from "effect-tanstack-start/client";
import { ApiClient } from "@/services/api-client-tag";
import { serverRuntime } from "./server-runtime.server";
import { clientRuntime } from "./client-runtime";

export const getRuntime = createIsomorphicFn()
  .server(() => serverRuntime)
  .client(() => clientRuntime);

export const callApiPromise = makeCallApiPromise(ApiClient, getRuntime);
