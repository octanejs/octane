---
'octane': patch
'@octanejs/cli': patch
---

`createDataHandler` throws when it is given a `secret` shorter than 16 bytes, or an empty one such as a blank environment variable gives, instead of signing form tokens with a guessable key or failing on every form. The `data` template says how long `FORMS_SECRET` must be.
