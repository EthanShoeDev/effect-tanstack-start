#!/usr/bin/env bash

mkdir -p docs/cloned-repos-as-docs ; cd docs/cloned-repos-as-docs

# We clone some of our deps so that coding agents can quickly
# grep for relevant docs, src code, and examples.

# AI AGENTS: DO NOT RUN THIS SCRIPT! 
# You should first check if the repo you need is already cloned.
# If not only clone the repo you need into the docs/cloned-repos-as-docs directory.

gh repo clone TanStack/router

# Effect-TS
gh repo clone Effect-TS/effect
gh repo clone Effect-TS/website
gh repo clone kitlangton/effect-solutions
gh repo clone voidhashcom/effect-query
gh repo clone mcrovero/effect-nextjs # This provides good examples on how to use ManagedRuntimes.

# Reference
gh repo clone voidzero-dev/vite-plus
gh repo clone lucas-barake/effect-tanstack-start # random repo on gh with matching name
gh repo clone vitest-dev/vitest