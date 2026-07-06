---
'octane': patch
---

SSR now renders member-expression / dynamic JSX tags (`<obj.tag/>`, `<{expr}/>`) whose runtime value is a host tag STRING — e.g. MDX's `_components.h1` mapping, unoverridden. `ssrComponent` routes a string comp to the host-element serializer inside the same single `<!--[-->…<!--]-->` block a component body gets (the client's de-opt descriptor shape), instead of calling the string as a component body (`TypeError: comp is not a function`). Dispatch stays dynamic: the same tag site renders a component when the runtime value is a function, and hydration adopts either shape without mismatch. Injection-unsafe tag strings still throw (`Invalid tag`), matching the client where `document.createElement` rejects them.
