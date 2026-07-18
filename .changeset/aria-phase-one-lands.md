---
'@octanejs/aria': patch
---

Phase 1: the focus area (`FocusScope` with containment/restore/focus managers,
`FocusRing`, `useFocusRing`), the i18n area (`I18nProvider`, `useLocale`,
collator/date/number/list formatters, `useFilter`,
`useLocalizedStringFormatter` over verbatim `@internationalized/*`), form
validation, and the leaf hooks: `useButton`/`useToggleButton`(+Group),
`useLabel`/`useField`, `useCheckbox`(+Group/+Item), `useRadio`/`useRadioGroup`,
`useSwitch`, `useTextField`, `useSearchField`, `useProgressBar`, `useMeter`,
`useSeparator`, `useLink`, `useDisclosure`, `useToolbar`, `VisuallyHidden` —
plus the matching react-stately state hooks under `@octanejs/aria/stately`.
Text-input and checkable DOM wiring rides octane's native `input` event; public
value-level `onChange(value)` APIs are unchanged. Differential-verified
byte-identical against the real react-aria.
