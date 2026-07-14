# Build an i18next language switcher

Implement `App` in `src/App.tsrx` with `@octanejs/i18next`.

`App` receives an initialized `i18n` instance and a `name`. Provide that exact
instance with `I18nextProvider`, translate `greeting` with the supplied name,
and render the `details` rich translation with its translated text inside a
real `<strong>` element. Add `English` and `French` buttons that call
`changeLanguage` and update the already-mounted UI. Mark the active language
button with `aria-pressed="true"` and the other with `aria-pressed="false"`.

Use `useTranslation` and `Trans`; do not manually branch on the language, inject
HTML, or replace the supplied instance. For inspectable rich content, use the
`Trans` component-map form rather than natural TSRX block children. Only edit
`src/App.tsrx`.
