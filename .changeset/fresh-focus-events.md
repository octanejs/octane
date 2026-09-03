---
'@octanejs/testing-library': patch
---

Make fireEvent.focus and fireEvent.blur deliver the native bubbling focus events used by Octane's delegated focus handlers, preserving event options and DOM helper return values.
