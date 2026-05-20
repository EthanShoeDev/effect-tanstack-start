import { Context, Effect, Layer, Ref } from "effect";
import type { Session } from "@/api/api-contract";

interface SessionStoreShape {
  readonly get: (token: string) => Effect.Effect<Session | undefined>;
  readonly set: (token: string, session: Session) => Effect.Effect<void>;
  readonly remove: (token: string) => Effect.Effect<void>;
  readonly keys: Effect.Effect<ReadonlyArray<string>>;
}

export class SessionStore extends Context.Service<SessionStore, SessionStoreShape>()(
  "SessionStore",
) {}

const makeSessionStore = Effect.gen(function* () {
  const store = yield* Ref.make(new Map<string, Session>());

  const get = (token: string) => Effect.map(Ref.get(store), (m) => m.get(token));

  const set = (token: string, session: Session) =>
    Ref.update(store, (m) => {
      const next = new Map(m);
      next.set(token, session);
      return next;
    });

  const remove = (token: string) =>
    Ref.update(store, (m) => {
      const next = new Map(m);
      next.delete(token);
      return next;
    });

  const keys = Effect.map(Ref.get(store), (m) => Array.from(m.keys()));

  return { get, set, remove, keys } satisfies SessionStoreShape;
});

export const SessionStoreLive = Layer.effect(SessionStore)(makeSessionStore);
