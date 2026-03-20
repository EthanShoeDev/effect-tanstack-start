/**
 * Effect + TanStack Start integration — shared setup.
 *
 * Only contains code safe for both server and client environments.
 * Server-only code (SsrApiClientLive) lives in runtimes/server-runtime.ts.
 */

import { makeApiClientTag } from "effect-tanstack-start/client";
import { ApiContract } from "@/api/api-contract";

// Shared ApiClient tag (typed from the contract)
export const ApiClient = makeApiClientTag(ApiContract);
