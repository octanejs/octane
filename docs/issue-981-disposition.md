# Issue 981 disposition ledger

This ledger tracks all **84 original checklist entries**, the uncheckboxed escaping
note, the three harness-gap claims, and the correctness defects discovered while
working the audit. The source inventory is issue [#981](https://github.com/octanejs/octane/issues/981)
as read for this PR at baseline `248af4edc30c80498dec13dad4f6d7508f10f220`
(merged #1090, 2026-09-14). At that point 53 entries were checked and 31 were
unchecked. Stable IDs below refer to original section order, not moving source
line numbers.

**A completed investigation can retain the current design.** “Fixed and retained”
identifies the removed cost and the remaining observable contract; it does not
claim the full runtime path allocates nothing. Historical line numbers, counts
and timing ratios remain evidence of their recorded revisions. They are not
fresh measurements of this PR.

## Previously unchecked entries

Each of the 31 previously unchecked entries appears exactly once in this table.
All rows have a final implemented or retained-design disposition, with links to
reproducible evidence and limits. The issue can distinguish already merged work
from the 16 entries completed by this PR that await its merge.

| ID | Original audit point | Disposition | Change or retained cost | Evidence |
| --- | --- | --- | --- | --- |
| ROOT-01 | Gate the root render transaction on a nullable driver | Retained contract | Root journaling must begin before user code can throw its first raw thenable after an earlier sibling write. Delayed arming reproduced loss of the committed screen; importing a Suspense API is not a prerequisite. No root-level gate is promised. | [#982](https://github.com/octanejs/octane/pull/982); [#1079](https://github.com/octanejs/octane/pull/1079); [audit](../benchmarks/root-transactions/contracts.md) |
| ROOT-02 | `journalObjectOnce` clones every touched bag through one megamorphic `{ ...obj }` site | Fixed and retained | Per-arity stamped snapshots and disposable-scope skips are merged; generic record snapshots retain getters, enumerable symbols and read-only symbol semantics. A separate generic spill site showed no reliable benefit. | [#982](https://github.com/octanejs/octane/pull/982); [#1079](https://github.com/octanejs/octane/pull/1079); [audit](../benchmarks/root-transactions/bags.md) |
| ROOT-03 | `journalText` / `journalAttr` read the DOM before every write | Fixed and retained | Descriptor text reuses its immediately preceding live comparison read (256→128 reads/128 updates). Compiled text/attributes retain their single live read to restore external edits, absence and empty values. | [#982](https://github.com/octanejs/octane/pull/982); [#1079](https://github.com/octanejs/octane/pull/1079); [audit](../benchmarks/root-transactions/contracts.md) |
| ROOT-06 | Every removed keyed row is parked, not unmounted | Fixed and retained | Flat retirement records remove reached undo closures; eager node-range capture, retirement membership and connected cleanup remain necessary across nested rollback windows. #986 resolved the separate keyed @empty ownership defect. | [#982](https://github.com/octanejs/octane/pull/982); [#986](https://github.com/octanejs/octane/pull/986); [#1079](https://github.com/octanejs/octane/pull/1079); [audit](../benchmarks/root-transactions/retirement.md) |
| ROOT-07 | `journalRootProperty` does a megamorphic keyed load per property | Fixed and retained | Call sites provide old values and numeric slot keys. Paired survivor item/capture changes use 1024 rather than 2048 journal slots for 256 rows. Unchanged/single-input controls and required scalar journals remain. | [#982](https://github.com/octanejs/octane/pull/982); [#1079](https://github.com/octanejs/octane/pull/1079); [audit](../benchmarks/root-transactions/inputs.md) |
| FLOW-06 | Per-item key strings on the de-opt list path | Fixed and retained | Implicit top-level keys, shared nested prefixes and redundant list callbacks were optimized in the listed PRs. Client coercion and server typed/escaped identities remain required for namespace, serializer, UTF-16 and retry isolation. The final metadata audit makes server identity work explicit and rejects a scoped ordinal shortcut. | [#1030](https://github.com/octanejs/octane/pull/1030); [#1032](https://github.com/octanejs/octane/pull/1032); [#1034](https://github.com/octanejs/octane/pull/1034); [#1035](https://github.com/octanejs/octane/pull/1035); [#1057](https://github.com/octanejs/octane/pull/1057); [#1060](https://github.com/octanejs/octane/pull/1060); [#1090](https://github.com/octanejs/octane/pull/1090); [final audit](../benchmarks/ssr-final-metadata/README.md) |
| DOM-02 | Spread hosts rebuild the whole prop resolution with ~6 allocations per key per render | Fixed and retained | Client writer reuse removes 33 intermediate arrays/update for 15 props. Server canonical writers already avoid a second resolution Map; mixed aliases/spreads retain getter snapshots, own-key semantics, controlled aggregation and ordered writers. The four-attribute server spread case records 512 additional identity lowercase calls; retained normalization prevents source-order/coercion changes. | [#1068](https://github.com/octanejs/octane/pull/1068); [final audit](../benchmarks/ssr-final-metadata/README.md) |
| DOM-05 | Every delegated event pushes the Event object into dictionary mode | Fixed and retained | Nested-dispatch frames replace three temporary private symbols. Public currentTarget/stopPropagation descriptors are restored exactly, including deletes; permanent own-property shadows change native observability. Dictionary mode itself is deliberately retained. | [#1068](https://github.com/octanejs/octane/pull/1068); [audit](../benchmarks/event-delegation/README.md) |
| DOM-09 | The path walk is megamorphic in Chrome too | Fixed and retained | Portal-presence/topology gating removes 2304 portal-parent reads from the portal-free case. Last-portal teardown retains its event route; other native DOM interface fan-out remains inherent. | [#1068](https://github.com/octanejs/octane/pull/1068); [audit](../benchmarks/event-delegation/README.md) |
| DOM-10 | `headBlock` re-applies every attribute through generic `setAttribute` and reads `textContent` per render | Fixed and retained | Stable common metadata attributes avoid 384 writes/128 renders. Live comparisons preserve foreign-edit repair and mutable coercion; the live textContent read remains required. | [#1068](https://github.com/octanejs/octane/pull/1068); [audit](../benchmarks/README.md) |
| DESC-01 | `applyDeoptProp` allocates an `eventSlot` record, two substrings and a `delegateEvents([type])` array per changed handler prop | Fixed and retained | Known event names share bounded parsed records and omit redundant delegation arrays; unknown/custom names retain live classification and parsing. Cold catalog work is included in the audit. | [#1081](https://github.com/octanejs/octane/pull/1081); [audit](../benchmarks/descriptor-renderer/events.md) |
| DESC-02 | `reconcileDeoptChildren` indexes the live `childNodes` NodeList inside its mutation loop | Fixed | A live sibling cursor replaces indexed NodeList mutation. The 512 foreign-row control drops 133124→3589 sibling reads; ordering, survivor identity, foreign nodes, portals and hydration remain covered. | [#1081](https://github.com/octanejs/octane/pull/1081); [audit](../benchmarks/descriptor-renderer/children.md) |
| DESC-03 | `descNeedsBlocks` walks the descriptor subtree before the reconcile walks it again | Retained contract; ownership bugs fixed | Classification depends on resolving scope and cannot cache by descriptor identity/epoch. Scoped child transitions retain accepted descriptors and ownership; the independently found stable-array context dependency bug is fixed by #1082. | [#1081](https://github.com/octanejs/octane/pull/1081); [#1082](https://github.com/octanejs/octane/pull/1082); [audit](../benchmarks/descriptor-renderer/README.md) |
| DESC-04 | `applyHostProps` re-writes every attribute, class and handler without diffing | Fixed and retained | Matching live string attributes, classes and delegated handlers skip writes. Special properties, mutable coercion and external DOM repair keep their existing paths. | [#1081](https://github.com/octanejs/octane/pull/1081); [audit](../benchmarks/descriptor-renderer/props.md) |
| DESC-05 | `projectSelectValue` indexes the live `HTMLOptionsCollection` 3–4× per option and runs twice per render | Fixed and retained | Each indexed select option is reused locally. Both required projections and the full pre-mutation journal remain for controlled selection, coercion and rollback. | [#1081](https://github.com/octanejs/octane/pull/1081); [audit](../benchmarks/descriptor-renderer/forms.md) |
| DESC-06 | `setFormControlSources` allocates an `assign` closure and does five `propertyIsEnumerable.call`s per spread per render | Fixed and retained | Aggregated hosts reuse resolved raw writers; the compatibility resolver loses its assign closure. Required own-enumerable probes remain (4/input, 3/select, 2/textarea spread). | [#1081](https://github.com/octanejs/octane/pull/1081); [audit](../benchmarks/descriptor-renderer/forms.md) |
| DESC-07 | `compilerCacheImmutableArrayFilter` re-validates intrinsics with five `Object.getOwnPropertyDescriptor` calls on every memo hit | Retained contract | The current cost is four intrinsic descriptor checks, not five. Same-render sibling replacement defeats a per-flush cached verdict; mutation counterexamples require validation at each memo hit. | [#1081](https://github.com/octanejs/octane/pull/1081); [audit](../benchmarks/descriptor-renderer/README.md) |
| SSR-01 | Every component render copies the CSS map and head collections for a retry that almost never happens | Fixed and retained | The existing immutable snapshot cache now covers completed-boundary discarded fallbacks (832→688 copies and 8992→6688 entries/8 waves). Changed generations retain overwrite/transfer/deletion rollback; live-map aliasing loses accepted CSS. Nonempty list/VT snapshots retain owner paths/consumed flags; measured frame counters begin empty. Lazy HookPass Maps remain, and a shared hookPosition tuple fails reentrant memo/retry output (see metadata audit). | [#1077](https://github.com/octanejs/octane/pull/1077); [#1088](https://github.com/octanejs/octane/pull/1088); [final audit](../benchmarks/ssr-final-replay/README.md) |
| SSR-02 | `nextChildSegment`'s fast path is unreachable for compiled components | Retained after measurement | The direct path is reachable for children functions (128 direct segments in the children control). Ordinary compiled components require scoped segments; a parent-wide ordinal mutant loses authoritative keyed-row values during reorder/retry. Short pair-list counters and cached frame paths remain; a larger interned graph has no measured justification. | [#1077](https://github.com/octanejs/octane/pull/1077); [final audit](../benchmarks/ssr-final-metadata/README.md) |
| SSR-03 | Server `mapSlot` 2-arg guard calls `Object.getOwnPropertyDescriptor` per array element per render | Retained contract | 128 eligible elements require 128 descriptor queries plus one constructor and one species probe. Removing guards changes length snapshots, accessor/constructor effects or custom-species visible output; receiver/global caches miss later mutation. Normal, sparse and mutated arrays have clean/observed controls and rejected variants. | This PR; [final audit](../benchmarks/ssr-final-metadata/README.md) |
| SSR-04 | Per-list-item identity keys | Fixed and retained | Prior PRs removed flat/nested implicit serialization and scoped-counter overhead. Remaining type/path boundaries and UTF-16 encodings preserve delimiter, lone-surrogate and occurrence identity; compiled 128-row controls reach 128 scoped segments and 257 key encodings. Ordinal scope collapse demonstrably breaks reordered retry values. | [#1032](https://github.com/octanejs/octane/pull/1032); [#1035](https://github.com/octanejs/octane/pull/1035); [#1077](https://github.com/octanejs/octane/pull/1077); [final audit](../benchmarks/ssr-final-metadata/README.md) |
| SSR-05 | `isDocumentRoot` is where the response rope gets flattened, and the streaming path then copies it again | Retained after representation measurement | Actual renderer output has 1183 reachable cons strings before document classification and 1 cons root over flat storage afterward; document prefixing is flattened again at UTF-8 encoding. Node/Web transports emit identical 73834 bytes. A root flag adds provenance through dynamic output; prefix chunking adds a write/backpressure boundary while other consumers still inspect strings. No net benefit supports that protocol change. | This PR; [final audit](../benchmarks/ssr-final-replay/README.md) |
| SSR-06 | Three `toLowerCase()` allocations per dynamic attribute | Retained after measured alternative | Four direct attributes/input reach 512 attribute lowercase calls and 512 URL-name lowercase calls per 128 rows; spread identities add 512. The stateless ASCII-scan alternative has overlapping/slower timings and adds 103 raw/43 gzip bytes; it is rejected without claiming all lowercase costs can be removed. | This PR; [final audit](../benchmarks/ssr-final-metadata/README.md) |
| SSR-07 | `ssrHostElement` per-descriptor overhead in production | Retained after measured alternative | 129 hosts/root produce 129 namespace and context records. A bounded cache retaining up to 192 metadata records adds 235 raw/98 gzip bytes, has overlapping repeated-tag samples and a higher unique-tag median. Namespace, invalid-tag, reentrant coercion and finally-restoration controls justify retaining context state. | This PR; [final audit](../benchmarks/ssr-final-metadata/README.md) |
| SSR-10 | `ssrChildValue` allocates two closures and stacks two identity membranes per descriptor component | Retained contract | Flat component descriptors reach 258 render-closure events and 514 identity-key encodings. The outer descriptor scope and component scope govern replay identity, descendant evaluation and cleanup; collapsing them changes the ABI. Existing nested/reordered descriptor and isolation controls cover those boundaries; no measured benefit justifies a replacement. | This PR; [final audit](../benchmarks/ssr-final-metadata/README.md) |
| SSR-11 | `markChildrenBlock` writes a symbol expando onto a fresh closure per `<Comp>…</Comp>` per render | Retained contract | The 128-row compiled-children control reaches 128 marks. Public isChildrenBlock distinguishes callable template children from ordinary render callbacks; removing the marker fails rendered dispatch. Environment records/render objects change the callable contract and captures rather than merely eliminating an expando. | This PR; [final audit](../benchmarks/ssr-final-metadata/README.md) |
| SSR-12 | Streaming: done boundaries re-copy CSS/HEAD per wave, `ssrTry` allocates ~9 closures per boundary per pass, `settleFirstOfWave` attaches a new reaction per pending promise per wave | Fixed and retained | Direct boundary scans remove 131 arrays/4192 references over 32 waves; existing snapshots save 144 collection copies/2304 entries over 8 resource waves. Required 32-wave costs remain 528 membership visits, 496 ordinary read probes, 33 canonical passes, 1056 tries and 13728 closure evaluations. Lazy sync-thenable and stale-discovery-prop controls reject probe removal or discovery-output publication; arm-local closures preserve request/reentrant ownership. | [#1088](https://github.com/octanejs/octane/pull/1088); [final audit](../benchmarks/ssr-final-replay/README.md) |
| SSR-13 | Descriptor-path prop reads are megamorphic | Retained contract | Five open user-prop layouts are observed in the descriptor workload. Universal field filling changes own-key and omitted-versus-explicit children semantics, checked in rendered output. Shared scoped-child accessors remain; no prop-shape normalization or lifetime cache is introduced. | This PR; [final audit](../benchmarks/ssr-final-metadata/README.md) |
| LARGE-01 | `childSlot` `runtime.ts:24820-25734`: ~915 lines, 9.1 KB bytecode, 15 params, 75 registers, 600 B frame; 26 call sites with arities 5/7/8/9/13/14 and `anchor ∈ {Comment, Element, null, undefined}` | Retained after measurement | The compiled public-root control observes 7 childSlot calls per completed scenario, 8977 bytecode bytes and natural Maglev. Existing-slot bypass loses the null-to-host output; extracting initialization has no demonstrated end-to-end win and retains ownership/marker flags. Clean, diagnostic and observed semantic digests agree. Hydration/interruptions/context remain owning-suite coverage. | This PR; [audit](../benchmarks/client-hot-paths/functions-slots.md) |
| LARGE-02 | `componentSlotImpl` `:21579-22111`: ~533 lines, 3.6 KB, 14 params | Retained after measurement | The compiled public-root control observes 19 componentSlotImpl calls per completed scenario, 3539 bytecode bytes and natural Maglev. Existing-slot bypass loses fresh captures; stable type/key do not prove stable props/state/context. Generic/void entries already share a lifecycle core, and duplicating it has no measured benefit. | This PR; [audit](../benchmarks/client-hot-paths/functions-slots.md) |
| LARGE-05 | `ssrTry` `runtime.server.ts:7899-8270` (~370 lines + 9 nested closures), `ssrAttr` `:2246-2440`, `ssrHostElement` `:1636-1830` (~195 each). | Retained after measurement | All three are measured against actual function identities: ssrTry 3098 bytes, ssrAttr 1598 bytes, ssrHostElement 1292 bytes. Each naturally reaches Maglev and TurboFan in the 300-round diagnostic, with pending/rejected/static controls. Size is not a permanent-tier or throughput claim; field/parameter passing, reentrancy and serialization costs remain without a measured win for a split. | This PR; [final audit](../benchmarks/ssr-final-replay/README.md) |

## Already checked entries preserved from issue history

These 53 entries were already checked on the baseline issue; this PR preserves
those dispositions. Their corresponding PRs contain the measured fixes,
behavior regressions and retained alternatives. The prior audits remain the
source of performance numbers; this inventory does not rerun those experiments.

| ID | Original audit point | Recorded PRs |
| --- | --- | --- |
| ROOT-04 | `createdInRootRender` allocates a Set entry and an undo closure per created block | [#982](https://github.com/octanejs/octane/pull/982) |
| ROOT-05 | `journalForSlot` snapshots the whole keyed chain on any membership/order change | [#982](https://github.com/octanejs/octane/pull/982) |
| ROOT-08 | Transition renders under a resolved Suspense boundary pre-walk the subtree's effects | [#982](https://github.com/octanejs/octane/pull/982) |
| SHAPE-01 | Class fields are emitted with define semantics | [#989](https://github.com/octanejs/octane/pull/989) |
| SHAPE-02 | `BlockImpl` gains seven expandos after construction | [#990](https://github.com/octanejs/octane/pull/990) |
| SHAPE-03 | Compiled bodies stamp `_m$N`/`_k$N` expandos on the `slots` JSArray | [#1067](https://github.com/octanejs/octane/pull/1067) |
| SHAPE-04 | Scoped descriptors and their props objects are dictionary-mode | [#1013](https://github.com/octanejs/octane/pull/1013) |
| SHAPE-05 | `memo()` wrappers are dictionary-mode functions from the second wrapper on | [#1014](https://github.com/octanejs/octane/pull/1014) |
| SHAPE-06 | Hook cells and slots grow optional fields on divergent paths | [#1067](https://github.com/octanejs/octane/pull/1067) |
| SHAPE-07 | SSR `Frame` records get `namespace` after construction | [#999](https://github.com/octanejs/octane/pull/999) |
| SHAPE-08 | Un-seeded DOM expandos | [#1015](https://github.com/octanejs/octane/pull/1015) |
| SHAPE-09 | Holey arrays on hot reads | [#1067](https://github.com/octanejs/octane/pull/1067) |
| HOOK-01 | Base hooks inside any custom hook rebuild a string and call `Symbol.for` every render | [#1076](https://github.com/octanejs/octane/pull/1076) |
| HOOK-02 | `Map<HookSlot, any>` per hook read where the compiler already hands out a dense numeric base | [#1076](https://github.com/octanejs/octane/pull/1076) |
| HOOK-03 | Per-render allocations in hook entry points | [#1076](https://github.com/octanejs/octane/pull/1076) |
| HOOK-04 | Per-consumer `$$ctxCache` Map and double probes on context reads | [#1019](https://github.com/octanejs/octane/pull/1019), [#1076](https://github.com/octanejs/octane/pull/1076) |
| HOOK-05 | Parallel-use warm plans allocate per render | [#1020](https://github.com/octanejs/octane/pull/1020), [#1024](https://github.com/octanejs/octane/pull/1024), [#1028](https://github.com/octanejs/octane/pull/1028), [#1076](https://github.com/octanejs/octane/pull/1076) |
| HOOK-06 | `useBatch([ctx])` per render for plain context reads | [#1018](https://github.com/octanejs/octane/pull/1018) |
| FLOW-01 | Residual effect/ref postorder ancestry work: | [#998](https://github.com/octanejs/octane/pull/998), [#1070](https://github.com/octanejs/octane/pull/1070) |
| FLOW-02 | `runEffectBody` allocates `[]` per no-deps effect and both drains do a hooks-Map lookup per entry | [#1023](https://github.com/octanejs/octane/pull/1023), [#1070](https://github.com/octanejs/octane/pull/1070) |
| FLOW-03 | `sortWaveByDepth` rebuilds a Set, a Map, a path array and a comparator closure per multi-block flush | [#1070](https://github.com/octanejs/octane/pull/1070) |
| FLOW-04 | `renderBranchSlot` is 478 lines whose common same-branch path is the tail | [#1090](https://github.com/octanejs/octane/pull/1090) |
| FLOW-05 | `mountItemsLinear` builds a `mounted: Block[]` used only on the throw path | [#1006](https://github.com/octanejs/octane/pull/1006) |
| DOM-01 | Statically named attributes take the fully dynamic `setAttribute` path | [#1068](https://github.com/octanejs/octane/pull/1068) |
| DOM-03 | Multi-root templates drain children one `insertBefore` at a time | [#1068](https://github.com/octanejs/octane/pull/1068) |
| DOM-04 | `htext` creates and appends a Text node per text-only child | [#1068](https://github.com/octanejs/octane/pull/1068) |
| DOM-06 | `composedPath()` is built twice per delegated event (three for the focus family) and discarded on the common path | [#1016](https://github.com/octanejs/octane/pull/1016) |
| DOM-07 | A closure + `setTimeout(…, 0)` per trusted discrete event once any `onXxxCapture` for that type exists | [#1017](https://github.com/octanejs/octane/pull/1017) |
| DOM-08 | Per-event string concat and ~8 `Set.has(type)` probes | [#1068](https://github.com/octanejs/octane/pull/1068) |
| SSR-08 | `vtSsrClaimArm` flattens every Suspense/`@try` boundary's cons-string with no ViewTransition on the page | [#1000](https://github.com/octanejs/octane/pull/1000) |
| SSR-09 | `spliceHead` scans the whole body for `</head>` whenever any head element was hoisted | [#1001](https://github.com/octanejs/octane/pull/1001) |
| UNIV-01 | `delete props.key` normalises every keyed component's props | [#1086](https://github.com/octanejs/octane/pull/1086) |
| UNIV-02 | Host props `delete`d for events/lifecycles/local callbacks become dictionary-mode `LogicalRecord.props` and command payloads | [#1086](https://github.com/octanejs/octane/pull/1086) |
| UNIV-03 | `materializeNode`/`materializeValue` allocate an O(depth) identity-path array and a one-element result array per node per render | [#1086](https://github.com/octanejs/octane/pull/1086) |
| UNIV-04 | Per-owner draft allocates six collections, then `executeOwner` throws three away and reallocates | [#1009](https://github.com/octanejs/octane/pull/1009) |
| UNIV-05 | Every child owner claim rebuilds a replay-path array and touches the identity trie (three Map walks) | [#1010](https://github.com/octanejs/octane/pull/1010) |
| UNIV-06 | Transported roots allocate a `WeakSet` per prop value via a default parameter, plus a codec context object and closure per prop | [#1004](https://github.com/octanejs/octane/pull/1004), [#1005](https://github.com/octanejs/octane/pull/1005), [#1086](https://github.com/octanejs/octane/pull/1086) |
| UNIV-07 | `useRef` cells are accessors whose getter scans all draft owners | [#1011](https://github.com/octanejs/octane/pull/1011) |
| UNIV-08 | Every commit deletes and re-inserts every listener in three collections and allocates a dispatcher closure per listener | [#1008](https://github.com/octanejs/octane/pull/1008) |
| UNIV-09 | Duplicate-key validation runs 2–3× per keyed list per render with a fresh Set each time, in production | [#1086](https://github.com/octanejs/octane/pull/1086) |
| UNIV-10 | Hook-slot symbols rebuilt via array spread + `Symbol.for` per nested hook | [#1026](https://github.com/octanejs/octane/pull/1026), [#1076](https://github.com/octanejs/octane/pull/1076) |
| UNIV-11 | The retention fast path walks the retained subtree with `Object.values(props)` per host | [#1086](https://github.com/octanejs/octane/pull/1086) |
| UNIV-12 | Blueprint records have nine literal shapes and host commands fourteen | [#1086](https://github.com/octanejs/octane/pull/1086) |
| UNIV-13 | `createPreparedTransaction` is 1,877 lines / 26.7 KB of bytecode with ~20 closures and ~15 Sets/Maps per commit | [#1086](https://github.com/octanejs/octane/pull/1086) |
| COMPILER-01 | Client array destructuring of `__extra` in every `@for` item and `@if` arm body | [#992](https://github.com/octanejs/octane/pull/992) |
| COMPILER-02 | `HandlerBundle` literals start with a computed Symbol key | [#991](https://github.com/octanejs/octane/pull/991), [#995](https://github.com/octanejs/octane/pull/995) |
| COMPILER-03 | Array/object `class` values get no change guard: unconditional clsx compose and `className` write | [#996](https://github.com/octanejs/octane/pull/996) |
| COMPILER-04 | Multi-statement inline handlers re-allocated per render and re-written on the update path | [#1078](https://github.com/octanejs/octane/pull/1078) |
| COMPILER-05 | `@if` env tuples allocated eagerly even when the arm is absent, and rebuilt at every nesting level | [#1078](https://github.com/octanejs/octane/pull/1078) |
| COMPILER-06 | Server codegen: an IIFE per attribute hole, a thunk + key IIFE per keyed item, `Array.from` per `@for` | [#1078](https://github.com/octanejs/octane/pull/1078), [#1077](https://github.com/octanejs/octane/pull/1077) |
| COMPILER-07 | `useState` references `arguments.length` | [#1078](https://github.com/octanejs/octane/pull/1078) |
| LARGE-03 | `renderBranchSlot` `:30560-31037` (478 lines), `reconcileKeyed` `:33023-33497` (475), `forBlock` `:32072-32340` (269), `mountItem` `:33703-33930` (228; the client-mount path is the last ~60 lines, the hydration half is dead weight in the same unit), `renderBlockInner` `:6880-7150` (270, nested try/catch/finally), `setAttribute` + `coerceAttrValue` (~180 + ~150), `useState` with inline setter (~160), `mapSlot` (client) `:24404-24555` (152, `arguments.length` dispatch) | [#1090](https://github.com/octanejs/octane/pull/1090) |
| LARGE-04 | `createPreparedTransaction` `universal-core.ts:9983-11859` (26.7 KB), `materializeValue` `:3056-3691` (10.2 KB), `materializeNode` `:3692-3904` (3.7 KB) | [#1086](https://github.com/octanejs/octane/pull/1086) |

## Items without original checkboxes

### Escaping

The historical `escapeHtml` paragraph predates merged [#1073](https://github.com/octanejs/octane/pull/1073).
The current guard uses a non-global regexp for strings under 32 characters and
three `indexOf` scans for longer strings. The original global-regexp bookkeeping
claim is stale. The measured all-length `indexOf` alternative regressed the
small-string control; the length split and escaping passes are retained. See
[the recorded experiment](../benchmarks/ssr-throughput/README.md#escape-pre-scan-split-by-length--2026-09-12)
for source revision, commands, output equality and run-to-run spread. The final
metadata audit does not claim another escaping optimization.

### Original validation harness gaps

| Historical claim | Current evidence and remaining action |
| --- | --- |
| `memo-wall` has only one wrapper | Stale: `memo-wall/octane-tsrx/src/rows.tsrx` has two distinct wrappers (`Row` and `Inner`), through compiled and descriptor walls. Native context updates must cross both. `memo-wall` has 9 committed ratios. The registered `memo-wrapper-shapes` suite additionally samples 128/1024 distinct client/server wrappers with plain/data-function and live-default/HOC controls. Shape results remain V8 diagnostics, not ordinary correctness requirements. |
| No Suspense inside a list | The existing `streaming-ssr/octane/src/App.tsrx` already places a per-card `@try` under a keyed `@for`, covering SSR waves. This PR adds a separate real-browser client control with 64 independently pending keyed rows, two memo wrappers, odd/even settlement waves, unchanged update, reverse and unmount. It checks visibility, own row values, survivor/input identity, input draft, focus during settlement, native events and exactly-once effect cleanup. |
| `octane-jsx-naive` is not gated | The `js-framework-deopt` CLI suite already builds/runs it; its driver fails on semantic errors, but there were no ratio entries for that suite. This PR connects the existing actual naive JSX/TSRX named-call/style-work driver to deterministic ratios through `audit-981-coverage`, comparing clean versus observed semantic hashes. `descriptor-renderer` separately has 163 guards for descriptor events, children, props and forms. |

The weekly/manual [Bench workflow](../.github/workflows/bench.yml) runs
`node benchmarks/bench.mjs --quick --ratios` without a suite filter; therefore
registered suites and their guards are included. This wiring audit is not a
claim that the full weekly matrix ran locally. The targeted coverage commands,
measurements and limits are in [the coverage audit](../benchmarks/audit-981-coverage/README.md).

The old harness table is historical guidance, not current test policy: private
map/shape probes and generated-code work counts belong in benchmark diagnostics;
ordinary tests assert output, identity, lifecycle, errors and public contracts.

## Correctness findings discovered during the audit

| Finding | Disposition |
| --- | --- |
| Same-drain keyed `@empty` clear/refill ownership | Fixed by [#986](https://github.com/octanejs/octane/pull/986); tracked issue #984 is closed. |
| Enumerable-symbol rollback and urgent keyed-row update lost during suspended removal | Fixed by [#1079](https://github.com/octanejs/octane/pull/1079). |
| Same-module Provider A→B→A stale output | Fixed by [#1080](https://github.com/octanejs/octane/pull/1080). |
| Scoped descriptor shape/tag/key upgrades and survivor adoption | Fixed by [#1081](https://github.com/octanejs/octane/pull/1081). |
| Stable-array scoped context dependencies, independently compiled Provider bodies, mixed full/lite slots, changing lazy module bodies | Fixed by [#1082](https://github.com/octanejs/octane/pull/1082), including memo-wrapped lazy bodies and stale memo witnesses found in review. The ownership audit records failed frozen-baseline controls and unchanged-body memo controls. |

These findings are resolved in the baseline history. The previously omitted
`childSlot` and `componentSlotImpl` size investigations are explicitly resolved
as LARGE-01 and LARGE-02, with their own compiled controls and measured retained
designs.

## Handoff and issue cleanup

The server-runtime patch, including done-boundary snapshot helper reuse, applies
cleanly to concurrent [#1069](https://github.com/octanejs/octane/pull/1069) at
`f9bd88e8ef4adbf7da144f74972482259a8814b2`. This was a temporary-source patch
check after inspecting the live PR; its archived coordination task and worktree
were not changed. It establishes textual compatibility only. It does not
replace combined runtime tests after whichever PR merges first.

The issue body preserves its original measurements and per-PR history. Its
checkboxes should mean “implemented or explicitly investigated and retained”;
mark a previously unchecked entry only after the corresponding row has a final
disposition. While this PR is open, record its completed investigation and
current-head validation but leave its newly owned checkboxes pending merge.
The 15 fully resolved stale Root/DOM/descriptor boxes can be reconciled against
their already merged dispositions independently. The mixed client/SSR key and
spread rows are among the 16 entries completed here that await this PR's merge.
