import { Effect, Ref } from "effect";
import type { Session } from "@/api/api-contract";

export class SessionStore extends Effect.Service<SessionStore>()("SessionStore", {
  effect: Effect.gen(function* () {
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

    return { get, set, remove } as const;
  }),
}) {}
