---
'octane': minor
---

Strong mode now rejects element descriptor APIs outside `.tsx` and `.jsx` with `OCTANE_STRONG_ELEMENT_API`: importing or reaching `createElement`, `cloneElement`, `isValidElement`, `Children`, or `descriptorChildren` from `octane`, or `jsx`, `jsxs`, `jsxDEV`, or `Fragment` from an Octane JSX runtime entry. Descriptors render through the generic descriptor renderer instead of compiled templates. Write template JSX, pass the component itself (`icon={Plus}`), or pass a `() => @{ … }` render function. Type-only imports stay valid, and Strong `.tsx` modules may keep these APIs.
