---
'@octanejs/base-ui': patch
'@octanejs/base-ui-utils': patch
---

Update the Base UI binding to 1.8.0 and its shared utilities to 0.4.0. Add the
complete Select, Combobox, Autocomplete, Drawer, Navigation Menu, OTP Field,
Scroll Area, and Toolbar APIs, and update existing component parts and behavior.
Publish authored Octane source and compiled CommonJS entries, including all
public utility and temporal-adapter subpaths.

Align the utility export map with upstream's documented entries. Previously
exposed private implementation subpaths are no longer public; import store
utilities, including StoreInspector, from the public store entry.
