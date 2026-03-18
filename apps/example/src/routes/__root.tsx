/// <reference types="vite/client" />
import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";
import type * as React from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div style={{ padding: 8, display: "flex", gap: 8, fontSize: 18 }}>
          <Link to="/" activeProps={{ style: { fontWeight: "bold" } }}>
            Home
          </Link>
        </div>
        <hr />
        {children}
        <Scripts />
      </body>
    </html>
  );
}
