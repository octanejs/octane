---
'octane': patch
'@octanejs/app-core': patch
---

Ship less signal code that a page never runs. The private views that stage a
component's redeclared `derived$` or `query$` until the renderer accepts the
render now ship only with modules that declare such a cell inside a component
or hook, so an application whose signals are all module declarations no longer
carries them. Router entries join streamed results without the HTML region
placement that no route registers, and native seed adoption is no longer part
of the chunk that islands and streamed-result bootstraps load. An islands-only
signal page loads about 2.8 kB gzip less.
