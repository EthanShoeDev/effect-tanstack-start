/**
 * API implementation — all group handlers composed into a single Layer.
 *
 * v4 pattern: merge `HttpApiBuilder.layer(api)` with each group's Layer and
 * any middleware Layers. The combined Layer is consumed by both the
 * SSR client and the HTTP handler (`mountApi`).
 */

import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { ApiContract } from "./api-contract";
import { AuthGroupLive, AuthMiddlewareLive, DashboardGroupLive } from "./auth-impl";
import { TodosService } from "../services/todos-service";

// Individual group implementations
const TodosGroupLive = HttpApiBuilder.group(ApiContract, "todos", (handlers) =>
  handlers
    .handle("list", () =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.list;
      }),
    )
    .handle("search", ({ query }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        const all = yield* todos.list;
        const q = query.q.toLowerCase();
        return all.filter((t) => t.title.toLowerCase().includes(q));
      }),
    )
    .handle("getById", ({ params }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.getById(params.id);
      }),
    )
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.create(payload);
      }),
    )
    .handle("update", ({ params, payload }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.update(params.id, payload);
      }),
    )
    .handle("remove", ({ params }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.remove(params.id);
      }),
    ),
);

// Compose all groups + the api registration into the full API Layer.
// `HttpApiBuilder.layer(api)` depends on each group's ApiGroup<...> service,
// so the groups must be provided to it via `provideMerge`. The middleware layer
// is in turn required by the auth + dashboard group layers.
//
// Stateful services (TodosService, SessionStore) are NOT provided here —
// they come from the runtime so that the SSR client and HTTP handler
// share the same instances (same Ref, same in-memory state).
export const ApiImplLive = HttpApiBuilder.layer(ApiContract).pipe(
  Layer.provideMerge(TodosGroupLive),
  Layer.provideMerge(AuthGroupLive),
  Layer.provideMerge(DashboardGroupLive),
  Layer.provideMerge(AuthMiddlewareLive),
);
