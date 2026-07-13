---
"octane": patch
"@octanejs/base-ui": patch
"@octanejs/floating-ui": patch
"@octanejs/hook-form": patch
"@octanejs/jotai": patch
"@octanejs/lexical": patch
"@octanejs/mdx": patch
"@octanejs/motion": patch
"@octanejs/radix": patch
"@octanejs/recharts": patch
"@octanejs/redux": patch
"@octanejs/remix-router": patch
"@octanejs/stylex": patch
"@octanejs/tanstack-query": patch
"@octanejs/tanstack-router": patch
"@octanejs/tanstack-table": patch
"@octanejs/tanstack-virtual": patch
"@octanejs/testing-library": patch
"@octanejs/zustand": patch
---

Preserve compiler-driven state-hook getters on client and server while keeping
getter-free calls on the existing two-item path, including bounded server
render-phase updates and immediate getter reads. Isolate `useId` by root with
working identifier prefixes. Harden first-reveal ViewTransitions and compiler
hook discovery for aliases, namespaces, dependency inference, and plain-loop
errors.

Consume Octane as an exact singleton peer from every framework binding and
publish a Node 22 minimum engine requirement across core and the bindings.
Compile installed raw-source binding graphs through Vite while preserving
manifest-declared manual hook-slot directories.
