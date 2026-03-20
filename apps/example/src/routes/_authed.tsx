import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { callApiPromise } from "@/runtimes/get-runtime";

export const Route = createFileRoute("/_authed")({
  beforeLoad: async ({ location }) => {
    try {
      const session = await callApiPromise((api) => api.auth.me());
      return { user: session };
    } catch {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: () => <Outlet />,
});
