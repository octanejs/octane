---
'octane': patch
---

Report a renderable value that hydration rebuilds once, including when it
suspends and its boundary retries. When the server rendered nothing where the
client renders a list, a fragment, or a keyed element, or where a component
returns a list or an element, hydration built the value without reporting it to
`onRecoverableError`, and development logged one warning per item. It now
reports the recovery once, with one development warning that names the hole,
the returning component, or the list's host. A list whose items all render
nothing still hydrates silently.

A boundary that retries hydration after its value suspended no longer reports
or warns about content an earlier attempt already rebuilt. The retry rebuilds
that content instead of adopting what the failed attempt left. Adopting it had
duplicated an element a component returned in place of its server text. Two
further shapes rendered with component children no longer throw
`NotFoundError` during hydration: an element a component returns where it
rendered nothing on the server, and a list item whose server range is empty.
A list item whose server range holds another element now reports its rebuild.
