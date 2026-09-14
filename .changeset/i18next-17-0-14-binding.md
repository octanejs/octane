---
'@octanejs/i18next': patch
---

Update the i18next binding to react-i18next 17.0.14. Retain the SUSPENDED_WHILE_LOADING development warning, the i18nWrapper instance-cache fix, and the Trans allowedTags and IcuTrans defaultTranslation corrections from upstream 17.0.10–17.0.14 while preserving the existing Octane adaptations for descriptor children, suspense, refs-as-props, and context.

Vendor and adapt the complete pinned upstream suite: 495 pristine React tests run unchanged, 458 adapted Octane tests cover the same registrations (the 37 icu.macro Babel-transform cases stay React-only and are recorded as unsupported), and all 314 pinned type registrations compile across fourteen per-directory pristine and adapted programs. Provenance is verified against the immutable 17.0.14 lock with the npm artifact retained for declaration evidence.
