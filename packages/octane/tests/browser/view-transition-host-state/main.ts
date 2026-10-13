import { createRoot, flushSync, startTransition } from 'octane';
import { HostStateApp, SelectStateApp } from '../../_fixtures/view-transition-host-state.tsrx';

type Scenario = 'radio' | 'select';
type Update = {
	rows: string[];
	values?: string[];
	choice?: string;
	multiple?: boolean;
};
type NativeUpdate = () => void | Promise<void>;
const root = createRoot(document.querySelector('#app')!);
const events: string[] = [];
let pending: NativeUpdate | undefined;
let end: (() => void) | undefined;
let begin: (() => void) | undefined;
let scenario: Scenario;

// Keep the browser before its mutation callback while the test observes real
// input/select state. The update work belongs to the public renderer API.
Object.defineProperty(document, 'startViewTransition', {
	configurable: true,
	value(options: { update: NativeUpdate }) {
		pending = options.update;
		const ready = new Promise<void>((resolve) => {
			begin = resolve;
		});
		const finished = new Promise<void>((resolve) => {
			end = resolve;
		});
		return {
			ready,
			finished,
			skipTransition() {
				begin?.();
				end?.();
			},
		};
	},
});

function render(input: Update, transition: boolean): void {
	const next = () => {
		if (scenario === 'radio') {
			root.render(HostStateApp, {
				rows: input.rows,
				choice: input.choice!,
				className: transition ? 'after' : 'before',
				color: transition ? 'blue' : 'red',
				html: transition ? '<i>after</i>' : '<b>before</b>',
				onInput(value: string) {
					events.push(value);
				},
			});
		} else {
			root.render(SelectStateApp, {
				rows: input.rows,
				values: input.values!,
				multiple: input.multiple,
				label: transition ? 'after' : 'before',
			});
		}
	};
	if (transition) startTransition(next);
	else flushSync(next);
}

const api = {
	events,
	mount(kind: Scenario, input: Update) {
		scenario = kind;
		render(input, false);
	},
	update(input: Update) {
		pending = undefined;
		render(input, true);
	},
	get prepared() {
		return pending !== undefined;
	},
	async publish() {
		if (pending === undefined) throw new Error('No prepared transition');
		const update = pending;
		pending = undefined;
		await update();
		begin?.();
		end?.();
	},
	unmount() {
		flushSync(() => root.unmount());
	},
};

declare global {
	interface Window {
		octaneHostState: typeof api;
	}
}
window.octaneHostState = api;
