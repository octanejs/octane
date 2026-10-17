import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';

// An @if arm nested in another arm, whose leaf suspends before either arm
// inserts anything, keeps its content through the retry that resumes it.
const SOURCE = `
import { use } from 'octane';
function Waiter(props) @{
	const value = use(props.value);
	<b id="waited">{value as string}</b>
}
function PairWaiter(props) @{
	const value = use(props.value);
	<>
		<i id="pair-first">{value as string}</i>
		<u>{'tail'}</u>
	</>
}
export function NestedArms(props) @{
	<main>
		@try {
			<>
				@if (props.show) {
					@if (props.pair) {
						<PairWaiter value={props.value} />
					} @else {
						<Waiter value={props.value} />
					}
				}
				<span id="sibling">{'sibling'}</span>
			</>
		} @pending {
			<p id="pending">{'pending'}</p>
		}
	</main>
}
`;

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

describe.each([false, true])('a nested arm whose leaf suspends (dev=%s)', (dev) => {
	const client = () =>
		loadCompiledFixtureSource(SOURCE, {
			id: `nested-arm-retry-${dev}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});

	it.each([
		['a single root', false, '#waited'],
		['a two-root template', true, '#pair-first'],
	] as const)('shows the leaf once it resolves (%s)', async (_name, pair, id) => {
		const c = client();
		const gate = deferred<string>();
		const root = mount(c.NestedArms, { show: false, pair, value: gate.promise });
		try {
			expect(root.find('#sibling').textContent).toBe('sibling');
			await act(() => root.update(c.NestedArms, { show: true, pair, value: gate.promise }));
			expect(root.container.querySelector('#pending')).not.toBeNull();
			await act(() => gate.resolve('ready'));
			expect(root.container.querySelector('#pending')).toBeNull();
			expect(root.find(id).textContent).toBe('ready');
			expect(root.find('#sibling').textContent).toBe('sibling');
			// The arms swap out cleanly once resolved.
			await act(() => root.update(c.NestedArms, { show: false, pair, value: gate.promise }));
			expect(root.container.querySelector(id)).toBeNull();
			expect(root.find('#sibling').textContent).toBe('sibling');
		} finally {
			root.unmount();
		}
	});
});
