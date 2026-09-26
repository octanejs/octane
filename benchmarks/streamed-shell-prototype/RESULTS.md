# Static-shell experiment results

Measured on 2026-09-25 at Octane commit `e813fc0e6dd017a58e3988cf0ac36fa8e28c187e`,
using Node 26.4.0 and Vite 8.1.5. These synthetic production builds report
compressed file sizes, not network transfer, CPU time, or application results.
The prototype is hand-authored and does not include a general fallback.
These measurements predate the framed-root recovery fix; the refreshed rich
fallback comparison is in [RICH-FALLBACK-RESULTS.md](RICH-FALLBACK-RESULTS.md).

| Comparison | Baseline JS gzip bytes | Candidate JS gzip bytes | Difference |
| --- | ---: | ---: | ---: |
| Static shell with live counter, compiler-specialized surrogate | 62,960 | 61,874 | -1,086 (-1.7%) |
| Same static shell, generic surrogate | 62,960 | 94,091 | +31,131 (+49.4%) |
| Streamed signal shell, generic hydration in both | 128,865 | 128,345 | -520 (-0.4%) |
| Separate rich streaming fixture, renderer vs authored bindings | 115,583 | 36,440 | -79,143 (-68.5%) |

The static and rich totals include all reachable JS files, including the
on-demand chunk, with each physical file compressed separately. The rich fixture
also has the same 811-byte raw early inline capture in both variants; it is not
included in the table. The streamed-shell measurement contains only its client
JS: it excludes HTML, CSS, stream frames, app bootstrap, and fallback code. The
static-shell HTML and CSS are recorded in its build report; CSS is explicitly
imported in both entries. Both shell builds use Vite library-mode ESM, not an
application route. The rich fixture uses a different host-owned binding
integration and is not an automatic version of the shell surrogate.

The streamed behavior test compares the ordinary compiled shell and the
surrogate when the second signal result arrives before or after activation. It
checks the same DOM nodes, an edited input, an interactive child, the server
producer, absence of a duplicate browser load, and cleanup. The test executes
source under jsdom; the streamed production build is a separate size check.
The static matrix executes its emitted ESM in jsdom and checks node identity,
the adjacent static sibling, focus, updates, dynamic import, and observable
module-effect ordering. The negative control demonstrates an effect that an
optimizer must not drop.

Bundled Chromium 149.0.7827.55 also passed the static matrix using the emitted
assets: all six valid variants preserved shell, child, and adjacent-sibling
identity through activation and two clicks; focus survived activation and both
clicks updated the counter. The explicitly imported CSS applied, effect order
was preserved, and the dynamic chunk was requested. The negative control showed
its missing side effect. This does not establish automatic CSS discovery or an
application route's bootstrap.

The separate rich fixture passed six Chromium samples per presentation, two of
them warmups, covering both a stationary view and navigation away and back. The
checks include interleaved streams, draft preservation, lazy map activation,
keyed list changes, and fencing late results during navigation. Both requested
only `behavior.js` at startup and fetched the map chunk on activation. The
complete HTML response was 31,427 raw bytes for each presentation. This is a
small local browser fixture, not transferred-byte or runtime performance
evidence. The exact streamed-shell surrogate was tested in jsdom, not Chromium.

## Delayed activation and graph follow-up

The rich fixture was extended to hold the presentation entry while actual
stream results arrived in the browser's pre-module mailbox. In `before`, both
streams completed before activation. In `split`, revision 1 arrived before
activation and revisions 2–4 arrived afterward. Chromium 149 passed twelve
samples per presentation: one warmup and two measured samples for each of
`stay`, `roundtrip`, `before`, and `split`. The delayed lanes checked the
visible result, selected original and surviving nodes, a pre-activation draft edit,
native map interaction, view retirement and return, loader counts, and
recoverable hydration errors. The streams use document-owned module signals;
this does not prove ownership of an instance-local streamed query.

In this follow-up, the renderer and authored-binding initial `behavior.js`
files were 115,506 and 36,386 gzip bytes, respectively: 79,120 fewer bytes
(-68.5%) for the authored version. Both also loaded the same 91-byte gzip lazy
chunk on map activation. The HTML was 31,427 raw bytes for both versions and
still included inline capture and stream scripts. These are local compressed
file sizes for a hand-authored presentation, not transferred-byte or application
latency measurements, and they do not include a general automatic fallback.

The separate report-only Vite graph prototype found one direct root and 15
definitions connected by syntactic JSX paths in Cinebase. Its one static-markup
lead is a Suspense fallback that may mount again, illustrating why static-looking
syntax alone does not prove that a component can be omitted. In Signal Chat,
the generated bootstrap's hydration target remained unresolved. The report
records its route-module hints but cannot use them to estimate eligibility.
See [graph/README.md](graph/README.md) for the reproductions, output comparisons,
and other limits of the report.

The surrogate assumes an already-resolved, exact DOM shape and claims that
existing root with `clone`; it does not validate the expected root shape. It
does not implement pending activation, fresh mounts, root updates, remounts, or
mismatch recovery. A [separate diagnostic](nested-query-owner/README.md)
characterizes an existing nested-query hydration case in the ordinary compiled
path that starts a browser loader and reports a mismatch; the owner explanation
remains a hypothesis.

The build and checking commands, variants, and output reports are described in
[README.md](README.md). The larger potential saving appears when an entire
renderer can be excluded, but a production design still needs a sound claim and
fallback contract, serialized ownership, and a real-application comparison.
