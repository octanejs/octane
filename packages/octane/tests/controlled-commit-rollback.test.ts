import { describe, expect, it } from 'vitest';
import { createScope } from 'octane/signals';
import { act, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';

// A dropped root render leaves a committed form control as it was: its live
// value, checkedness and selection, the default* mirrors, and a radio group's
// other members. These writes land at commit (#2043), so the render that is
// dropped never reached the control.
const SOURCE = `
function Reader(props) @{ <span id="label">{props.read() as string}</span> }
function Controls(props) @{
	<form>
		<input id="value" value={props.live} onInput={() => {}} />
		<textarea id="area" value={props.value} onInput={() => {}} />
		<input id="default" defaultValue={props.value} />
		<textarea id="default-area" defaultValue={props.value} />
		<input id="check" type="checkbox" checked={props.on} onInput={() => {}} />
		<input id="default-check" type="checkbox" defaultChecked={props.on} />
		<input id="radio-a" type="radio" name="pick" checked={!props.on} onInput={() => {}} />
		<input id="radio-b" type="radio" name="pick" checked={props.on} onInput={() => {}} />
		<select id="select" value={props.pick} multiple={props.multiple} onInput={() => {}}>
			<option value="before">before</option>
			<option value="after">after</option>
		</select>
		<input id="spread" {...props.attrs} onInput={() => {}} />
	</form>
}
export function App(props) @{
	<main><Controls {...props} /><Reader read={props.read} /></main>
}
`;

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function snapshot(root: ReturnType<typeof mount>) {
	const input = (id: string) => root.find('#' + id) as HTMLInputElement;
	const select = root.find('#select') as HTMLSelectElement;
	return {
		value: [input('value').value, input('value').defaultValue],
		area: [input('area').value, input('area').defaultValue],
		default: [input('default').value, input('default').getAttribute('value')],
		defaultArea: [input('default-area').value, input('default-area').defaultValue],
		check: [input('check').checked, input('check').defaultChecked],
		defaultCheck: [input('default-check').checked, input('default-check').defaultChecked],
		radios: [input('radio-a').checked, input('radio-b').checked],
		select: [select.multiple, [...select.options].map((o) => o.selected)],
		spread: [input('spread').value, input('spread').defaultValue],
	};
}

describe.each([
	[false, false],
	[true, false],
	[false, true],
	[true, true],
])('form controls in a dropped root render (dev=%s, signals=%s)', (dev, signals) => {
	const client = () =>
		loadCompiledFixtureSource(signals ? `import 'octane/signals';\n${SOURCE}` : SOURCE, {
			id: `controlled-commit-rollback-${dev}-${signals}.tsrx`,
			mode: 'client',
			compileOptions: { dev, hmr: false },
		});

	it.each([false, true])(
		'keeps every committed control while the root waits (multiple=%s)',
		async (multiple) => {
			const c = client();
			const scope = createScope({ scopeKey: `controlled-commit-${dev}-${signals}-${multiple}` });
			const value$ = scope.signal$('value', 'after');
			const pending = deferred();
			let ready = true;
			const read = () => {
				if (!ready) throw pending.promise;
				return 'ready';
			};
			const initial = {
				live: 'before',
				value: 'before',
				pick: 'before',
				on: false,
				multiple: false,
				attrs: { value: 'before' },
			};
			const root = mount(c.App, { ...initial, read });
			const before = snapshot(root);
			const nodes = root.findAll('input, textarea, select');
			try {
				ready = false;
				root.update(c.App, {
					// A signal handle upgrades the binding in the same render.
					live: signals ? value$ : 'after',
					value: 'after',
					pick: multiple ? ['after'] : 'after',
					on: true,
					multiple,
					attrs: { value: 'after' },
					read,
				});
				expect(snapshot(root)).toEqual(before);
				ready = true;
				await act(() => pending.resolve());
				const live = root.findAll('input, textarea, select');
				expect(live).toHaveLength(nodes.length);
				nodes.forEach((node, i) => expect(live[i]).toBe(node));
				const after = snapshot(root);
				expect(after.value[0]).toBe('after');
				expect(after.area[0]).toBe('after');
				expect(after.default[1]).toBe('after');
				expect(after.defaultArea[1]).toBe('after');
				expect(after.check[0]).toBe(true);
				expect(after.defaultCheck[1]).toBe(true);
				expect(after.radios).toEqual([false, true]);
				expect(after.select).toEqual([multiple, [false, true]]);
				expect(after.spread[0]).toBe('after');
			} finally {
				ready = true;
				pending.resolve();
				root.unmount();
				scope.dispose();
			}
		},
	);
});
