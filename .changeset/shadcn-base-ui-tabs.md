---
'@octanejs/shadcn': patch
---

Add `tabs` to the Base UI base, at `@octanejs/shadcn/base-ui/Tabs`. That base now covers 40 of 44
families. Transcribed from upstream's Base UI source, class strings verbatim.

Runs on the `Tabs` primitive ported into `@octanejs/base-ui` for this family.

One departure from that source, forced by a version skew rather than a porting choice: upstream
writes its orientation variants as bare `data-horizontal:` / `data-vertical:`, while the pinned
primitive (v1.6.0) emits `data-orientation="horizontal" | "vertical"`. Left as written, the root
would never switch to a column and every `group-data-*/tabs` selector on the trigger would be dead,
so they are written as `data-[orientation=…]:` here. This is the same skew the `slider` hit. When the
binding moves to a release emitting the bare attributes, these revert to upstream's spelling.

`data-active` needed no adaptation — the pin emits it exactly as upstream's classes expect.
