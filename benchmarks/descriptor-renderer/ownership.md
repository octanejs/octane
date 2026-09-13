# Scoped descriptor ownership cost

`ownership.mjs` is a standalone production audit for the correctness repair
found while retaining scope-sensitive descriptor classification. It is separate
from the four optimization ratio runners: the baseline produces incorrect DOM
on the Provider shape change, so that phase cannot establish a speedup.

## Correctness boundary

A shared deferred descriptor can describe different host children, keys, props,
or host types under different Providers. The existing DOM descriptor stamp now
holds the accepted children alongside the accepted descriptor fields. The
same-wrapper host bailout checks that accepted resolution before skipping a
render. On a raw-host-to-Blocks upgrade, old child keys/types come from the
accepted DOM stamps, and keyed adoption preserves later survivors when an
earlier key changes or moves.

Without these checks, a Provider update can retain stale output. An initial
shallow repair also left duplicate old/new children when a nested deferred tag
changed, and preserved an input whose explicit key changed. The final
`descriptor-classification.test.ts` covers these cases, including exact output,
input identity/state, hydration, and held render retry. `ownership.mjs` reuses
its ordinary shared-Provider fixture as the measured workload.

## Reproduce

Run both sides with the same compiler, dependency tree, Node version, and
production options:

```sh
git show 3c1cc55d8:packages/octane/src/runtime.ts > /tmp/ownership-before.ts
BENCH_JSON=/tmp/ownership-before.json node benchmarks/descriptor-renderer/ownership.mjs /tmp/ownership-before.ts
BENCH_JSON=/tmp/ownership-after.json node benchmarks/descriptor-renderer/ownership.mjs
```

The runner accepts a frozen runtime path as its first argument. It uses fresh
happy-dom Windows for clean and observed bundles, verifies identical output,
and records source/fixture/entry/runner hashes and clean bundle size. It inserts
counters into actual runtime AST sites in memory; checked-in source is not
patched. The current-runtime run requires the Provider flip to succeed. A
supplied historical runtime reports `flip.matches: false` honestly instead of
pretending that incorrect output passes the candidate contract.

Four modes each mount 128 sections and update them eight times:

- `Ordinary`: fresh ordinary descriptors containing an input and span.
- `OrdinaryBlocks`: stable ordinary descriptors containing an input and a
  stateful component, exercising the host wrapper's implicit bailout.
- `Stable`: scoped host descriptors whose resolver returns one shared stable
  children array.
- `Scoped`: 64 copies of the existing two-Provider fixture, resolving one
  shared descriptor to a plain subtree and a component subtree in each copy.

The controls preserve every input/section identity and typed input value,
verify updated attributes and a working native counter, and assert empty
containers after unmount. The final Provider flip changes both resolving modes
and requires the complete expected span/button shape. Baseline and candidate
semantic hashes match in all preceding phases; the baseline flip fails, while
the candidate flip succeeds with all input identities preserved.

## Measured work

Recorded with Node 24.20.0 on Darwin arm64. Counts below cover 128 mounts or
1,024 host updates. These are source sites and current descriptor references,
not throughput, JavaScript heap bytes, or a claim about GC timing.

| Mode / phase | Stamp calls, baseline → candidate | Added stamp probes | New snapshots | New bailout checks / probes |
| --- | ---: | ---: | ---: | ---: |
| Ordinary mount | 385 → 385 | 385 | 0 | 0 / 0 |
| Ordinary updates | 3,080 → 3,080 | 3,080 | 0 | 0 / 0 |
| Ordinary Blocks mount | 257 → 257 | 257 | 0 | 0 / 0 |
| Ordinary Blocks updates | 8 → 8 | 8 | 0 | 1,024 / 2,048 |
| Stable scoped mount | 385 → 385 | 385 | 128 | 0 / 0 |
| Stable scoped updates | 3,080 → 3,080 | 3,080 | 0 | 0 / 0 |
| Resolving scoped mount | 320 → 320 | 320 | 128 | 0 / 0 |
| Resolving scoped updates | 1,536 → 2,560 | 2,560 | 1,024 | 512 / 1,024 |

Ordinary descriptors allocate no new snapshot, but pay one extra scoped marker
read per stamp. An unchanged ordinary host with component children also pays
two marker reads at the bailout check. The resolving fixture creates fresh
children arrays as the shared resolver crosses Provider scopes, so the
correctness guard rejects the old wrapper-only bailout. That produces 1,024
additional stamp calls and 1,024 snapshots across the eight updates. A stable
children identity reuses its existing snapshot.

The final flip performs 64 raw-host upgrades. In the candidate it reaches:

| Cold work | Count |
| --- | ---: |
| Recursive adoption visits | 192 |
| Plain array copies | 64 |
| Cursor objects | 64 |
| Adoption Maps | 64 |
| Consumed-node Sets | 64 |

Each visited array gets one temporary plain copy. This avoids invoking an
authored `slice` or array species and reads each indexed value once during the
accepted-descriptor walk. Each upgrade gets one cursor object and one adoption
Map; the Set is allocated only after a node is consumed. The Map/Set support
key lookup, reordering, and a completed-pass compaction of the original queue.
All these counters are zero in the four mount/update modes before the flip.
The new walk is linear in the retained old child structure; adoption Map/Set
storage is linear in the old/consumed raw nodes.

## Retention and rollback

The snapshot is a plain six-field descriptor in the existing DOM stamp; no
global cache or new node/Scope field is added. Each scoped host retains at most
one current snapshot in that stamp. The stable fixture retains 128 snapshots
pointing to one shared two-entry children array. The resolving fixture retains
128 snapshots pointing to 128 two-entry arrays, even after creating 1,024
replacement snapshots. A snapshot retains its current props and child values;
it is not a deep clone. Referenced child arrays can be arbitrarily large.

The audit counts currently stamped snapshots and distinct directly referenced
child arrays with WeakMap/WeakSet observers. It does not measure the entire
reachable object graph or prove collection. No connected snapshot remains
after unmount. Detached DOM retained by application code can still retain its
stamp, as before.

The existing descriptor journal restores the previous stamp together with DOM
props on abort. During an attempt, journal entries can additionally retain old
snapshots until settlement. The adoption cursor/copies/Map/Set are local to the
upgrade. The original adoption queue remains intact until the mount pass
succeeds; its completed compaction leaves unconsumed nodes for cleanup. The
regression suite exercises held attempts and retries; the audit's reference
counts cover completed renders.

## Clean bundle cost

| Runtime | Minified bytes | Gzip bytes |
| --- | ---: | ---: |
| Baseline | 174,656 | 56,614 |
| Ownership changes only | 175,723 (+1,067) | 56,954 (+340) |
| Current runtime, including merged Provider fix #1080 | 176,137 (+1,481) | 57,124 (+510) |

The isolated build replaces `setDeoptDesc`, `childSlot`, `buildDeoptAdoptQueue`,
and `mountItemsLinear` in the frozen baseline, adds `sameDeoptDesc`,
`unchangedScopedHostDescriptor`, and `adoptedDeoptChildren`, and removes
`consumeAdoptQueuePrefix`. Its operation counts and semantic results match the
combined candidate. These bytes use this audit's entry; they are not a
package-wide or minimal-application size estimate.

All three builds use the compiler from `239dab04c`; the frozen runtime baseline
remains `3c1cc55d8`. Source hashes for this recording:

- Baseline: `846eb67f2468ce0b2ccfb55353aec8a6528440e14688dc939857b93a5912c178`.
- Ownership only: `9787a86a76201274009effcc6e8803f8612b713fc6c5f22ce9f0393124d6cba0`.
- Combined: `a1b14d8fd7fa2ad61f94f97928af612753efdf4325bbe3bd6493c9fa083036f9`.
- Entry: `03ca158a0df9149dd415c2ee257a33be677005034e04a1e1eb1b1e97f4ca256c`.


## Separate remaining context-propagation defect

A bounded production probe found another preexisting stale-output case on both
main `239dab04c` and this candidate. It uses the runtime's scoped descriptor
helpers directly; an authored `.tsrx` equivalent has not been established.
With a DOM container available, the following keeps the nested `span` after
`active` changes to true instead of rendering `strong` with `next`:

```js
import {
  createContext, createElement as h, createRoot, createScopedElement,
  createScopedValue, flushSync, useContext,
} from 'octane';

const Mode = createContext(false);
const nested = createScopedValue(() => {
  const active = useContext(Mode);
  return h(active ? 'strong' : 'span', { 'data-child': 'nested' }, active ? 'next' : 'first');
});
const Counter = () => h('button', null, 'counter');
const children = [nested, h(Counter, null)];
const shared = createScopedElement('section', null, () => children);
const App = ({ active }) => h(Mode.Provider, { value: active }, shared);
const root = createRoot(container);
root.render(App, { active: false });
flushSync(() => root.render(App, { active: true }));
// Expected: <strong data-child="nested">next</strong>
// Current:  <span data-child="nested">first</span>
console.log(container.querySelector('[data-child]').outerHTML);
root.unmount();
```

The nested resolver runs only once in both versions. Classification first
resolves it in the previewing parent; the cached resolution then crosses into
the host/item Blocks without replaying its captured context dependencies there.
The outer resolver returns the same array and reads no context itself, so its
identity bailout does not see the nested dependency. This needs a separate
context-dependency ownership fix and is not claimed resolved here. The present
PR fixes the accepted descriptor/adoption cases whose resolution changes are
observed by their owning render.
