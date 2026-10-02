---
'octane': patch
---

Discard and report the server's `@if`/`@switch` arm when the client's arm renders nothing during hydration. An `@if` with no client arm already discarded the server content and reported it as an empty branch, but a client arm with an empty body, such as `@else { <></> }`, left the server's other arm on screen with no report. Hydration now removes that content and reports one structural `onRecoverableError`, with a development diagnostic at the directive. When the server arm starts with an element or text node rather than a range, it is still kept.
