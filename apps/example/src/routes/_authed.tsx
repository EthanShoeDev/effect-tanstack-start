import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { callApiPromise } from "@/runtimes/get-runtime";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location, abortController }) => {
    const session = await callApiPromise((api) => api.auth.me(), {
      throwOnTag: {
        Unauthorized: () => redirect({ to: "/login", search: { redirect: location.href } }),
      },
      signal: abortController.signal,
    });
    return { user: session };
  },
  component: () => <Outlet />,
});
