# @octanejs/lingui

Octane binding for [`@lingui/react@6.6.0`](https://github.com/lingui/js-lingui). The framework-neutral `@lingui/core` catalog runtime is reused. `I18nProvider`, `useLingui`, and `Trans` are ported onto Octane hooks and `OctaneNode`.

```tsrx
import { setupI18n } from '@lingui/core';
import { I18nProvider, Trans, useLingui } from '@octanejs/lingui';

const i18n = setupI18n({
	locale: 'en',
	messages: { en: { hello: 'Hello {name}' } },
});

export function Greeting() @{
	<I18nProvider i18n={i18n}>
		<Trans id="hello" message="Hello {name}" values={{ name: 'Ada' }} />
	</I18nProvider>
}

export function LocaleLabel() {
	const { i18n } = useLingui();
	return i18n.locale;
}
```

Compile-time `./macro` and RSC `./server` / `TransRsc` are not part of this binding. See [UPSTREAM.md](./UPSTREAM.md).
