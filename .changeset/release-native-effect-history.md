---
"octane": patch
---

Release earlier effect hooks after accepted universal renderer updates. Repeated native renders with unchanged effect dependencies no longer retain the callback history until unmount.
