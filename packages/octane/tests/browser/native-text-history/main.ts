import { createRoot, flushSync } from 'octane';
import { createScope } from 'octane/signals';
import { Field, type FieldProps } from './field.tsrx';

const scope = createScope({ scopeKey: 'native-text-history' });
const draft$ = scope.signal$('draft', 'Native baseline');
const root = createRoot(document.querySelector('#app')!);

function mount(tag: FieldProps['tag'], spread: boolean): void {
	root.render(Field, { draft$, tag, spread });
}

window.__nativeTextHistory = {
	mount,
	read$: () => draft$.get(),
	set: (value: string) => flushSync(() => draft$.set(value)),
};

declare global {
	interface Window {
		__nativeTextHistory: {
			mount: typeof mount;
			read$(): string;
			set(value: string): void;
		};
	}
}
