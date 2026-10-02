import { createRoot, hydrateRoot, startTransition } from 'octane';
import { FormActionData } from '../../_fixtures/form-action-data.tsrx';

type Entry = readonly [string, string];
const container = document.querySelector<HTMLElement>('#root')!;
let root: ReturnType<typeof createRoot> | undefined;
let release: () => void = () => {};
let received: FormData | undefined;
let observed: Entry[] | undefined;
let adopted = false;

function entries(data: FormData): Entry[] {
	return Array.from(data, ([name, value]) => [name, String(value)] as const);
}

window.__formActions = {
	mount(mode, manual) {
		const serverForm = container.querySelector('form');
		const gate = new Promise<void>((resolve) => (release = resolve));
		const props = manual
			? {
					onSubmit(event: Event) {
						event.preventDefault();
						startTransition(() => gate);
					},
				}
			: {
					action(data: FormData) {
						received = data;
						return gate;
					},
				};
		if (mode === 'hydrate') {
			root = hydrateRoot(container, FormActionData, props);
			adopted = container.querySelector('form') === serverForm;
		} else {
			container.replaceChildren();
			root = createRoot(container);
			root.render(FormActionData, props);
		}
	},
	observe() {
		container.querySelector('form')!.addEventListener('formdata', (event: FormDataEvent) => {
			observed = entries(event.formData);
		});
	},
	state() {
		return {
			first: received ? String(received.get('intent')) : null,
			values: received ? received.getAll('intent').map(String) : null,
			entries: received ? entries(received) : null,
			observed: observed ?? null,
			status: container.querySelector('#data-status')!.textContent,
			adopted,
		};
	},
	release: () => release(),
	unmount: () => root?.unmount(),
};

declare global {
	interface Window {
		__formActions: {
			mount(mode: 'mount' | 'hydrate', manual: boolean): void;
			observe(): void;
			state(): {
				first: string | null;
				values: string[] | null;
				entries: Entry[] | null;
				observed: Entry[] | null;
				status: string | null;
				adopted: boolean;
			};
			release(): void;
			unmount(): void;
		};
	}
}
