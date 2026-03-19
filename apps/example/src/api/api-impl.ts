/**
 * API implementation — all group handlers composed into a single Layer.
 *
 * Each group is implemented via HttpApiBuilder.group() and provided to
 * HttpApiBuilder.api(). If you have multiple groups, compose them all here.
 */

import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";
import { ApiContract } from "./api-contract";
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
).pipe(Layer.provide(TodosService.Default));

// Compose all groups into the full API implementation.
// Add more groups here as you add them to ApiContract:
//   Layer.provide(OtherGroupLive),
export const ApiImplLive = HttpApiBuilder.api(ApiContract).pipe(Layer.provide(TodosGroupLive));
