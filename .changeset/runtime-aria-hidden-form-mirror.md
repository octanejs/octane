---
'octane': patch
---

The development controlled-form diagnostic no longer warns on `aria-hidden`
inputs. An aria-hidden control is the hidden form-interop "mirror input"
pattern (e.g. the bubble inputs radix-style libraries render behind a custom
control): it is assistive-technology-hidden and focus-excluded, so handler-less
controlled `checked`/`value` props are the intended wiring there, not the
authoring mistake the diagnostic exists to catch. Real, user-reachable
controls keep the full warning.
