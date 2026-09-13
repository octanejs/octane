# Descriptor renderer audit

This audit revisits the seven descriptor-renderer entries in issue #981 against
`3c1cc55d8`. The four ratio runners and standalone ownership audit use the actual
production runtime, compare clean
and observed semantics, and report deterministic work. They make no throughput
or wall-clock timing claim.

```sh
node benchmarks/bench.mjs --ratios descriptor-renderer
```

The children runner needs installed Playwright Chromium. All runners accept a
frozen `runtime.ts` path as their first argument for same-runner baseline
comparisons. Use the same compiler, dependencies, options, and machine for both
sides. Individual audits record commands, results, and observation limitations.

| Issue entry | Disposition |
| --- | --- |
| Event-name parsing and delegation arrays | Cache known event-prop records and skip redundant registration arrays. Unknown/custom event names retain their existing classification. See [events](events.md). |
| Repeated live child collection indexing | Replace indexed/rescanning placement with a live sibling cursor. See [children](children.md). |
| Repeated `descNeedsBlocks` classification | Retain scope-sensitive classification; an identity cache is unsound. See below. |
| Unconditional `applyHostProps` writes | Skip matching live string attributes/classes and delegated handlers; retain full special-property behavior. See [props](props.md). |
| Repeated select option indexing / two projections | Reuse each indexed option locally. Retain both projections and the complete pre-mutation journal. See [forms](forms.md). |
| Form-source closure and repeated probes | Apply already resolved raw source values directly; retain the compatibility resolver's own-enumerable semantics. See [forms](forms.md). |
| Intrinsic descriptors on memo hits | Retain four per-hit intrinsic checks. A render-wide cache is unsound. See below. |

## Classification remains sensitive to the resolving scope

`descNeedsBlocks` decides whether a descriptor can use raw host reconciliation
or needs mounted Blocks for components, render functions, portals, Fragments,
thenables, and iterable children. Generators must not be consumed just to
classify them. The server makes the corresponding structural decision when
emitting hydration markers.

A module-level scoped host descriptor can resolve to a plain host subtree under
one Provider and a component subtree under another Provider during the same
render. `descriptor-classification.test.ts` exercises that exact shared identity
with a working native counter in the component subtree. Caching classification
by descriptor identity, globally or for one render, would reuse the wrong answer.
An always-Block alternative would add persistent Blocks and hydration markers
to every currently cheap pure-host subtree.

A build-only WeakMap classification cache makes both development and production
executions fail: the component reaches the raw host reconciler after reusing the
other Provider's host-only verdict. The production source remains unchanged.

The scoped resolver already reuses its resolved value when its scope and observed
contexts permit it. Repeating the classification walk does not imply repeating
every authored getter. No additional descriptor field, global WeakMap, scope
cache, or classification epoch is introduced in this PR. A safe future reduction
needs a per-resolution validity proof and measurements of its retained state.

### Scoped-child ownership fix

The audit additionally found a correctness bug when that shared descriptor
changes child shape after mounting. A host-to-component upgrade left the old
host child behind, and a component-to-host change could retain the old component.
The deferred child shell was stamped as the accepted descriptor, so the next
render resolved both old and new adoption keys in the new scope. An implicit
same-wrapper bailout also hid changed children.

The host's existing `DEOPT_DESC` metadata now retains the resolved child shape
for deferred-child shells. It reuses the previous snapshot when type, props,
key, ref, and children are unchanged. Ordinary descriptors keep their existing
record. The implicit host bailout compares the current scoped children with
the accepted snapshot before treating the wrapper identity as unchanged.
The existing descriptor journal restores that snapshot on a held render. Complete
scoped records also compare resolved props, key, ref, type, and children before
bailing out.

The regression checks both directions in render and hydration modes, preserving
section/input identity, draft input values, and working native counters. These
are ordinary passing tests; the frozen baseline fails the child-shape assertions.
Held-render tests additionally verify accepted counters, input focus, rollback,
retry, and the reverse remount after a later sibling suspends.
Nested deferred leaves require their accepted tags and keys too. During a
raw-host-to-Block upgrade, a cold reconstruction walk substitutes each raw
node's stamped descriptor before deriving the old keys. It uses internal array
copies, preserving positional boundaries without invoking an authored slice or
species method. Keyed adoption then retains later and reordered survivors,
uses the existing focus-preserving move helpers, and leaves its original queue
intact until every item succeeds. Ordinary mounts allocate no adoption Map or
consumed-node Set.

The regression includes exact final child/input counts, changed keys, changed
tags, keyed reorders, and native input state. See [ownership](ownership.md) for
added probe, snapshot, temporary-copy, and adoption costs. The classification
walk remains scope-sensitive and is not cached by identity.

## Intrinsic validation remains per hit

`compilerCacheImmutableArrayFilter` checks four current descriptors: native
`Array.prototype.filter`, `map`, `constructor`, and `Array[Symbol.species]`.
The original issue's five-probe count is outdated. Dense array entries and each
predicate property are already classified once per immutable snapshot/property.
Fresh snapshots bypass this classification until an actual cache hit is possible.

The new test first warms two sibling state-filter projections. During one later
render, a component between the siblings replaces `Array.prototype.filter`.
The left sibling retains native behavior and the right sibling must observe the
new implementation. There is one compiler intrinsic-guard call site, reached
independently by both sibling instances. A per-render cached verdict would hide
the override from the second instance. Descriptor inspection also avoids invoking
user getters while checking validity, so replacing it with direct property reads
would change observable behavior.

A build-only mutant that caches only those four intrinsic verdicts by root
transaction fails in both runtime modes: the right sibling incorrectly retains
one filtered row instead of observing the replacement method's two rows.

Existing auto-memo regressions cover replaced map/filter methods, inherited and
own getters, sparse indexed getters, custom species, and Proxy receivers. The
constant-size intrinsic checks remain; this audit does not claim that cost was
removed.
