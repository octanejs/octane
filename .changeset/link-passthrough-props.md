---
'@octane-ts/router': patch
---

`<Link>` now forwards arbitrary props (`data-*`, `aria-*`, `title`, `id`, `role`,
`style`, extra event handlers, etc.) onto the rendered `<a>`, matching react-router.
Previously only a fixed allow-list (routing props + `ref`/`class`/`className`/
`children`) reached the anchor and everything else was dropped. The routing props
(`to`/`params`/`search`/`hash`/`replace`/`target`) and active-state attributes still
take precedence over any same-named pass-through prop.
