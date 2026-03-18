import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import { CreateTodoInput, Todo, TodoId, TodoNotFound, UpdateTodoInput } from "./todo-schema";

export class TodosApiGroup extends HttpApiGroup.make("todos")
  .add(HttpApiEndpoint.get("list", "/todos").addSuccess(Schema.Array(Todo)))
  .add(
    HttpApiEndpoint.get("getById", "/todos/:id")
      .setPath(Schema.Struct({ id: TodoId }))
      .addSuccess(Todo)
      .addError(TodoNotFound),
  )
  .add(HttpApiEndpoint.post("create", "/todos").setPayload(CreateTodoInput).addSuccess(Todo))
  .add(
    HttpApiEndpoint.patch("update", "/todos/:id")
      .setPath(Schema.Struct({ id: TodoId }))
      .setPayload(UpdateTodoInput)
      .addSuccess(Todo)
      .addError(TodoNotFound),
  )
  .add(
    HttpApiEndpoint.del("remove", "/todos/:id")
      .setPath(Schema.Struct({ id: TodoId }))
      .addSuccess(Schema.Void)
      .addError(TodoNotFound),
  ) {}

export class DomainApi extends HttpApi.make("api").add(TodosApiGroup).prefix("/api") {}
