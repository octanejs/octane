---
'octane': patch
'@octanejs/app-core': patch
'@octanejs/tanstack-hotkeys': patch
'@octanejs/tanstack-pacer': patch
'@octanejs/tanstack-router-ssr-query': patch
'@octanejs/vite-plugin': patch
'@octanejs/rsbuild-plugin': patch
---

Harden server functions with same-origin JSON POST validation, bounded request
bodies, global authorization middleware, trusted-proxy-aware origin policies,
and production-safe error responses across Vite, Rsbuild, and platform servers.
Add hook-slot-safe Hotkeys and Pacer bindings, typed router-query SSR exports,
and dedicated behavioral and type-check coverage for all three TanStack bindings.
