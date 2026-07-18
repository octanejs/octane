# Lynx upstream provenance

Phase 0 is based on immutable published artifacts rather than Lynx moving main.
The selected ReactLynx behavioral oracle is `@lynx-js/react@0.123.0`, whose
official package tag resolves to Lynx-stack commit
`b6b809cdbec99d20e51aa9521257644dc9db5272`. The native engine target is Lynx
SDK `3.9.0` at commit `d7f13487df0d69497148e93b71aded676a8fe243`.

Exact package versions, npm integrity digests, source commits, SDK assets, and
compatibility constraints are recorded in [`audit/toolchain.json`](./audit/toolchain.json).
The npm tarballs are the dependency authority; tagged source is the behavioral
and test oracle when tests are not shipped in the tarball.

The probe depends only on published framework-neutral Lynx packages. ReactLynx
and its Rsbuild plugin are reference-only and must not enter the production
dependency graph. `dsl: "react_nodiff"` is the only template DSL accepted by
the pinned encoder for this no-diff PAPI shape; it is encoder metadata, not a
React runtime dependency.

No Lynx or ReactLynx source has been copied into this directory. If later work
adapts Apache-2.0 source, retain the original copyright and license notices,
mark modifications, and update this file with exact source paths and commits.
