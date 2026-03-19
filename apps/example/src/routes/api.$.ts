import { createFileRoute } from "@tanstack/react-router";
import { apiHandler } from "@/runtimes/server-runtime.server";

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: apiHandler,
      POST: apiHandler,
      PUT: apiHandler,
      PATCH: apiHandler,
      DELETE: apiHandler,
      OPTIONS: apiHandler,
    },
  },
});
