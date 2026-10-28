---
'octane': patch
---

Render arrays of text in renderable holes without the keyed child list, which an application now ships only when it can build another kind of list item: element values, compiled children, compiled maps, or portals that may reach an array. A portal a component returns no longer counts. Applications whose holes hold only text, such as Strong-mode apps without component children, drop the element-descriptor and list code from their client bundles.
