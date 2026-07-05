---
'octane': patch
---

Dynamic JSX tags that resolve to a host tag STRING at runtime (`<props.parts.title>` with `{ parts: { title: 'h1' } }`, `<Tag/>` with `const Tag = 'h1'`) now render correctly in template position. Previously the client's `componentSlot` created a block whose body was the string and crashed in `renderBlock` ("not a function"); the server likewise tried to invoke the string. Both now route the string comp through the host-element machinery: the client renders it via the de-opt host renderer (props/refs/events applied, the compiled `children` render-fn mounted as a block inside the element), and the server serializes `<!--[--><tag>…children block…</tag><!--]-->` so hydration adopts the element in place. Same tag across renders patches the element in place; a tag change or a string↔component flip tears down and remounts (React's element-type semantics). Value-position string tags (`.tsx` returns) were already handled and are unchanged.
