/**
 * Auth implementation — auth middleware, and handler groups.
 *
 * Uses SessionStore service for session management.
 * Login accepts any username except "fail" (which simulates a failed login).
 * No password required.
 */

import { Effect, Layer, Redacted } from "effect";
import { HttpEffect, HttpServerResponse } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import {
  ApiContract,
  AuthMiddleware,
  CurrentSession,
  LoginFailed,
  Unauthorized,
  sessionSecurity,
} from "./api-contract";
import { SessionStore } from "../services/session-store";
import { TodosService } from "../services/todos-service";

// ── Auth Middleware Implementation ─────────────────────────────────────

// v4 security middleware wraps the inner endpoint effect. We decode the credential,
// look up the session, fail with Unauthorized if missing, and otherwise provide
// CurrentSession before running the wrapped effect.
export const AuthMiddlewareLive = Layer.effect(AuthMiddleware)(
  Effect.gen(function* () {
    const store = yield* SessionStore;
    return {
      session: (httpEffect, { credential }) =>
        Effect.gen(function* () {
          const tokenStr = Redacted.value(credential);
          const allTokens = yield* store.keys;
          yield* Effect.log(
            `Auth middleware: incoming token="${tokenStr}", stored tokens=[${allTokens.join(", ")}]`,
          );
          const session = yield* store.get(tokenStr);
          if (!session) {
            return yield* new Unauthorized();
          }
          return yield* Effect.provideService(httpEffect, CurrentSession, session);
        }),
    };
  }),
);

// ── Auth Group Handlers ────────────────────────────────────────────────

export const AuthGroupLive = HttpApiBuilder.group(ApiContract, "auth", (handlers) =>
  handlers
    .handle("login", ({ payload }) =>
      Effect.gen(function* () {
        if (payload.username === "fail") {
          return yield* new LoginFailed({ message: "Login failed for user 'fail'" });
        }

        const store = yield* SessionStore;
        const token = crypto.randomUUID();
        yield* store.set(token, { username: payload.username });

        // Set session cookie
        yield* HttpApiBuilder.securitySetCookie(sessionSecurity, token, {
          path: "/",
          httpOnly: true,
          secure: false, // false for local dev
          sameSite: "lax",
        });

        return { username: payload.username };
      }),
    )
    .handle("logout", () =>
      HttpEffect.appendPreResponseHandler((_req, response) =>
        Effect.succeed(HttpServerResponse.expireCookieUnsafe(response, "session", { path: "/" })),
      ),
    )
    .handle("me", () => CurrentSession),
);

// ── Dashboard Group Handlers ───────────────────────────────────────────

export const DashboardGroupLive = HttpApiBuilder.group(ApiContract, "dashboard", (handlers) =>
  handlers.handle("stats", () =>
    Effect.gen(function* () {
      const session = yield* CurrentSession;
      const todos = yield* TodosService;
      const allTodos = yield* todos.list;

      return {
        username: session.username,
        todoCount: allTodos.length,
        completedCount: allTodos.filter((t) => t.completed).length,
      };
    }),
  ),
);
