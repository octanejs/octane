---
'@octanejs/three': patch
'@octanejs/ink': patch
---

Count authored JSX children as a component's `children` prop in the
renderer-local JSX namespace.

Under `jsx: preserve`, children written between a component's tags now satisfy
a required `children` prop, so `<Suspense fallback={null}><Scene /></Suspense>`
no longer reports that `children` is missing. A child that does not match the
prop's type is now reported.
