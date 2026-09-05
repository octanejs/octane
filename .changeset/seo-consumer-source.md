---
'@octanejs/seo': patch
---

Compile and run this package's published source outside Node.

The package ships `src/` and points its exports at it, so an application
compiles these files with its own tsconfig and runs them in its own host. Both
halves of that were broken.

`useStrayOwnerDiagnostic` read `process.env.NODE_ENV` with nothing declaring
`process`. In the repository the package's own tsconfig pins `types: ["node"]`,
which hid it; a browser application has no `@types/node`, so the file failed to
compile, and a host that substitutes nothing threw a ReferenceError out of every
`<Head>` render. The reference is now declared locally and guarded with `typeof`,
and stays spelled out as `process.env.NODE_ENV` so bundlers still substitute it.

The rest is `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, which
plenty of applications turn on. `SeoConfig`'s fields now admit `undefined`
alongside being optional, which is what they have always meant: `applyConfig`
and the registry merge read every one of them with an `!== undefined` test, so
an absent key and a present `undefined` behave identically, and `<Seo>` can go
on passing its optional props straight through. The two loops that index an
array they just measured say so.

No behavior changes for an application that already built.
