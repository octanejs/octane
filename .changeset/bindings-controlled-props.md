---
'@octanejs/radix': patch
'@octanejs/base-ui': patch
---

Form controls now pass real controlled props. With octane shipping React-parity controlled components (`value`/`checked` reassertion on native events), the bindings' hidden native inputs take controlled `checked`/`value` directly, and the workaround machinery — imperative property writes via native prototype setters in layout effects and the initial-checked attribute dance — is removed. Behavior is unchanged and stays differential-verified against the real React libraries.
