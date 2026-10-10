# Public Valdi compiler fixture

`upstream.json` pins the public `Snapchat/Valdi` commit and SHA-256 of the
Workspace/source-map dependency closure and root license. No Valdi source is
vendored here. Setup downloads verified files into a caller-selected cache
outside the checkout and transpiles them without modifications.

The companion package declares ISC; the pinned root `LICENSE` is retained with
the downloaded source. Dependency versions match the public companion lockfile;
`package-lock.json` records public npm tarball URLs and integrity values.

This builds the JavaScript Workspace fixture, not the Swift compiler or a native
application. The test uses the existing synthetic writer recorder; a published
adapter and native lifecycle validation remain separate work.
