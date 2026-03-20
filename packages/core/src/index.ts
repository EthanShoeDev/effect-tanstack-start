/**
 * effect-tanstack-start
 *
 * Seamlessly integrate Effect HttpApi with TanStack Start.
 * Zero-overhead SSR via direct handler invocation.
 *
 * Shared exports — safe for both server and client environments.
 * For server-only exports, use "effect-tanstack-start/server".
 * For client-only exports, use "effect-tanstack-start/client".
 */

export { makeApiClientTag } from "./api-client-tag.js";
export { makeCallApiPromise } from "./call-api-promise.js";
export type { ClientOf } from "./internal/types.js";
