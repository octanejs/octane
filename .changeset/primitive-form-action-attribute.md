---
'octane': patch
---

Write a `<form action>` or `formAction` value that is a primitive by syntax, such as `eager ? '/eager' : '/'`, as the native URL attribute in production builds. A page whose form actions are all strings no longer ships submit interception and the transition engine it pulls in.
