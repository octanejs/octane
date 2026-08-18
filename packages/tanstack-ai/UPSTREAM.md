# Upstream

- Repository: https://github.com/TanStack/ai
- Release tag: `@tanstack/ai-react@0.17.0`
- Commit: `9ca3706513b94764d11ea63c7541b2cf4f3daa20`
- Package: `@tanstack/ai-react@0.17.0`
- Source root: `packages/ai-react/src`
- Test root: `packages/ai-react/tests`
- License: MIT
- npm tarball SHA-256: `27eea2e78722c51e1f30f8ddf4d193b0ebc79a330dc9d0aa876516828e30cbe6`

## Upstream test suite

The pinned repository commit contains an executable Vitest suite under
`packages/ai-react/tests`, including React runtime cases and type probes.
Published npm tarballs omit those tests; repository presence is authoritative,
so `upstreamSuites.runtime` is `present`.

Promoting the inventoried upstream suite into pristine / one-for-one adapted
lanes remains open follow-up work before provenance can move to `verified`.
