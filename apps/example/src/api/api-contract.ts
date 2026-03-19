import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "@effect/platform";
import { Schema } from "effect";

export const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
  createdAt: Schema.DateTimeUtc,
});
export type Todo = typeof Todo.Type;

export const CreateTodoInput = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1)),
});
export type CreateTodoInput = typeof CreateTodoInput.Type;

export const UpdateTodoInput = Schema.Struct({
  title: Schema.optionalWith(Schema.String.pipe(Schema.minLength(1)), {
    as: "Option",
  }),
  completed: Schema.optionalWith(Schema.Boolean, { as: "Option" }),
});
export type UpdateTodoInput = typeof UpdateTodoInput.Type;

export class TodoNotFound extends Schema.TaggedError<TodoNotFound>()(
  "TodoNotFound",
  { id: Schema.String },
  HttpApiSchema.annotations({ status: 404 }),
) {}

export class TodosApiGroup extends HttpApiGroup.make("todos")
  .add(HttpApiEndpoint.get("list", "/todos").addSuccess(Schema.Array(Todo)))
  .add(
    HttpApiEndpoint.get("getById", "/todos/:id")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Todo)
      .addError(TodoNotFound),
  )
  .add(HttpApiEndpoint.post("create", "/todos").setPayload(CreateTodoInput).addSuccess(Todo))
  .add(
    HttpApiEndpoint.patch("update", "/todos/:id")
      .setPath(Schema.Struct({ id: Schema.String }))
      .setPayload(UpdateTodoInput)
      .addSuccess(Todo)
      .addError(TodoNotFound),
  )
  .add(
    HttpApiEndpoint.del("remove", "/todos/:id")
      .setPath(Schema.Struct({ id: Schema.String }))
      .addSuccess(Schema.Void)
      .addError(TodoNotFound),
  ) {}

export class ApiContract extends HttpApi.make("api").add(TodosApiGroup).prefix("/api") {}
