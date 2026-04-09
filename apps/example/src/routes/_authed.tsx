import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { callApiPromise } from "@/runtimes/get-runtime";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    const session = await callApiPromise((api) => api.auth.me(), {
      catchTags: {
        Unauthorized: () => redirect({ to: "/login", search: { redirect: location.href } }),
      },
    });
    return { user: session };
  },
  component: () => <Outlet />,
});
