/**
 * API implementation — all group handlers composed into a single Layer.
 *
 * Each group is implemented via HttpApiBuilder.group() and provided to
 * HttpApiBuilder.api(). If you have multiple groups, compose them all here.
 */

import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
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
    .handle("search", ({ urlParams }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        const all = yield* todos.list;
        const query = urlParams.q.toLowerCase();
        return all.filter((t) => t.title.toLowerCase().includes(query));
      }),
    )
    .handle("getById", ({ path }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.getById(path.id);
      }),
    )
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.create(payload);
      }),
    )
    .handle("update", ({ path, payload }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.update(path.id, payload);
      }),
    )
    .handle("remove", ({ path }) =>
      Effect.gen(function* () {
        const todos = yield* TodosService;
        return yield* todos.remove(path.id);
      }),
    ),
);

// Compose all groups into the full API implementation.
// Stateful services (TodosService, SessionStore) are NOT provided here —
// they must come from the runtime so that the SSR client and HTTP handler
// share the same instances (same Ref, same in-memory state).
export const ApiImplLive = HttpApiBuilder.api(ApiContract).pipe(
  Layer.provide(TodosGroupLive),
  Layer.provide(AuthGroupLive),
  Layer.provide(DashboardGroupLive),
  Layer.provide(AuthMiddlewareLive),
);
