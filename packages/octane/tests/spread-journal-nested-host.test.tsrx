import { expect, it } from 'vitest';
import { setClassAttr, use, useState, useTransition } from 'octane';
import { act, mount } from './_helpers';

declare module 'octane/jsx-runtime' {
	namespace Octane {
		namespace JSX {
			interface IntrinsicElements {
				'octane-spread-journal-host': IntrinsicElements['div'];
			}
		}
	}
}

// A spread commit journals one undo for that host. A custom-element callback
// can still write a *different* host through the public attribute writers;
// those writes are not covered by the outer undo and must snapshot themselves.
if (customElements.get('octane-spread-journal-host') === undefined) {
	customElements.define(
		'octane-spread-journal-host',
		class extends HTMLElement {
			static observedAttributes = ['data-mark'];
			attributeChangedCallback(_name: string, previous: string | null, value: string | null) {
				// Only the forward transition write. Rollback replays data-mark
				// back to 'old' and must not re-mutate the sibling.
				if (!this.isConnected || previous !== 'old' || value !== 'new') return;
				const sibling = document.getElementById('probe-sibling');
				if (sibling) setClassAttr(sibling, 'mutated');
			}
		},
	);
}

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function SuspendedValue(props: { load: (step: number) => Promise<string>; step: number }) @{
	const value = use(props.load(props.step));
	<span id="value">{value as string}</span>
}

function SpreadJournalNestedHost(props: { load: (step: number) => Promise<string> }) @{
	const [step, setStep] = useState(0);
	const [isPending, start] = useTransition();
	<div>
		<span id="pending">
			{isPending ? 'pending' : 'idle'}
		</span>
		<button id="bump" onClick={() => start(() => setStep(1))}>{'bump'}</button>
		<span id="probe-sibling" />
		@try {
			<>
				<octane-spread-journal-host
					id="probe-host"
					{...(step === 0
						? { 'data-mark': 'old', 'data-extra': 'a' }
						: { 'data-mark': 'new', 'data-extra': 'b' })}
				/>
				<SuspendedValue load={props.load} step={step} />
			</>
		} @pending {
			<span id="fallback">{'fallback'}</span>
		}
	</div>
}

it(
	'restores a sibling written from a spread host callback while a transition is held',
	async () => {
		const entries = new Map<number, Deferred<string>>();
		const load = (step: number) => {
			let entry = entries.get(step);
			if (entry === undefined) {
				entry = deferred<string>();
				entries.set(step, entry);
			}
			return entry.promise;
		};
		load(0);
		entries.get(0)!.resolve('zero');

		const r = mount(SpreadJournalNestedHost, { load });
		await act(() => {});
		try {
			expect(r.find('#probe-host').getAttribute('data-mark')).toBe('old');
			expect(r.find('#probe-sibling').getAttribute('class')).toBe(null);

			r.click('#bump');
			expect(r.findAll('#fallback')).toHaveLength(0);
			expect(r.find('#pending').textContent).toBe('pending');
			expect(r.find('#probe-host').getAttribute('data-mark')).toBe('old');
			expect(r.find('#probe-host').getAttribute('data-extra')).toBe('a');
			// The callback wrote class="mutated" during the discarded transition.
			// Rollback must restore the sibling; the outer spread undo only covers
			// the host that dispatched it.
			expect(r.find('#probe-sibling').getAttribute('class')).toBe(null);
			expect(r.find('#value').textContent).toBe('zero');

			await act(() => {
				entries.get(1)!.resolve('one');
			});
			expect(r.find('#probe-host').getAttribute('data-mark')).toBe('new');
			expect(r.find('#probe-sibling').getAttribute('class')).toBe('mutated');
			expect(r.find('#value').textContent).toBe('one');
			expect(r.find('#pending').textContent).toBe('idle');
		} finally {
			r.unmount();
		}
	},
);
