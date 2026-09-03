---
'@octanejs/testing-library': patch
---

Make fireEvent.focus and fireEvent.blur deliver native focus/blur before the bubbling focusin/focusout used by Octane's delegated handlers. Keep the paired event bubbling even when native options set bubbles to false, while preserving other options and the native DOM helper's cancellation result.
