# SSR metadata, guards, and identity audit

This completes the remaining metadata and identity investigations from #981.
The decisions below retain the current representations and guards. They do not
claim to remove their costs. The separate [replay audit](../ssr-final-replay/README.md)
covers snapshot copying, streaming, output flattening, and `ssrTry`.

```sh
node benchmarks/bench.mjs --quick --ratios ssr-final-metadata
SSR_SOURCE_ROOT=/path/to/frozen-source node benchmarks/ssr-final-metadata/audit.mjs
METADATA_TIMING=1 node benchmarks/ssr-final-metadata/audit.mjs
node benchmarks/ssr-final-replay/diagnostics.mjs
```

`BENCH_JSON` writes the ordinary benchmark schema. The source root may be an
archive containing `packages/octane/src` and its package metadata. The compiler,
fixtures, and dependencies come from the current checkout; all server runtime
imports, including the internal server target, use the selected source root.

## Method and results

Baseline: `248af4edc30c80498dec13dad4f6d7508f10f220`, Node 24.20.0,
V8 13.6.233.17-node.53, macOS arm64. The [recorded data](./measurements.json)
includes source/bundle hashes, complete-output hashes, semantic controls,
executed work counts, and paired timing samples.

Clean production bundles own response checks and timings. A separate observed
bundle counts executed descriptor queries, lowercase calls, metadata records,
identity operations, and closure-construction source sites. Both must produce
the same complete HTML/CSS. These are source-operation counts; they do not prove
how many objects or strings survive V8 optimization, or measure GC or IC state.

| 128-row scenario | Measured work on baseline and final candidate |
| --- | --- |
| Native mapped rows | 128 element descriptor queries; one constructor and one species probe |
| Compiled keyed component rows | 128 scoped child segments; 129 occurrence queries; 257 identity-key encodings |
| Flat component descriptors | 386 callback identity membranes; 514 identity-key encodings; 258 render-closure source events |
| Nested keyed component descriptors | 6,712 encoded UTF-16 units; 257 descriptor prop copies |
| Compiled children blocks | 128 children marks; 128 direct and 256 scoped child segments |
| Four direct attributes per input | 512 attribute lowercase calls and 512 URL-name lowercase calls |
| Four spread/direct attributes per input | Another 512 attribute-identity lowercase calls |
| Host descriptors plus root | 129 namespace results and 129 element-context records |
| One state hook with a settling update per row | 256 hook-position result objects at the source level |

All ten scenario outputs and work records match between frozen baseline and
final candidate. The broader PR's streaming changes account for the clean bundle
change from 111,301 raw / 37,171 gzip bytes to 111,419 / 37,224. No metadata runtime
rewrite is included. These bundles export the server surface used by all
controls, so their size is not a minimal application entry size.

## Array map eligibility — retain the guards

The two-argument `mapSlot` query proves that the compiler can render the receiver
directly with its native-array ABI. The authored fallback must preserve native
map's length snapshot, holes, accessor effects, constructor access, and species
result. Caching eligibility only by receiver cannot observe later mutation of
that same array. Caching the global constructor/species decision cannot observe
later replacement of those properties.

The suite builds unsafe alternatives in memory and verifies that removing:

- element accessor rejection includes an extra row when a getter grows the
  receiver; native map snapshots the original length;
- the own-constructor guard loses its observable getter;
- the species guard loses an extra visible row created by a custom species;
- children marking changes the public `isChildrenBlock` dispatch; or
- scoped child segments loses the first settled value when keyed children move
  on every retry.

Sparse arrays, post-render accessor installation on the same receiver, normal
arrays, and unchanged inputs are additional controls. The production guard
budget remains one element query per element and two global property probes
per eligible call. It is an accepted compatibility cost.

## Frame and list identity — retain scoped counters and encoding

The direct segment path is reachable for children functions: the children fixture
records 128 direct segment increments. Ordinary compiled component children
extend the identity scope before choosing their segment and use the scoped
path. A single parent-wide segment counter is not equivalent: the rejected
alternative changes which freshly recreated thenable supplies a keyed row's
authoritative settled value during repeated reorder/retry.

`nextFrameOccurrence` also distinguishes occurrences within each identity scope.
The short pair-list representation, promotion threshold, request-local object
identities, and cached frame paths remain. An interned linked identity graph
would add nodes, lookup tables, and release rules across both frame creation and
replay. The demonstrated ordinal shortcut is wrong; this audit does not adopt
the larger representation change.

The remaining explicit/nested descriptor keys preserve type and structural path
boundaries. UTF-16 encoding distinguishes delimiters, lone surrogates, and
replacement characters; numeric, string, and object identities have separate
roles. Existing shared nested prefixes and numeric implicit keys remain covered
by `ssr-throughput/nested-work.mjs`, `ssr-deopt-list-identity.test.ts`, and the
async-identity encoding/surrogate tests. Replacing those encodings with raw
separator concatenation or ordinal positions would discard these distinctions.

`ssrChildValue` retains its descriptor callbacks and outer identity scope.
Component invocation then installs its own component scope. The 258 closure
events and 514 key encodings in the descriptor fixture make that remaining cost
explicit. Collapsing the scopes is a change to replay identity, descendant
evaluation context, and cleanup boundaries, not merely removal of a duplicate
lookup. Existing reordered/nested deopt-list and suspension-isolation tests cover
those boundaries; no allocation or throughput result justifies a new callback
ABI here. In the coordinated #1069 work, raw structural signal keys remain a
separate protocol from reconciler key coercion, including exception restoration.

## Attributes and host metadata — reject the measured alternatives

The timing experiment compares the frozen baseline implementation with two
temporary alternatives. The final candidate retains that metadata implementation:

1. A character scan returns an already-lowercase attribute name before calling
   `toLowerCase` only for uppercase ASCII.
2. Three namespace-specific Maps cache host validation, semantic tag spelling,
   and namespace metadata, clearing each Map at 64 entries. The current element
   context still remains a fresh stack record.

Thirty warmups precede 31 alternating-order samples of eight renders. Complete
output equivalence is checked outside timing. Recorded medians, milliseconds
per response:

| Scene | Current | Lowercase scan | Host metadata cache |
| --- | ---: | ---: | ---: |
| Four compiled attributes per input | 0.151 | 0.155 | 0.152 |
| Component descriptors | 0.160 | 0.162 | 0.165 |
| Repeated input host descriptors | 0.065 | 0.068 | 0.063 |
| 128 different custom host tags | 0.070 | 0.070 | 0.081 |

The small repeated-host timing difference overlaps the sample distributions;
the cache also adds 235 raw / 98 gzip bytes and retains up to 192 metadata
records between requests. The unique-tag case exercises eviction and has a
higher median. The lowercase scan adds 103 raw / 43 gzip bytes without an
established improvement. Both alternatives are rejected. These results concern
the tested alternatives and do not establish a universal optimal implementation.

Host metadata depends on the inherited namespace as well as the tag. Controls
serialize the same custom tag in HTML, SVG, and `foreignObject`, including
reentrant rendering from attribute coercion. Uppercase hosts, invalid tags,
custom attributes, empty URL exceptions, controlled inputs/selects, and initial
textarea newlines retain their existing behavior. A tag-only cache is not an
equivalent replacement. The context stack and `finally` restoration remain.

The remaining `ssrAttrs` work preserves getter snapshot order, last-writer wins,
HTML case-insensitive aliases, foreign case-sensitive names, controlled form
aggregation, and scoped-class composition. Canonical production writers already
avoid the second resolution Map; mixed aliases and spreads retain normalization
and ordered records. The spread fixture measures the remaining lowercase work;
`ssr-output-evaluation.test.ts` and attribute/hydration suites cover observable
writer and coercion order. Skipping normalization or serializing during source
enumeration would change those contracts.

## Children functions, descriptor props, and hook positions — retain the shapes

The children mark distinguishes a compiler-generated template function from a
user callback through public `isChildrenBlock`. Both remain ordinary callable
functions with their existing calling conventions. Replacing them with an
environment record or render object changes that contract. The suite checks
both kinds and demonstrates failure when the mark is removed.

Descriptor props are open user records. Five prop layouts pass through the
descriptor workload; their reads must accept those different layouts. Filling missing
fields into a universal shape changes own-key enumeration and omitted-versus-
explicit children semantics, both checked through rendered output. Shared
scoped-child accessors from the earlier shape fix remain; this audit adds no
per-object shape normalization or prop cache.

`HookPass` already allocates its Maps lazily on the first hook. The per-hook
position record remains fresh: `memoHookValue` keeps the returned location over
an arbitrary factory call. A nested render can use more hooks before the outer
memo writes its result. The sixth in-memory rejected alternative reuses one
global position object and demonstrably changes the memo's rendered value on a
render-phase retry. The hook-free scenarios create zero position records;
the settling state scenario creates 256. No heap allocation reduction is
inferred from changing the tuple representation.

## Large functions and validation boundary

The shared replay diagnostics identify the actual runtime function references:
`ssrAttr` has 1,598 bytes of bytecode and `ssrHostElement` 1,292 on the audited
Node version. Both naturally reach Maglev and TurboFan in the 300-round
host/attribute workload without forced optimization. Function size alone does
not establish a missed optimization. Retain the routines and their cold
branches; the suite makes no permanent-tier or universal inlining claim.

Production clean/observed and rejected-variant controls run in this suite.
The normal development/production SSR, descriptor, controlled-form, map
hydration, keyed identity, and reentrant hook tests remain the correctness
gate. These Node measurements do not claim browser hydration speed, request
throughput under concurrency, engine allocation counts, or zero future deopts.
