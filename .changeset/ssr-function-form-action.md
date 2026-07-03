---
"octane": patch
---

SSR: drop function-valued `action`/`formAction` instead of serialising the source.

A React 19 function action — `<form action={fn}>`, `<button formAction={fn}>`,
`<input formAction={fn}>` — is submit wiring for the client's `setFormAction`,
not a URL. The server emitter used to serialise the function's source text into
the HTML attribute, leaving pre-hydration markup with function source as a
navigable action. It now drops function values (mirroring the client's tag+name
condition); string values still serialise, under the native lowercase
`formaction` name the client also uses.
