# Implementation Notes

We want to keep track of important design decisions and implementation notes here.

## Library API: Accept both runtimes and layers

Following the pattern from effect-nextjs, our library should accept either a `ManagedRuntime` or a `Layer` from the user. The user is responsible for defining their server and client runtimes/layers (including HMR-safe setup via `globalValue`, disposal on SIGINT/SIGTERM, etc.). The library handles the TanStack Start-specific wiring — mounting HttpApi on splat routes, bridging `createServerFn`, running effects in loaders, etc.

This mirrors `Next.make("BasePage", AppLive)` (accepts a Layer) and `Next.makeWithRuntime("BasePage", statefulRuntime)` (accepts a ManagedRuntime) from effect-nextjs.
