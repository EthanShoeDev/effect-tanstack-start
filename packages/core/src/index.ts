/**
 * effect-tanstack-start
 *
 * Seamlessly integrate Effect HttpApi with TanStack Start.
 * Zero-overhead SSR via direct handler invocation.
 */

export { makeApiClientTag } from "./api-client-tag.js";
export { makeSsrApiClientLayer } from "./ssr-api-client.js";
export { makeHttpApiClientLayer } from "./http-api-client.js";
export { mountApi, type MountApiOptions } from "./mount-api.js";
export { makeCallApiPromise } from "./call-api-promise.js";
export type { ClientOf } from "./internal/types.js";
