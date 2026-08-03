---
'@octanejs/shadcn': patch
---

Add `pagination` to the Base UI base, at `@octanejs/shadcn/base-ui/Pagination`. That base now covers
30 of 44 families. Transcribed from upstream's Base UI source, class strings verbatim.

The link composes through `Button` with `nativeButton={false}` and `render={<a/>}`. The Radix base
writes `<Button asChild><a/></Button>`, where Slot is a pure prop-merger; Base UI has no Slot, and
`nativeButton={false}` is its documented escape for a Button that is not a native `<button>`.

The two bases therefore diverge observably, and that is upstream's choice rather than a porting
artifact: these links carry `role="button"` and `tabindex="0"` where the Radix base's plain anchor
carries neither. That is the trade that keeps keyboard activation working on a non-button element.

Children are passed explicitly rather than riding along in the props spread, since octane routes
them through its own channel where React's `ComponentProps<"a">` carries them.
