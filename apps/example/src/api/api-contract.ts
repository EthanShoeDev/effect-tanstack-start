import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
  HttpApiSecurity,
} from "@effect/platform";
import { Context, Schema } from "effect";

// ── Todos ──────────────────────────────────────────────────────────────

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
    HttpApiEndpoint.get("search", "/todos/search")
      .setUrlParams(Schema.Struct({ q: Schema.String }))
      .addSuccess(Schema.Array(Todo)),
  )
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

// ── Auth ───────────────────────────────────────────────────────────────

export const Session = Schema.Struct({
  username: Schema.String,
});
export type Session = typeof Session.Type;

export class CurrentSession extends Context.Tag("CurrentSession")<CurrentSession, Session>() {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  HttpApiSchema.annotations({ status: 401 }),
) {}

export class LoginFailed extends Schema.TaggedError<LoginFailed>()(
  "LoginFailed",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 403 }),
) {}

export const sessionSecurity = HttpApiSecurity.apiKey({
  in: "cookie",
  key: "session",
});

export class AuthMiddleware extends HttpApiMiddleware.Tag<AuthMiddleware>()("AuthMiddleware", {
  provides: CurrentSession,
  failure: Unauthorized,
  security: { session: sessionSecurity },
}) {}

export class AuthApiGroup extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.post("login", "/auth/login")
      .setPayload(Schema.Struct({ username: Schema.String }))
      .addSuccess(Session)
      .addError(LoginFailed),
  )
  .add(HttpApiEndpoint.post("logout", "/auth/logout").addSuccess(Schema.Void))
  .add(HttpApiEndpoint.get("me", "/auth/me").addSuccess(Session).middleware(AuthMiddleware)) {}

// ── Dashboard (all endpoints require auth) ─────────────────────────────

export const DashboardStats = Schema.Struct({
  username: Schema.String,
  todoCount: Schema.Number,
  completedCount: Schema.Number,
});
export type DashboardStats = typeof DashboardStats.Type;

export class DashboardApiGroup extends HttpApiGroup.make("dashboard")
  .add(HttpApiEndpoint.get("stats", "/dashboard/stats").addSuccess(DashboardStats))
  .middleware(AuthMiddleware) {}

// ── API Contract ───────────────────────────────────────────────────────

export class ApiContract extends HttpApi.make("api")
  .add(TodosApiGroup)
  .add(AuthApiGroup)
  .add(DashboardApiGroup)
  .prefix("/api") {}
