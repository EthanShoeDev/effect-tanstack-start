import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { Effect } from "effect";
import { callApiPromise } from "@/runtimes/get-runtime";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ location }) =>
    callApiPromise((api) =>
      Effect.gen(function* () {
        const session = yield* api.auth.me();
        return { user: session };
      }).pipe(
        Effect.catchAll(() =>
          Effect.die(redirect({ to: "/login", search: { redirect: location.href } })),
        ),
      ),
    ),
  component: () => <Outlet />,
});
