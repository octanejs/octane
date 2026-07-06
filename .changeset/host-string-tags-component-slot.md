---
'octane': patch
---

Dynamic JSX tags that resolve to a host tag STRING at runtime (`<props.parts.title>` with `{ parts: { title: 'h1' } }`, `<Tag/>` with `const Tag = 'h1'`) now render correctly in template position on the client. Previously `componentSlot` created a block whose body was the string and crashed in `renderBlock` ("not a function") on both fresh mounts and hydration. The string comp now renders as a host element (props, refs, and delegated events applied via the de-opt prop machinery) with the compiled `children` render-fn inlined as the element's entire content — no nested marker block — matching the server's `<!--[--><tag>…</tag><!--]-->` emission so hydration adopts the element in place. Same tag across renders patches the element in place; a tag change or a string↔function flip tears down and remounts (React's element-type semantics). Value-position string tags (`.tsx` returns) were already handled and are unchanged.
