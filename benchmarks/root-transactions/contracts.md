# Root suspension and live DOM values

This audit covers the nullable root transaction driver and binding-cache DOM
rollback proposals in [#981](https://github.com/octanejs/octane/issues/981).
The contract is recorded in
[Suspense divergence §10](../../packages/octane/audit/SUSPENSE_DIVERGENCE.md#10-client-suspension-without-a-boundary--root-hold-and-retry).

## One safe read reduction

Descriptor text updates already compare the live `nodeValue` with the next text.
Previously, a changed value caused `journalText` to read the same value again.
The writer now passes its immediately preceding live value to the journal.
Compiled text bindings still read the DOM once when recording an undo entry;
their authored-value cache is not a substitute for live DOM.

The comparison and journal entry have no intervening application callback.
The hidden-text writer still runs before this path, and unchanged text retains
the existing early exit. This changes neither coercion nor publication order.

`contracts.mjs` compiles the same existing fixture into a production bundle and
uses public roots for 128 changing and 128 equal-value updates. The descriptor
fixture uses public `createElement`; the control uses compiled text bindings.
An accessor delegates every read and write to the DOM implementation's original
`nodeValue` getter/setter and counts reads of the retained label text node.
The probe checks final text, title, reader output, label/text identity, and empty
DOM after unmount.

| Live `nodeValue` reads | Baseline `ade5be862` | Candidate |
| --- | ---: | ---: |
| Descriptor, changing text | 256 | 128 |
| Descriptor, equal text | 128 | 128 |
| Compiled binding, changing text | 128 | 128 |
| Compiled binding, equal text | 0 | 0 |

These are deterministic reads, not a browser latency or heap-allocation claim.
Measurements used Node 24.20.0 and Happy DOM. Both public and compiler-internal
imports resolve to the selected source checkout, so baseline comparisons cannot
accidentally load two different runtimes.

```sh
node benchmarks/root-transactions/contracts.mjs
node benchmarks/root-transactions/contracts.mjs /path/to/baseline --reads-only
```

The baseline runtime and compiler come from the selected checkout; both runs use
the current fixture. Output includes source hashes, operation counts, and
semantic controls. `BENCH_JSON` writes the same report for the ratio runner.
The `text-descriptor` and `text-compiled` targets have `changed_reads` and
`equal_reads`, measured against corresponding `*-work` targets of 128 updates.

## Retain arming before render

A previously synchronous component can throw its first raw thenable after an
earlier sibling changed text or attributes. A nullable driver installed only
after that throw cannot recover the preceding DOM values. Importing or using
`use`, `lazy`, Suspense, or Activity is not required to throw a raw thenable.

The committed experimental control suppresses the active journal for a mounted
root until its first raw suspension. It retains only the owner transaction shell
required by the current root request entry points, avoiding incidental null
dereference failures. This deliberately invalid alternative preserves node
identity and eventually retries, but the held label shows `replacement` instead
of `original` in both development and production. Installing the driver in the
throw path is too late to satisfy the hold contract.

**Disposition:** retain arming before user render code. This experiment isolates
the semantic requirement; it does not measure the performance of a usable gate.

## Retain live values for rollback

The other experimental control supplies the last committed label text and title
from a cache. These are strings, so the cache already gets the best case: no
coercion, aliasing, or serialization uncertainty. It preserves the ordinary
first-throw case, but loses all three external edit cases:

| DOM immediately before the attempted write | Cached rollback result |
| --- | --- |
| External text and title | Previous authored text and title |
| External text; title removed | Previous authored text; title recreated |
| External text; empty title | Previous authored text and nonempty title |

The live-value implementation preserves every case in both compile modes, and
successful retries apply the authored replacement. The read-reuse optimization
uses the value just read from the same node, preserving this requirement.

**Disposition:** retain the single live DOM read for compiled text and ordinary
attribute writes. A previous authored binding cannot prove the current DOM
value or distinguish an external removal from an empty attribute. The journal
does not add an external-mutation cache or an ownership promise.

## Correctness and deliberate failures

The existing public `suspense-preserves-dom.test.ts` suite protects first raw
suspension after sibling writes. Added regressions cover descriptor text edited
outside Octane and absent/empty titles across successive attempts while the same
resource remains pending. They preserve the same element and text node, restore
each attempt's immediately preceding value, and apply the newest authored value
when the resource resolves.

An isolated build mutation that restores the wrong text failed the descriptor
regression in both compile modes. A separate mutation that normalizes absent
attributes to empty strings failed all four absent/empty executions. Neither
mutation edits the authored runtime. The full contract script also requires its
deliberately invalid alternatives to fail their hold controls; an unexpected
pass fails the audit, rather than silently describing an ineffective experiment.
