---
'@octanejs/cmdk': patch
---

Rank filtered results with CSS `order` instead of relocating DOM nodes, render
items that have not been scored yet, and key registration teardowns per item.

Previously an item mounted while a search was active never rendered unless it
carried an explicit `value`, ranking orphaned item nodes when they lived inside
a keyed `@for`, source order never came back after a search was cleared, and
removing the selected item alongside a sibling left nothing selected.

`@octanejs/radix` is now a `workspace:*` sibling. It was pinned to the published
`0.1.12` so the port exercised the release consumers install, but the repo has
since made every sibling edge resolve through the workspace — an exact range
builds against a stale copy of source that lives in this checkout, and
`changeset version` rewrites it on release, desyncing the lockfile.

Group navigation (alt+arrow) and the ranking itself follow the ranked order too:
group stepping walked DOM siblings, and only matching items were ranked, which
left a force-mounted non-match at the top of its container. Force-mounted items
and groups also no longer keep a stale filter score — they register their value
through the same hook as items, so they were scored once against the empty
search and never refreshed, which let them outrank genuine matches.

Controlled selection updates now keep the input and list
`aria-activedescendant` synchronized with the selected option.
