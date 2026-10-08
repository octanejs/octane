---
'octane': patch
---

Adopt DOM bindings on a page that the browser has translated. Text that Chrome's Translate has wrapped in `<font>` elements no longer throws error #318, #321 or #286. This covers fixed views' text leaves and structural programs' static text and text holes. Adoption leaves the translated text in place, and bound text is replaced with plain text when its value next changes. Text translated after adoption also updates again: before, those writes were silently dropped. Add `translate="no"` to an element to keep its text untranslated.
