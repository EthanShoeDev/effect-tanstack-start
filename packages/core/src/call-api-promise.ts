/**
 * Creates a convenience helper for calling the API client isomorphically.
 *
 * Picks the correct runtime (server or client), yields the ApiClient tag,
 * passes it to your callback, and runs the resulting Effect as a Promise.
 */

import { Context, Effect, type ManagedRuntime } from "effect";

/**
 * Create a `callApiPromise` function that picks the right runtime,
 * resolves the ApiClient, and runs the effect.
 *
 * @param clientTag - The ApiClient tag (from makeApiClientTag)
 * @param getRuntime - An isomorphic function returning the correct runtime
 *
 * @example
 * ```ts
 * export const callApiPromise = makeCallApiPromise(ApiClient, getRuntime)
 *
 * // In a loader or event handler:
 * const todos = await callApiPromise((api) => api.todos.list())
 * ```
 */
export function makeCallApiPromise<TagId, TagService>(
  clientTag: Context.Tag<TagId, TagService>,
  getRuntime: () => ManagedRuntime.ManagedRuntime<any, any>,
): <A, E>(fn: (client: TagService) => Effect.Effect<A, E, any>) => Promise<A> {
  return <A, E>(fn: (client: TagService) => Effect.Effect<A, E, any>): Promise<A> =>
    getRuntime().runPromise(Effect.flatMap(clientTag, fn) as Effect.Effect<A, E, never>);
}
