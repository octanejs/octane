# @octanejs/i18next

[react-i18next](https://github.com/i18next/react-i18next)'s binding layer for the
[Octane](https://github.com/octanejs/octane) UI framework. It uses `i18next`
unchanged and ports the context, hooks, `Trans`, ICU, HOC, and SSR integration to
Octane.

The runtime surface tracks `react-i18next@17.0.9`, so most migrations only change
the package import:

```diff
- import { useTranslation, Trans } from 'react-i18next';
+ import { useTranslation, Trans } from '@octanejs/i18next';
```

## Install

```bash
pnpm add @octanejs/i18next i18next
```

Initialize i18next with the compatibility-named `initReactI18next` plugin. The
name is retained so shared setup code and ecosystem integrations keep working.

```ts
import i18n from 'i18next';
import { initReactI18next } from '@octanejs/i18next';

await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: {
    en: {
      translation: {
        greeting: 'Hello {{name}}',
        richGreeting: 'Hello <strong>{{name}}</strong>',
      },
    },
  },
  interpolation: { escapeValue: false },
});
```

Provide an instance explicitly when an app can host more than one instance or
when you want a scoped default namespace:

```tsx
import { I18nextProvider } from '@octanejs/i18next';

export function Root() @{
  <I18nextProvider i18n={i18n} defaultNS="translation">
    <App />
  </I18nextProvider>
}
```

## Hooks and Suspense

`useTranslation` has the same tuple and object shape as react-i18next and reacts
to `languageChanged` and configured store events.

```tsx
import { useTranslation } from '@octanejs/i18next';

export function Greeting(props: { name: string }) @{
  const { t, ready, i18n } = useTranslation('translation');
  <section>
    <p>{t('greeting', { name: props.name }) as string}</p>
    <button onClick={() => i18n.changeLanguage('fr')}>French</button>
    <small>{String(ready)}</small>
  </section>
}
```

Suspense is enabled by default. Missing namespaces suspend through Octane's
`use(thenable)` integration; set `useSuspense: false` and check `ready` when a
non-suspending loading state is preferable.

## Rich translations

The most portable `Trans` form uses `defaults`/`values` and a component map:

```tsx
<Trans
  i18nKey="richGreeting"
  values={{ name: 'Ada' }}
  components={{ strong: <strong class="emphasis" /> }}
/>
```

There is one Octane-specific authoring rule. Natural `.tsrx` block children are
compiled into an imperative render body, so `Trans` cannot inspect them to build
its default string. Put inspectable children in prop position instead:

```tsx
<Trans
  i18nKey="richGreeting"
  children={<>
    Hello
    <strong>
      {{ name: 'Ada' }}
    </strong>
  </>}
/>
```

A natural block-child form renders its authored fallback and emits a development
warning explaining this adaptation.

`IcuTrans` and `IcuTransWithoutContext` support react-i18next's declaration-tree
API:

```tsx
<IcuTrans
  i18nKey="cta"
  defaultTranslation="Read <0>the guide</0>"
  content={[{ type: 'a', props: { href: '/guide' } }]}
/>
```

## Server rendering

Preload the namespaces needed for a request and render normally through
`octane/server`. Namespace usage is collected on `i18n.reportNamespaces` for
serialization into the client response.

```ts
import { renderToString } from 'octane/server';

const { html, css } = renderToString(App, { i18n });
const usedNamespaces = i18n.reportNamespaces?.getUsedNamespaces() ?? [];
```

`useSSR`, `withSSR`, `getInitialProps`, and `composeInitialProps` are retained for
applications migrating an existing react-i18next SSR integration.

## Supported surface and differences

The root runtime export list matches `react-i18next@17.0.9`, including
`Translation`, `withTranslation`, `TransWithoutContext`, `IcuTrans`, `useSSR`,
`withSSR`, context/default helpers, and the ICU helper exports. Octane uses
ref-as-prop semantics, so `withTranslation({ withRef: true })` does not use
`forwardRef`. Class components are not supported.

The Babel/React-specific `icu.macro` subpath is intentionally not included; use
the runtime `IcuTrans` APIs. See the generated
[bindings status](../../docs/bindings-status.md) for the current compatibility
record.

This package is derived from react-i18next and is distributed under the MIT
license.
