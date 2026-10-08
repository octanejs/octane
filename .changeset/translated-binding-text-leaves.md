---
'octane': patch
---

Adopt DOM bindings on a page that the browser has translated. A text leaf that Chrome's Translate has wrapped in `<font>` elements no longer throws error #318 or #321. Adoption leaves the translated text in place, and the leaf is replaced with plain text when its bound value next changes. A leaf translated after adoption also updates again: before, those writes were silently dropped. Add `translate="no"` to an element to keep its text untranslated.
