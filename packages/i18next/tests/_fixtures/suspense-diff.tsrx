import { Suspense, use } from 'octane';
import { createInstance } from 'i18next';
import { I18nextProvider, useTranslation } from '@octanejs/i18next';

// Sequential suspense differential fixtures. Each namespace loads on a timer
// once requested: `first` after 10ms, and `second` 200ms after the replay first
// reaches it. The data read by use() settles 200ms after it is first requested.
// Each side (Octane / React) runs its own module, instances, and timers, so the
// rig compares: mount (fallback) → first namespace loaded while the second read
// is pending (still fallback) → everything settled.

const DELAYS: Record<string, number> = { first: 10, second: 200 };
const KEYS: Record<string, string> = { first: 'First', second: 'Second' };

async function makeInstance() {
	const instance = createInstance().use({
		type: 'backend',
		init() {},
		read(
			_language: string,
			namespace: string,
			callback: (error: Error | null, resources: Record<string, string>) => void,
		) {
			setTimeout(() => callback(null, { key: KEYS[namespace] }), DELAYS[namespace]);
		},
	});
	await instance.init({
		lng: 'en',
		fallbackLng: false,
		ns: ['translation'],
		resources: { en: { translation: {} } },
		partialBundledLanguages: true,
		interpolation: { escapeValue: false },
	});
	return instance;
}

let dataPromise: Promise<string> | undefined;
function loadData(): Promise<string> {
	dataPromise ??= new Promise((resolve) => setTimeout(() => resolve('data'), 200));
	return dataPromise;
}

function HookThenHook() @{
	const { t: translateFirst } = useTranslation('first');
	const { t: translateSecond } = useTranslation('second');
	<p id="result">{(translateFirst('key') + '/' + translateSecond('key')) as string}</p>
}

function HookThenUse() @{
	const { t } = useTranslation('first');
	const value = use(loadData());
	<p id="result">{(t('key') + '/' + value) as string}</p>
}

const READERS = {
	'hook-hook': HookThenHook,
	'hook-use': HookThenUse,
};

// One instance per scenario, so a scenario never starts with namespaces an
// earlier scenario already loaded.
const INSTANCES = {
	'hook-hook': await makeInstance(),
	'hook-use': await makeInstance(),
};

export function SuspenseParity(props: { order: keyof typeof READERS }) @{
	const Reader = READERS[props.order];
	<I18nextProvider i18n={INSTANCES[props.order]}>
		<Suspense fallback={<p id="fallback">loading</p>}>
			<Reader />
		</Suspense>
	</I18nextProvider>
}
