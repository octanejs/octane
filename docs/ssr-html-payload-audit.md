# SSR HTML payload audit

Measured on 2026-08-11 against `origin/main` commit `217a0b53810274ca83a82af91f5b3344a6e24ac0`,
using production builds from an isolated worktree. Every comparison below first
checks matching visible content; raw, gzip, and Brotli numbers are response
bytes, not JavaScript bundle sizes.

Every framework comparison verifies equivalent visible output before attributing
differences to Octane's compiler, hydration ranges, descriptor serialization,
or streaming transport. Application-specific composition differences are
outside this core audit.

## The ordinary news benchmark is not representative

| Production response | Raw HTML | gzip | Brotli | Comments | Comment bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| React, 50 news cards | 42,364 | 8,438 | 7,690 | 0 | 0 |
| Octane TSRX or JSX, same cards | 42,398 | 8,471 | 7,698 | 4 | 34 |

The 34-byte difference disappears when the four Octane hydration comments are
removed. Both Octane dialects already recognize the direct-host keyed rows and
omit their per-row hydration frames, so this fixture does not reproduce a large
SSR payload gap.

## Nested components and descriptors reproduce the reported overhead

The component-heavy throughput fixture renders the same 300 cards through the
compiled TSRX path and through generic `createElement` descriptors, the shape
used by framework bindings. The visible HTML is byte-identical after removing
comments.

| Production response | Raw HTML | gzip | Brotli | Comments | Comment bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Visible markup without hydration comments | 119,171 | 11,978 | 10,104 | 0 | 0 |
| Octane compiled TSRX, baseline | 138,989 | 12,399 | 10,328 | 2,402 | 19,818 |
| Octane compiled TSRX, shared component ranges | 134,189 | 12,307 | 10,243 | 1,802 | 15,018 |
| Octane binding-style descriptors, baseline | 157,619 | 12,656 | 10,610 | 4,806 | 38,448 |
| Octane binding-style descriptors, self-delimiting host items | 148,003 | 12,483 | 10,513 | 3,604 | 28,832 |

The comments add **16.6%** raw on the compiled path and **32.3%** on the
descriptor path. Compression reduces their incremental cost, but does not
remove it: the binding-style page still grows by 678 gzip bytes and 506 Brotli
bytes. Component-bearing keyed rows currently stack the list item's ownership
range around the nested component's own range.

The compiler reuses the component's existing hydration range for a keyed item
when the compiler proves that a same-module component has exactly one host root.
On this fixture it removes **600 comments / 4,800 raw bytes**, **92 gzip
bytes**, and **85 Brotli bytes**, while preserving hydrated node identity,
component state, events, keyed reordering, empty-list transitions, and explicit
component-key isolation.

Generic descriptor-authored lists can use the same ownership principle without
compiler metadata: a host descriptor whose actual serialized child is primitive
already resolves to exactly one element, so that element can delimit the keyed
item. The server omits its redundant item pair and the client adopts the
existing host as its own boundary. The eligibility proof must reuse the exact
child value the ordinary serializer already reads, preserving accessor and
Proxy behavior without introducing per-host allocation or registration. Arrays,
components, nested descriptors, text items, empty list items, fragments,
iterables, portals, and render functions retain their established protocol.
The descriptor-heavy fixture drops **1,202 comments / 9,616 raw bytes**, **173
gzip bytes**, and **97 Brotli bytes** while preserving identical visible markup,
observable property evaluation, keyed identity, and legacy marked hydration.

A rejected implementation registered every host descriptor in a private
`WeakSet`; although correct, that added approximately 15–20% to descriptor SSR
time. The final serializer-local proof introduces no per-host registration or
reflection. Across 36 alternating production runs of five renders each,
baseline and optimized medians were **1.615 ms** and **1.603 ms** per render;
the small 1.9% difference is within normal timing variation.

## Fully specified control flow can borrow its existing range

A dedicated production fixture renders 300 rows, each containing one fully
specified `@if`/`@else` and one `@switch`/`@default`. Every branch resolves to
exactly one ordinary host element; static SSR independently verifies the same
visible content.

| Production response | Raw HTML | gzip | Brotli | Comments | Comment bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Visible static markup | 36,352 | 2,771 | 2,427 | 0 | 0 |
| Hydratable control flow, baseline | 55,570 | 2,932 | 2,546 | 2,402 | 19,218 |
| Hydratable control flow, borrowed branch ranges | 45,970 | 2,850 | 2,490 | 1,202 | 9,618 |

The server previously wrapped each active branch in its own pair inside the
slot's existing pair. When every reachable arm is proven to produce one
non-hoisted host element, the branch can borrow that outer range during
hydration. Removing the redundant 600 inner pairs saves **9,600 raw bytes**,
**82 gzip bytes**, and **56 Brotli bytes** without changing the visible page.
Incomplete branches, setup statements, fragments, components, hoisted head
resources, and streaming boundaries retain their existing ownership protocol.

## A real TanStack Start application is worse

The same production Start app was built independently for React and Octane.
Navigation, loader content, HTTP status, initial state, and streamed deferred
content were checked before comparing responses.

| Route | React raw | Octane raw | React gzip | Octane gzip | Octane comments | Octane comment bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 3,155 | 8,053 | 1,375 | 1,697 | 382 | 3,585 |
| `/posts` | 7,153 | 13,256 | 1,900 | 2,235 | 526 | 4,762 |
| `/posts/3` | 7,698 | 14,094 | 1,977 | 2,312 | 550 | 5,000 |
| Missing post | 7,890 | 14,464 | 2,099 | 2,452 | 570 | 5,160 |
| `/deferred` | 5,098 | 10,910 | 2,143 | 2,654 | 396 | 3,697 |

After subtracting React's own few comments, comments explain approximately
**73–78% of the ordinary-route raw excess** and **62% of the deferred-route
excess**. The remaining weight includes router-managed asset identity
attributes, additional wrapper elements, and streaming protocol scripts.

The home route's `<head>` alone contains 190 comments consuming 2,049 bytes:

- 46 `rnh-…` ownership delimiters consume 897 bytes around 23 managed head
  assets.
- Another 144 ordinary range comments consume 1,152 bytes while surrounding no
  actual nodes; the assets were already hoisted elsewhere into `<head>`.
- The same 23 assets also carry 851 bytes of `data-tsr-managed-key` attributes.

For router-managed resources, the client adopts metadata through the unique
managed-asset attribute instead of the generic `headBlock` ownership protocol.
The generic ownership comments therefore duplicate an existing, stronger proof
for these particular resources. Ordinary framework-managed head resources still
need their ownership protocol for hydration, foreign-node isolation, cleanup,
and multiple roots; removing the protocol globally would be incorrect.

Rebuilding the same production Start application with the final core changes
removes two redundant descriptor-item pairs on every route:

| Route | Baseline Octane raw | Optimized Octane raw | Baseline comments | Optimized comments |
| --- | ---: | ---: | ---: | ---: |
| `/` | 8,053 | 8,021 | 382 | 378 |
| `/posts` | 13,256 | 13,224 | 526 | 522 |
| `/posts/3` | 14,094 | 14,062 | 550 | 546 |
| Missing post | 14,464 | 14,432 | 570 | 566 |
| `/deferred` | 10,910 | 10,798 | 396 | 392 |

Each ordinary route saves **32 raw bytes**. The deferred route saves **112 raw
bytes**: 32 from descriptor ownership ranges and another 80 from the two more
compact streaming carriers; gzip falls from **2,654 to 2,627 bytes**, and Brotli
from **2,306 to 2,271 bytes**. Embedded router timestamps introduce a few bytes
of compression noise between builds. The home route's 190 head comments remain
unchanged, so its larger response gap still requires the separate core head
ownership proofs described below.

## Streaming has a separate transport problem

The shared 10-boundary Suspense fixture renders the same visible product cards.
Before optimization, Octane writes **22,823 raw bytes** against React's
**11,758**; gzip is about **2,705 vs. 1,852 bytes**, and Brotli about
**2,015 vs. 1,412 bytes**.

Only 676 bytes of the directly visible Octane stream are comment markup. The
larger cost is ten JSON segment carriers totaling 16,148 bytes. Their decoded
HTML is 11,868 bytes; globally escaping every `<` as `\u003c` alone expands
the response by 2,600 raw bytes. Additional cost comes from JSON quoting,
per-boundary carrier and reveal scripts, a shared reveal runtime, and repeated
opaque boundary identifiers.

Escaping only closing `</script` is unsafe: `<!--<script` can put the HTML
tokenizer in its double-escaped script state and swallow the real carrier
terminator. Escaping both opening and closing script tokens keeps the carrier
safe while allowing ordinary HTML tags and hydration comments through unchanged.

With selective script-token escaping plus the keyed-component range sharing,
the ten-boundary stream falls from **22,823 to 20,163 raw bytes**, approximately
**2,705 to 2,631 gzip bytes**, and **2,015 to 2,006 Brotli bytes** in the final
run. Random per-stream boundary identifiers make high-quality Brotli results
vary by several dozen bytes between otherwise equivalent runs. Carrier payload
bytes alone decrease from 16,148 to 13,648; the other 160 raw bytes are ten
eliminated component-item marker pairs. The same cards, streamed reveals,
trusted raw HTML, hostile script-shaped input, and hydration adoption remain
covered by the existing semantic gates and new regression tests.

## Shorter comment syntax is not the preferred fix

HTML parsers accept nonstandard bogus-comment forms such as `<![>` and `<!]>`
as the same comment nodes produced by `<!--[-->` and `<!--]-->`. This cuts four
raw bytes per marker, but does not produce a comparable compressed improvement.

On the Start home route this transformation reduces 8,053 raw bytes to 6,525,
but gzip improves by only **21 bytes** and Brotli by **11 bytes**. On the
ordinary news page, Brotli becomes slightly larger. The spelling is also invalid
HTML, interacts with document-tail scanning, existing SSR snapshots, minifiers,
and other HTML processors, and does not remove any actual hydration work.

Removing proven redundant ownership ranges is preferable: it reduces both wire
bytes and parsed DOM bookkeeping without changing the public comment grammar.

## Follow-up work

1. Introduce an explicit core ownership proof for externally managed head
   resources so generic `rnh-…` delimiters can be omitted only when another
   validated identity already owns adoption and cleanup.
2. Investigate whether the core compiler and hydration runtime can prove that
   descriptor/component/control-flow ranges left empty by head hoisting have
   no remaining document-hydration owner before omitting them.
3. Extend the compiler's text-only proof where expression types can be verified
   without changing hydration semantics. A general renderable hole incurs a
   16-byte ownership pair, while adjacent dynamic text expressions still need
   an 8-byte separator unless they become one proven text node.
4. Keep Suspense streaming boundaries, portals, Activity ranges, ambiguous
   multi-root values, and adjacent dynamic-text separators unless a new
   ownership proof covers their existing behavior.
5. Re-run `pnpm --dir benchmarks/ssr-throughput bench:payload` and
   `pnpm --filter tanstack-start-bench bench:work` after each change; the
   payload audit and real-route work gate report raw/gzip/Brotli sizes,
   comment costs, and streaming-carrier overhead.
