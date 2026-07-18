---
'octane': patch
---

Streaming SSR: add `StreamOptions.injection` (`StreamInjectionSource`) — merge a live stream of externally-produced HTML (e.g. a framework's data `<script>` tags) natively into `renderToPipeableStream` / `renderToReadableStream` output. Injected HTML is emitted verbatim, in push order, each drain as its own chunk strictly between tag-complete renderer chunks — never before the shell; for document renders the `</body></html>` tail is held and written last, and the stream closes only once rendering is complete and the source's `done` promise settles. Without the option, streamed output is unchanged.
