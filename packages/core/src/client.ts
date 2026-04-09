/**
 * effect-tanstack-start/client
 *
 * Client-safe exports. No server-only imports.
 * Also re-exports shared utilities (makeApiClientTag, makeCallApiPromise, ClientOf).
 */

export { makeApiClientTag } from "./api-client-tag.js";
export { makeCallApiPromise } from "./call-api-promise.js";
export { makeHttpApiClientLayer } from "./http-api-client.js";
export type {
  AllClientErrors,
  ClientErrorByTag,
  ClientErrorTags,
  ClientOf,
} from "./internal/types.js";
