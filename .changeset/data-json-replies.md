---
'octane': patch
---

`octane/data` replies travel as JSON where JSON keeps them exactly, which encodes on the server about four times faster, parses in the client's data worker faster, and compresses to less than half the size on a large list. `httpTransport` and `serverTransport` ask for it with a field in the request, so a client from an earlier version keeps getting devalue, and both still read devalue from an earlier server.
