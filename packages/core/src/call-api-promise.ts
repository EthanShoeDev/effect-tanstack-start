/**
 * Creates a convenience helper for calling the API client isomorphically.
 *
 * Picks the correct runtime (server or client), yields the ApiClient tag,
 * passes it to your callback, and runs the resulting Effect as a Promise.
 *
 * Supports typesafe error mapping via `catchTags` — both at factory time
 * (global defaults) and per-call (endpoint-specific overrides).
 */

import { Cause, Context, Effect, Exit, Option, Runtime, type ManagedRuntime } from "effect";
import type { AllClientErrors } from "./internal/types.js";

/**
 * A record mapping error `_tag` strings to handler functions.
 * Each handler receives the typed error and returns a value to throw
 * (e.g. `notFound()` or `redirect(...)`).
 */
type CatchTagsOption<E> = {
  [K in Extract<E, { readonly _tag: string }>["_tag"]]?: (
    error: Extract<E, { readonly _tag: K }>,
  ) => unknown;
};

/**
 * Create a `callApiPromise` function that picks the right runtime,
 * resolves the ApiClient, and runs the effect.
 *
 * @param clientTag - The ApiClient tag (from makeApiClientTag)
 * @param getRuntime - An isomorphic function returning the correct runtime
 *   (may return the runtime directly or a Promise of it)
 * @param options - Optional factory-level configuration
 * @param options.catchTags - Global error mappings applied to every call.
 *   Keys are error `_tag` strings (autocompleted from the API contract).
 *   Handlers receive the typed error and return a value to throw.
 *
 * @example
 * ```ts
 * import { notFound } from "@tanstack/react-router"
 *
 * export const callApiPromise = makeCallApiPromise(ApiClient, getRuntime, {
 *   catchTags: {
 *     TodoNotFound: () => notFound(),
 *   },
 * })
 *
 * // In a loader — TodoNotFound is automatically mapped:
 * const todo = await callApiPromise((api) => api.todos.getById({ path: { id } }))
 *
 * // Per-call override for context-dependent mappings:
 * const session = await callApiPromise(
 *   (api) => api.auth.me(),
 *   { catchTags: { Unauthorized: () => redirect({ to: "/login" }) } },
 * )
 * ```
 */
export function makeCallApiPromise<TagId, TagService>(
  clientTag: Context.Tag<TagId, TagService>,
  getRuntime: () =>
    | ManagedRuntime.ManagedRuntime<any, any>
    | Promise<ManagedRuntime.ManagedRuntime<any, any>>,
  options?: {
    catchTags?: CatchTagsOption<AllClientErrors<TagService>>;
  },
): <A, E>(
  fn: (client: TagService) => Effect.Effect<A, E, any>,
  callOptions?: {
    catchTags?: CatchTagsOption<NoInfer<E>>;
  },
) => Promise<A> {
  const globalCatchTags = options?.catchTags as
    | Record<string, (error: unknown) => unknown>
    | undefined;

  return <A, E>(
    fn: (client: TagService) => Effect.Effect<A, E, any>,
    callOptions?: {
      catchTags?: CatchTagsOption<NoInfer<E>>;
    },
  ): Promise<A> => {
    const runtimeOrPromise = getRuntime();
    const effect = Effect.flatMap(clientTag, fn) as Effect.Effect<A, E, never>;

    const resolve = async (runtime: ManagedRuntime.ManagedRuntime<any, any>): Promise<A> => {
      const exit = await runtime.runPromiseExit(effect);

      if (Exit.isSuccess(exit)) {
        return exit.value;
      }

      // Failure path — extract the error from the Cause
      const cause = exit.cause;
      const failureOpt = Cause.failureOption(cause);

      if (Option.isSome(failureOpt)) {
        const error = failureOpt.value;

        // Check if the error has a _tag we can match
        if (error !== null && typeof error === "object" && "_tag" in error) {
          const tag = (error as { readonly _tag: string })._tag;
          const perCallCatchTags = callOptions?.catchTags as
            | Record<string, (error: unknown) => unknown>
            | undefined;

          // Per-call catchTags takes priority over global
          const handler = perCallCatchTags?.[tag] ?? globalCatchTags?.[tag];
          if (handler) {
            // Thrown because TanStack Router detects notFound()/redirect() via
            // thrown sentinels — the handler's return value IS the thing to throw.
            throw handler(error);
          }
        }
      }

      // No handler matched — throw FiberFailure (same as runPromise behavior)
      throw Runtime.makeFiberFailure(cause);
    };

    if (runtimeOrPromise instanceof Promise) {
      return runtimeOrPromise.then(resolve);
    }
    return resolve(runtimeOrPromise);
  };
}
