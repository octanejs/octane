---
'@octanejs/shadcn': patch
---

Add `checkbox`, `switch` and `radio-group` to the Base UI base.

Their conditional utilities are adapted rather than copied. Base UI publishes bare
`data-checked`/`data-unchecked` where the Radix base publishes `data-state="checked"`, and every
Root renders a `<span role="…">` that is never `:disabled`, so `disabled:` variants become
`data-disabled:`. Copying either wrong form yields a control whose appearance never changes.

Both dialects are pinned by tests that assert the rendered DOM carries the attributes the class
strings target, so a wrong-base copy fails rather than rendering silently dead styling.
