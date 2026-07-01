---
"octane": patch
---

Fix a crash (`Cannot read properties of null (reading 'parentNode')`) when a template
interleaves sibling text holes with component or control-flow holes — e.g. a metadata row
like `{score} <Link/> {time} <Link/>`.

A sibling-position `{x as string}` text hole mounts via `htextSwap`, which replaces its `<!>`
placeholder with a text node, DETACHING the placeholder. The compiler was emitting that mount
before later element walks that navigate *from* the placeholder (`sibling(_el, n)` for the next
text hole AND for the following component/control-flow anchors), so those walks read a detached
node, returned `null`, and `htextSwap(null)` threw. The compiler now defers sibling-text-hole
mounts until after every element walk is emitted, so all navigation happens on the intact
template.
