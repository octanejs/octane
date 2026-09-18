# Upstream

- Repository: https://github.com/TanStack/table
- Package: `@tanstack/react-table@9.2.4`
- Immutable commit: `d01c01bedbab0ff6c2641f18b2fc9a11545d9bf6`
- Source root: `packages/react-table/src`
- Test root: `packages/react-table/tests`
- License: MIT; exact notice in `LICENSE.upstream`, included in the package.
- npm tarball SHA-256: `c9e40b73d195b76f81e1602513e96d7ab03eac0e0611da86e05cc144f629b8ab`
- npm integrity: `sha512-Rzp1Q4e0/nIgEjmISYR5HeEgLTNtrG+C7NFZf/AbCxPO5hg+zC3yNGwcoECigUk8SFzzvhXbd2rFdtP2ZiGrfA==`

## Source boundary

The complete released adapter source and tests are byte-pinned under `upstream/`
by `audit/upstream.lock.json`. Source/tests and the verified npm artifact are
unpublished. The shared pristine runner executes all 34 original React tests;
materialized native lanes cover all 31 client cases and all three SSR cases.
Five authored differential scenarios and 41 native conformance cases cover
state, subscriptions, contexts, memoization, component identity and real hydration.

There are no dedicated upstream type-test registrations. Both strict type lanes
compile the full source and authored contracts for all 774 exports across five
code entrypoints, plus consumer inference and negative controls. The native
`OctaneTable`, `AppOctaneTable`, `LegacyOctaneTable`, `SubscribeComponent` and
`TableComponentType` names preserve their corresponding renderer contracts.

`table-core` algorithms, row models and worker utilities are imported directly;
the neutral core's internal tests and monorepo example apps sit outside the copied
adapter boundary. `@octanejs/tanstack-store` owns the renderer subscription bridge.

Committed adaptation patches record native input events, ref props, SSR result
containers/markers and the documented first transition-hold cue render. A held
render never writes or publishes suspended controlled state. Its accepted old-state
cue render can notify raw store observers with the unchanged committed snapshot.
Octane has no class components; memo remains a plain callable and refs are props.

Table 9.2.4 preserves zero and empty-string renderables, adds the legacy migration
entrypoint and uses the core render-phase source with post-commit publication.
The source ledger and closure cover every shipped source/type file.

Native Subscribe accepts both compiled template children and render-prop callbacks. Compiled blocks are passed back to the renderer; callbacks receive the selected state. The children-block regression checks updates and DOM identity.
