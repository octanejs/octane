---
'octane': minor
---

Strong mode now rejects element descriptor APIs with `OCTANE_STRONG_ELEMENT_API`: importing or reaching `createElement`, `cloneElement`, `isValidElement`, `Children`, or `descriptorChildren` from `octane`, or `jsx`, `jsxs`, `jsxDEV`, or `Fragment` from an Octane JSX runtime entry. Descriptors render through the generic descriptor renderer instead of compiled templates. Write template JSX, pass the component itself (`icon={Plus}`), or pass a `() => @{ … }` render function. Type-only imports stay valid.

Strong `.tsrx` modules also reject a single-item `@for`, such as `@for (const item of [value]; key item)`, with `OCTANE_STRONG_SINGLE_ITEM_FOR`. A `const` holding a one-item literal that nothing but `@for` headers reads is rejected too. To remount a subtree when a value changes, wrap it in `<Fragment key={value}>…</Fragment>` or key its only element or component. To render one value, render it directly.
