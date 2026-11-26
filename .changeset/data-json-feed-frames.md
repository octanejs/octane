---
'octane': patch
---

`octane/data` feed frames travel as JSON where JSON keeps them exactly, as replies do. `serverListener` and `webSocketListener` ask for it, so a listener from an earlier version keeps getting devalue, and both still read devalue from an earlier server.
