---
'@octanejs/lynx': patch
---

Pass `templates: universalHostTemplates` from the Lynx background driver. Octane's template-program capabilities now take effect only for a driver that supplies this support, so Lynx keeps mounting and updating program-backed trees with template commands.
