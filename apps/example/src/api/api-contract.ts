import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
} from "effect/unstable/httpapi";

// ── Todos ──────────────────────────────────────────────────────────────

export const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
  createdAt: Schema.DateTimeUtc,
});
export type Todo = typeof Todo.Type;

export const CreateTodoInput = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(1)),
});
export type CreateTodoInput = typeof CreateTodoInput.Type;

export const UpdateTodoInput = Schema.Struct({
  title: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
  completed: Schema.optional(Schema.Boolean),
});
export type UpdateTodoInput = typeof UpdateTodoInput.Type;

export class TodoNotFound extends Schema.TaggedErrorClass<TodoNotFound>()(
  "TodoNotFound",
  { id: Schema.String },
  { httpApiStatus: 404 },
) {}

export class TodosApiGroup extends HttpApiGroup.make("todos").add(
  HttpApiEndpoint.get("list", "/todos", {
    success: Schema.Array(Todo),
  }),
  HttpApiEndpoint.get("search", "/todos/search", {
    query: { q: Schema.String },
    success: Schema.Array(Todo),
  }),
  HttpApiEndpoint.get("getById", "/todos/:id", {
    params: { id: Schema.String },
    success: Todo,
    error: TodoNotFound,
  }),
  HttpApiEndpoint.post("create", "/todos", {
    payload: CreateTodoInput,
    success: Todo,
  }),
  HttpApiEndpoint.patch("update", "/todos/:id", {
    params: { id: Schema.String },
    payload: UpdateTodoInput,
    success: Todo,
    error: TodoNotFound,
  }),
  HttpApiEndpoint.delete("remove", "/todos/:id", {
    params: { id: Schema.String },
    success: Schema.Void,
    error: TodoNotFound,
  }),
) {}

// ── Auth ───────────────────────────────────────────────────────────────

export const Session = Schema.Struct({
  username: Schema.String,
});
export type Session = typeof Session.Type;

export class CurrentSession extends Context.Service<CurrentSession, Session>()("CurrentSession") {}

export class Unauthorized extends Schema.TaggedErrorClass<Unauthorized>()(
  "Unauthorized",
  {},
  { httpApiStatus: 401 },
) {}

export class LoginFailed extends Schema.TaggedErrorClass<LoginFailed>()(
  "LoginFailed",
  { message: Schema.String },
  { httpApiStatus: 403 },
) {}

export const sessionSecurity = HttpApiSecurity.apiKey({
  in: "cookie",
  key: "session",
});

export class AuthMiddleware extends HttpApiMiddleware.Service<
  AuthMiddleware,
  { provides: CurrentSession }
>()("AuthMiddleware", {
  error: Unauthorized,
  security: { session: sessionSecurity },
}) {}

export class AuthApiGroup extends HttpApiGroup.make("auth").add(
  HttpApiEndpoint.post("login", "/auth/login", {
    payload: Schema.Struct({ username: Schema.String }),
    success: Session,
    error: LoginFailed,
  }),
  HttpApiEndpoint.post("logout", "/auth/logout", {
    success: Schema.Void,
  }),
  HttpApiEndpoint.get("me", "/auth/me", { success: Session }).middleware(AuthMiddleware),
) {}

// ── Dashboard (all endpoints require auth) ─────────────────────────────

export const DashboardStats = Schema.Struct({
  username: Schema.String,
  todoCount: Schema.Number,
  completedCount: Schema.Number,
});
export type DashboardStats = typeof DashboardStats.Type;

export class DashboardApiGroup extends HttpApiGroup.make("dashboard")
  .add(
    HttpApiEndpoint.get("stats", "/dashboard/stats", {
      success: DashboardStats,
    }),
  )
  .middleware(AuthMiddleware) {}

// ── API Contract ───────────────────────────────────────────────────────

export class ApiContract extends HttpApi.make("api")
  .add(TodosApiGroup, AuthApiGroup, DashboardApiGroup)
  .prefix("/api") {}
