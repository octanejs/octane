# Landing source classifier

This separate, read-only probe asks whether the real `website-mcp` Landing
source falls within a small closed grammar. Acceptance alone is **not** a proof
that hydration may be removed; the separate
[`static-document` benchmark](../static-document/README.md) also needs its
host and emitted-output checks.

The classifier uses Octane's `@tsrx/core` parser. It accepts a single named,
synchronous, zero-argument `Landing` with no setup or imports; private,
unaliased dense arrays of primitive string pairs with the fixture's exact
binding names; keyed loops directly over
those arrays with unique first-column keys; and direct, bounded indexed text
reads. It accepts only a narrow native HTML parent/child grammar, literal
classes and simple literal HTTPS links. Events, refs, spreads, dynamic
attributes, expressions/calls, properties, custom elements, unsafe URL forms,
invalid nesting, unknown nodes, writes, aliases and shadowing decline. The
existing scoped stylesheet is accepted only at its exact source hash; this
probe makes no general CSS purity claim. It also requires successful normal
client and server compilation. It rejects ill-formed UTF-16, data control
characters, entity syntax, and ambiguous `pre` text; those restrictions avoid
known differences between streamed HTML parsing and hydration.

`node --test benchmarks/streamed-shell-prototype/static-document-analysis/analyze.test.mjs`
currently accepts the real Landing, an added ordinary comment, a changed heading
and a changed string in the private data, including well-formed astral emoji.
All 64 tests pass, including deliberate negative mutations. A separate test
invokes the real Octane compiler in client and server modes: the added comment
produces identical compiler output, while the changed heading changes both
outputs.

The classification assumes this module's closed world, ordinary unmodified JS
intrinsics and no outside script mutating its data or document. It does not
analyze the route graph, executable scripts or bundler plugins, and it does not
prove document ownership, static lifetime, HMR/remount/mismatch behavior, or
streaming and CSS retention. Those require separate host and emitted-output
checks. Ordinary SSR and its scoped CSS must remain intact for the document's
lifetime. The manually gated `static-document` experiment retains its own
route, template and final-output pins and ordinary fallback.

That experiment now uses this classifier in place of the Landing source-byte
check while retaining its explicit immutable-document contract, existing
generated-artifact pins and pre-response ordinary fallback. A disposable build
with an added comment passed the classifier and fixed output pins and selected
the no-bootstrap response; a separate event-handler build fell back and its
handler ran in Chromium. Another disposable build with a changed heading passed
the classifier but fell back because both the server and Landing client output
missed their pins. Accepting changed output needs a separately reviewed
emitted-output policy and matching behavior and delivery measurements. See the
[benchmark results](../static-document/README.md) for commands and evidence.
