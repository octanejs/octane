---
'@octanejs/zustand': patch
'@octanejs/tanstack-form': patch
'@octanejs/tanstack-store': patch
---

Update the unchanged adapters to Zustand 5.0.15, TanStack Form 1.33.5, and TanStack Store 0.11.1. Clearing persisted Zustand storage now prevents pending hydration from restoring cleared state, and deleting a form field preserves siblings whose names share its prefix.
