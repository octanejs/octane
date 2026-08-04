---
'@octanejs/shadcn': patch
---

Fix the Base UI `radio-group` item rendering as a thin vertical bar instead of a circle.

Base UI's `Radio.Root` renders a `<span role="radio">` where Radix's renders a `<button>`. A
`<button>` is `display: inline-block`, so Radix's class string never needed a display utility and
`size-4` worked; a bare `<span>` is `display: inline`, where width and height are ignored. The box
collapsed and only `border` painted, leaving a sliver beside each label. The React Aria base, whose
root is also not a button, already carries `relative flex` for this reason.

The indicator is now `size-full` rather than `relative`, so the dot — positioned with `absolute` and
a `-translate-1/2` pair — anchors to the root's box and centres, matching the React Aria base.
Left `relative`, it resolved against a zero-sized flex item.

Covered by a test that requires every span-rooted control in this base (checkbox, switch, radio) to
declare a display, since the same mistake is available to each of them.
