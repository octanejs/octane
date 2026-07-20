# Third-party notices

The Start compiler, route generator, router plugin, client runtime, and server
runtime in this package are derived from TanStack Router pull request #7847,
snapshot `753f919e`, and later Octane-specific fixes maintained in this
repository. That work is copyright Tanner Linsley and TanStack contributors and
is used under the MIT License shipped with this package.

The native streaming path is adapted to Octane's `StreamOptions.injection` API
so streamed router HTML is merged by the renderer rather than by a byte-level
post-processing transform.
