---
'octane': patch
---

Discard stale server text when hydrating a renderable `{expr}` hole whose server
value was text but whose client value is a component that returns another
component's element or list. Hydration kept the server text beside the client
element and reported nothing. When the returned component rendered the server's
text instead, a later switch to a different returned component left that text
behind. The server text now stays inside the returned components' range, so it
is adopted as their text, or removed and reported once to `onRecoverableError`
with the development warning naming the component that returns the element. The
same holds when a component in the chain suspends during hydration.
