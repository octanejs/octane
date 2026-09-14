import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot, startTransition } from 'octane';
import { renderToString } from 'octane/server';
import { createScope } from 'octane/signals';
import { act, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture';

const SOURCE = `
export function Single(props) @{
	<div id="single-style" style={{ color: props.color }}>{'single'}</div>
}

export function Multiple(props) @{
	<div
		id="multiple-style"
		style={{ position: 'absolute', margin: '4px', marginTop: props.top, color: props.color, '--accent': props.accent }}
	>{'multiple'}</div>
}

export function AllDynamic(props) @{
	<div id="all-dynamic-style" style={{ left: props.left, opacity: props.opacity }} />
}
`;

const DUPLICATE_SOURCE = `
export function StaticWinner(props) @{
	<div id="static-winner" style={{ color: props.color, color: 'red', background: props.background }} />
}

export function DynamicWinner(props) @{
	<div id="dynamic-winner" style={{ color: 'red', color: props.color, background: props.background }} />
}

export function LonghandFirst(props) @{
	<div id="longhand-first" style={{ marginTop: props.discarded, margin: props.margin, marginTop: props.top }} />
}

export function ShorthandFirst(props) @{
	<div id="shorthand-first" style={{ margin: props.discarded, marginTop: props.top, margin: props.margin }} />
}

export function LiteralDuplicates() @{
	<div id="literal-duplicates" style={{ marginTop: '1px', margin: '4px', marginTop: '8px', color: 'red', color: null, background: 'blue', background: false, display: 'block', display: '', '--removed': 'red', '--removed': true }} />
}
`;

const SPREAD_SOURCE = `
export function Spread(props) @{
	<div style={{ ...props.first, ...props.second, left: props.left, color: props.color, '--accent': props.accent, display: 'block' }} />
}

export function Ordered(props) @{
	<div style={{ ...props.prefix, marginTop: props.discarded, margin: props.margin, marginTop: props.top }} />
}

export function Control(props) @{
	<div style={props.style} />
}
`;

function compiled(source: string, id: string, mode: 'client' | 'server', dev = false) {
	return loadCompiledFixtureSource(source, {
		id,
		mode,
		compileOptions: { hmr: false, dev },
	});
}

describe('inline object styles', () => {
	it.each([false, true])(
		'updates and removes spread styles before explicit suffixes in dev=%s',
		(dev) => {
			const client = compiled(SPREAD_SOURCE, `spread-suffix-${dev}.tsrx`, 'client', dev);
			const inherited = Object.create({ height: '99px' });
			Object.defineProperty(inherited, 'width', { value: '99px', enumerable: false });
			Object.assign(inherited, { color: 'green', left: 1, opacity: 0.5, '--obsolete': 'old' });
			const steps = [
				{
					first: inherited,
					second: { left: 2, backgroundColor: 'black' },
					left: 5,
					color: 'red !important',
					accent: 10,
				},
				{ first: { position: 'fixed' }, second: null, left: null, color: 'blue', accent: null },
				{
					first: undefined,
					second: { opacity: 1, color: 'green' },
					left: 0,
					color: false,
					accent: 'new',
				},
				{ first: null, second: undefined, left: 12, color: null, accent: null },
				{ first: { color: 'green', left: 1 }, second: null, left: 12, color: 'blue', accent: 10 },
				{ first: { left: 2, color: 'red' }, second: null, left: 12, color: 'blue', accent: 10 },
				{ first: null, second: null, left: 12, color: 'blue', accent: 10 },
				{ first: {}, second: null, left: 12, color: 'blue', accent: 10 },
				{ first: {}, second: null, left: 12, color: null, accent: null },
			];
			const styleFor = (props: (typeof steps)[number]) => ({
				...props.first,
				...props.second,
				left: props.left,
				color: props.color,
				'--accent': props.accent,
				display: 'block',
			});
			const root = mount(client.Spread, steps[0]);
			const control = mount(client.Control, { style: styleFor(steps[0]) });
			const element = root.find('div') as HTMLElement;
			const reference = control.find('div') as HTMLElement;
			try {
				expect(element.style.cssText).toBe(reference.style.cssText);
				expect(element.style.left).toBe('5px');
				expect(element.style.color).toBe('red');
				expect(element.style.getPropertyPriority('color')).toBe('important');
				expect(element.style.height).toBe('');
				expect(element.style.width).toBe('');
				for (const props of steps.slice(1)) {
					root.update(client.Spread, props);
					control.update(client.Control, { style: styleFor(props) });
					expect(root.find('div')).toBe(element);
					expect(element.style.cssText).toBe(reference.style.cssText);
					expect(element.style.getPropertyValue('--obsolete')).toBe('');
					expect(element.style.backgroundColor).toBe('');
					expect(element.style.getPropertyPriority('color')).toBe('');
					expect(element.style.display).toBe('block');
				}
				expect(element.style.left).toBe('12px');
				expect(element.style.opacity).toBe('');
				expect(element.style.position).toBe('');
				expect(element.style.color).toBe('');
				expect(element.style.getPropertyValue('--accent')).toBe('');
			} finally {
				root.unmount();
				control.unmount();
			}
		},
	);

	it.each([false, true])(
		'preserves spread insertion order for duplicate shorthand keys in dev=%s',
		(dev) => {
			const client = compiled(SPREAD_SOURCE, `spread-order-${dev}.tsrx`, 'client', dev);
			for (const prefix of [
				{ marginTop: '1px', margin: '2px' },
				{ margin: '2px', marginTop: '1px' },
				{},
			]) {
				const steps = [
					{ prefix, discarded: '3px', margin: '4px', top: '8px' },
					{ prefix, discarded: '5px', margin: '12px', top: '8px' },
					{ prefix: { marginTop: '2px' }, discarded: '6px', margin: '12px', top: '16px' },
					{ prefix: {}, discarded: '7px', margin: '20px', top: null },
					{ prefix: {}, discarded: '8px', margin: '20px', top: '8px' },
					{ prefix: { margin: '2px' }, discarded: '9px', margin: '20px', top: '8px' },
					{
						prefix: { marginTop: '1px', margin: '2px' },
						discarded: '10px',
						margin: '28px',
						top: '8px',
					},
					{ prefix: {}, discarded: '11px', margin: '28px', top: '8px' },
					{ prefix: {}, discarded: '12px', margin: '32px', top: '8px' },
				];
				const styleFor = (props: (typeof steps)[number]) => {
					const style = { ...props.prefix, marginTop: props.discarded, margin: props.margin };
					return Object.assign(style, { marginTop: props.top });
				};
				const root = mount(client.Ordered, steps[0]);
				const control = mount(client.Control, { style: styleFor(steps[0]) });
				const element = root.find('div') as HTMLElement;
				const reference = control.find('div') as HTMLElement;
				try {
					expect(element.style.cssText).toBe(reference.style.cssText);
					expect(element.style.marginTop).toBe(Object.keys(prefix)[0] === 'margin' ? '8px' : '4px');
					for (const props of steps.slice(1)) {
						root.update(client.Ordered, props);
						control.update(client.Control, { style: styleFor(props) });
						expect(root.find('div')).toBe(element);
						expect(element.style.cssText, JSON.stringify({ prefix, props })).toBe(
							reference.style.cssText,
						);
					}
				} finally {
					root.unmount();
					control.unmount();
				}
			}
		},
	);

	it.each([false, true])(
		'evaluates spread getters and suffixes before writing CSS in dev=%s',
		(dev) => {
			const source = `
export function App(props) @{
	<div data-before={props.read('before')} style={{ ...props.first(), ...props.second(), left: props.read('left'), color: props.read('color') }} data-after={props.read('after')} />
}`;
			const client = compiled(source, `spread-getters-${dev}.tsrx`, 'client', dev);
			const calls: string[] = [];
			let failure: string | undefined;
			let element: HTMLElement | undefined;
			let before: string | undefined;
			let next = false;
			const read = (key: string) => {
				calls.push(key);
				if (element !== undefined && key !== 'after') expect(element.style.cssText).toBe(before);
				if (key === failure) throw new Error(`failed ${key}`);
				return key === 'left' ? (next ? 12 : 5) : key === 'color' ? (next ? 'blue' : 'red') : key;
			};
			const props = {
				read,
				first: () => {
					read('first');
					return {
						get left() {
							read('first getter');
							return 1;
						},
					};
				},
				second: () => {
					read('second');
					return {
						get color() {
							read('second getter');
							return 'green';
						},
					};
				},
			};
			const order = [
				'before',
				'first',
				'first getter',
				'second',
				'second getter',
				'left',
				'color',
				'after',
			];
			for (const error of [undefined, 'first getter', 'second getter', 'color']) {
				failure = undefined;
				next = false;
				element = undefined;
				calls.length = 0;
				const root = mount(client.App, props);
				element = root.find('div') as HTMLElement;
				try {
					expect(calls).toEqual(order);
					expect(element.style.left).toBe('5px');
					expect(element.style.color).toBe('red');
					before = element.style.cssText;
					next = true;
					failure = error;
					calls.length = 0;
					if (error === undefined) {
						root.update(client.App, props);
						expect(calls).toEqual(order);
						expect(root.find('div')).toBe(element);
						expect(element.style.left).toBe('12px');
						expect(element.style.color).toBe('blue');
					} else {
						expect(() => root.update(client.App, props)).toThrow(`failed ${error}`);
						expect(calls).toEqual(order.slice(0, order.indexOf(error) + 1));
						expect(element.style.cssText).toBe(before);
					}
				} finally {
					root.unmount();
				}
			}
		},
	);

	it.each([false, true])(
		'hydrates spread styles with suffix overrides and duplicate key order in dev=%s',
		(dev) => {
			const id = `spread-hydration-${dev}.tsrx`;
			const server = compiled(SPREAD_SOURCE, id, 'server', dev);
			const client = compiled(SPREAD_SOURCE, id, 'client', dev);
			const cases = [
				{
					name: 'Spread',
					initial: {
						first: { color: 'green', opacity: 0.5 },
						second: { backgroundColor: 'black' },
						left: 5,
						color: 'red',
						accent: 10,
					},
					next: { first: null, second: null, left: 12, color: 'blue', accent: null },
					style: {
						color: 'red',
						opacity: 0.5,
						backgroundColor: 'black',
						left: 5,
						'--accent': 10,
						display: 'block',
					},
					nextStyle: { left: 12, color: 'blue', '--accent': null, display: 'block' },
				},
				{
					name: 'Ordered',
					initial: {
						prefix: { marginTop: '1px', margin: '2px' },
						discarded: '3px',
						margin: '4px',
						top: '8px',
					},
					next: { prefix: {}, discarded: '5px', margin: '12px', top: '16px' },
					style: { marginTop: '8px', margin: '4px' },
					nextStyle: { marginTop: '16px', margin: '12px' },
				},
			];
			for (const { name, initial, next, style, nextStyle } of cases) {
				const container = document.createElement('div');
				container.innerHTML = renderToString(server[name], initial).html;
				document.body.appendChild(container);
				const element = container.querySelector('div') as HTMLElement;
				const original = element.getAttribute('style');
				const control = mount(client.Control, { style });
				const reference = control.find('div') as HTMLElement;
				const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
				let root: ReturnType<typeof hydrateRoot> | undefined;
				try {
					expect(element.style.cssText).toBe(reference.style.cssText);
					root = hydrateRoot(container, client[name], initial);
					flushSync(() => {});
					expect(container.querySelector('div')).toBe(element);
					expect(element.getAttribute('style')).toBe(original);
					expect(
						warnings.mock.calls.filter((args) => /hydrat|mismatch/i.test(String(args[0]))),
					).toEqual([]);
					flushSync(() => root!.render(client[name], next));
					control.update(client.Control, { style: nextStyle });
					expect(container.querySelector('div')).toBe(element);
					expect(element.style.cssText).toBe(reference.style.cssText);
				} finally {
					root?.unmount();
					control.unmount();
					warnings.mockRestore();
					container.remove();
				}
			}
		},
	);

	it.each([false, true])(
		'preserves normalized CSS aliases across spread changes in dev=%s',
		(dev) => {
			const source = `
export function App(props) @{
	<div style={{ ...props.prefix, fontSize: props.size, float: props.float }} />
}
export function Control(props) @{
	<div style={props.style} />
}`;
			const client = compiled(source, `spread-aliases-${dev}.tsrx`, 'client', dev);
			const steps = [
				{ prefix: { 'font-size': 20, cssFloat: 'left' }, size: 12, float: 'right' },
				{ prefix: { fontSize: 9, 'font-size': 24 }, size: 14, float: 'left' },
				{ prefix: {}, size: 16, float: 'none' },
				{ prefix: { fontSize: 11, 'font-size': 18, cssFloat: 'right' }, size: 16, float: 'none' },
			];
			const styleFor = (props: (typeof steps)[number]) => ({
				...props.prefix,
				fontSize: props.size,
				float: props.float,
			});
			const root = mount(client.App, steps[0]);
			const control = mount(client.Control, { style: styleFor(steps[0]) });
			const element = root.find('div') as HTMLElement;
			const reference = control.find('div') as HTMLElement;
			try {
				expect(element.style.fontSize).toBe('12px');
				expect(element.style.cssFloat).toBe('right');
				for (const props of steps.slice(1)) {
					root.update(client.App, props);
					control.update(client.Control, { style: styleFor(props) });
					expect(root.find('div')).toBe(element);
					expect(element.style.cssText).toBe(reference.style.cssText);
				}
				expect(element.style.fontSize).toBe('18px');
			} finally {
				root.unmount();
				control.unmount();
			}
		},
	);

	it.each([false, true])(
		'restores spread display suffixes after Activity reveals in dev=%s',
		async (dev) => {
			const source = `
import { Activity } from 'octane';
export function App(props) @{
	<Activity mode={props.mode}>
		<div id="activity-spread" style={{ ...props.prefix, display: props.display, color: props.color }} />
	</Activity>
}`;
			const client = compiled(source, `spread-activity-${dev}.tsrx`, 'client', dev);
			for (const mode of ['visible', 'hidden']) {
				const root = mount(client.App, {
					mode,
					prefix: { opacity: 0.5 },
					display: 'block',
					color: 'red',
				});
				await act(() => {});
				const element = root.find('#activity-spread') as HTMLElement;
				try {
					expect(element.style.display).toBe(mode === 'hidden' ? 'none' : 'block');
					await act(() =>
						root.root.render(client.App, {
							mode: 'hidden',
							prefix: { display: 'flex', color: 'green' },
							display: 'grid',
							color: 'blue',
						}),
					);
					expect(root.find('#activity-spread')).toBe(element);
					expect(element.style.display).toBe('none');
					await act(() =>
						root.root.render(client.App, {
							mode: 'hidden',
							prefix: { opacity: 1 },
							display: 'inline-flex',
							color: 'purple',
						}),
					);
					expect(element.style.display).toBe('none');
					await act(() =>
						root.root.render(client.App, {
							mode: 'visible',
							prefix: { opacity: 1 },
							display: 'inline-flex',
							color: 'purple',
						}),
					);
					expect(root.find('#activity-spread')).toBe(element);
					expect(element.style.display).toBe('inline-flex');
					expect(element.style.color).toBe('purple');
					expect(element.style.opacity).toBe('1');
				} finally {
					root.unmount();
				}
			}
		},
	);

	it.each([false, true])(
		'restores spread and suffix styles when a transition is superseded in dev=%s',
		async (dev) => {
			const source = `
import { Suspense, use } from 'octane';
function Gate(props) {
	if (props.request) use(props.request);
	return <span id="spread-label">{props.label as string}</span>;
}
export function App(props) @{
	<Suspense fallback={<p id="spread-pending">{'pending'}</p>}>
		<div id="transition-spread" style={{ ...props.prefix, display: props.display, color: props.color }} />
		<Gate request={props.request} label={props.label} />
	</Suspense>
}`;
			const client = compiled(source, `spread-transition-${dev}.tsrx`, 'client', dev);
			let resolve!: () => void;
			const request = new Promise<void>((done) => {
				resolve = done;
			});
			const root = mount(client.App, {
				prefix: { opacity: 0.5 },
				display: 'block',
				color: 'red',
				request: null,
				label: 'initial',
			});
			const element = root.find('#transition-spread') as HTMLElement;
			const original = element.style.cssText;
			try {
				await act(() =>
					startTransition(() =>
						root.root.render(client.App, {
							prefix: { color: 'green', width: 12 },
							display: 'grid',
							color: 'blue',
							request,
							label: 'pending',
						}),
					),
				);
				expect(root.find('#transition-spread')).toBe(element);
				expect(element.style.cssText).toBe(original);
				expect(root.find('#spread-label').textContent).toBe('initial');
				expect(root.findAll('#spread-pending')).toHaveLength(0);
				await act(() =>
					root.root.render(client.App, {
						prefix: { opacity: 1 },
						display: 'grid',
						color: 'blue',
						request: null,
						label: 'urgent',
					}),
				);
				expect(root.find('#transition-spread')).toBe(element);
				expect(element.style.display).toBe('grid');
				expect(element.style.color).toBe('blue');
				expect(element.style.opacity).toBe('1');
				expect(element.style.width).toBe('');
				const committed = element.style.cssText;
				await act(() => resolve());
				expect(root.find('#transition-spread')).toBe(element);
				expect(element.style.cssText).toBe(committed);
				expect(root.find('#spread-label').textContent).toBe('urgent');
			} finally {
				root.unmount();
			}
		},
	);

	it.each([false, true])(
		'evaluates inherited style getters against the complete spread object in dev=%s',
		(dev) => {
			const source = `
export function App(props) @{
	<div style={{ ...props.prefix, left: props.left, right: props.right }} />
}`;
			const client = compiled(source, `spread-inherited-${dev}.tsrx`, 'client', dev);
			const previous = Object.getOwnPropertyDescriptor(Object.prototype, '--spread-left');
			let root: ReturnType<typeof mount> | undefined;
			let element: HTMLElement | undefined;
			let updated: HTMLElement | undefined;
			const styles: string[][] = [];
			try {
				Object.defineProperty(Object.prototype, '--spread-left', {
					configurable: true,
					enumerable: true,
					get(this: { position?: string; left?: number }) {
						return Object.hasOwn(this, 'position') ? this.left : undefined;
					},
				});
				root = mount(client.App, { prefix: { position: 'absolute' }, left: 10, right: 5 });
				element = root.find('div') as HTMLElement;
				styles.push([
					element.style.left,
					element.style.right,
					element.style.getPropertyValue('--spread-left'),
				]);
				root.update(client.App, { prefix: { position: 'absolute' }, left: 20, right: 8 });
				updated = root.find('div') as HTMLElement;
				styles.push([
					updated.style.left,
					updated.style.right,
					updated.style.getPropertyValue('--spread-left'),
				]);
			} finally {
				if (previous) Object.defineProperty(Object.prototype, '--spread-left', previous);
				else Reflect.deleteProperty(Object.prototype, '--spread-left');
				root?.unmount();
			}
			expect(updated).toBe(element);
			expect(styles).toEqual([
				['10px', '5px', '10'],
				['20px', '8px', '20'],
			]);
		},
	);

	it.each([false, true])(
		'preserves inherited getter mutations when comparing previous spread styles in dev=%s',
		(dev) => {
			const source = `
export function Inline(props) @{
	<div style={{ ...props.prefix, left: props.left, right: props.right }} />
}
export function Variable(props) @{
	const style = { ...props.prefix, left: props.left, right: props.right };
	<div style={style} />
}`;
			const client = compiled(source, `spread-inherited-mutation-${dev}.tsrx`, 'client', dev);
			const previous = Object.getOwnPropertyDescriptor(Object.prototype, '--spread-touch');
			const roots: ReturnType<typeof mount>[] = [];
			const elements: HTMLElement[] = [];
			const updated: HTMLElement[] = [];
			const styles: string[][][] = [[], []];
			try {
				Object.defineProperty(Object.prototype, '--spread-touch', {
					configurable: true,
					enumerable: true,
					get(this: { position?: string; left?: number }) {
						if (!Object.hasOwn(this, 'position')) return undefined;
						this.left = 99;
						return 'visited';
					},
				});
				for (const App of [client.Inline, client.Variable]) {
					const root = mount(App, { prefix: { position: 'absolute' }, left: 10, right: 5 });
					roots.push(root);
					elements.push(root.find('div') as HTMLElement);
				}
				for (const [step, [left, right]] of [
					[10, 5],
					[99, 8],
					[20, 3],
				].entries()) {
					for (const [index, root] of roots.entries()) {
						if (step !== 0) {
							root.update(index === 0 ? client.Inline : client.Variable, {
								prefix: { position: 'absolute' },
								left,
								right,
							});
						}
						const element = root.find('div') as HTMLElement;
						updated[index] = element;
						styles[index].push([
							element.style.left,
							element.style.right,
							element.style.getPropertyValue('--spread-touch'),
						]);
					}
				}
			} finally {
				if (previous) Object.defineProperty(Object.prototype, '--spread-touch', previous);
				else Reflect.deleteProperty(Object.prototype, '--spread-touch');
				for (const root of roots) root.unmount();
			}
			expect(updated[0]).toBe(elements[0]);
			expect(updated[1]).toBe(elements[1]);
			expect(styles[1]).toEqual([
				['10px', '5px', 'visited'],
				['10px', '8px', 'visited'],
				['20px', '3px', 'visited'],
			]);
			expect(styles[0]).toEqual(styles[1]);
		},
	);

	it.each([false, true])(
		'coerces integer style keys before spread string keys in dev=%s',
		(dev) => {
			const source = `
export function App(props) @{
	<div style={{ ...props.prefix, '0': props.index, left: props.left }} />
}`;
			const client = compiled(source, `spread-integer-${dev}.tsrx`, 'client', dev);
			const calls: string[] = [];
			const value = (key: string, text: string) => ({
				toString() {
					calls.push(key);
					return text;
				},
			});
			const root = mount(client.App, {
				prefix: { '--token': value('spread', 'initial') },
				index: value('integer', 'ignored'),
				left: 5,
			});
			const element = root.find('div') as HTMLElement;
			try {
				expect(calls).toEqual(['integer', 'spread']);
				expect(element.style.getPropertyValue('--token')).toBe('initial');
				calls.length = 0;
				root.update(client.App, {
					prefix: { '--token': value('spread', 'updated') },
					index: value('integer', 'ignored'),
					left: 12,
				});
				expect(calls).toEqual(['integer', 'spread']);
				expect(root.find('div')).toBe(element);
				expect(element.style.getPropertyValue('--token')).toBe('updated');
				expect(element.style.left).toBe('12px');
			} finally {
				root.unmount();
			}
		},
	);

	it.each([false, true])('resolves duplicate literal keys before applying CSS in dev=%s', (dev) => {
		const client = compiled(DUPLICATE_SOURCE, `duplicate-literals-${dev}.tsrx`, 'client', dev);
		const root = mount(client.LiteralDuplicates);
		const element = root.find('#literal-duplicates') as HTMLElement;
		try {
			expect(element.style.marginTop).toBe('4px');
			expect(element.style.marginRight).toBe('4px');
			expect(element.style.color).toBe('');
			expect(element.style.backgroundColor).toBe('');
			expect(element.style.display).toBe('');
			expect(element.style.getPropertyValue('--removed')).toBe('');
		} finally {
			root.unmount();
		}
	});

	it.each([false, true])('uses the final duplicate value on mount and update in dev=%s', (dev) => {
		const client = compiled(DUPLICATE_SOURCE, `duplicate-values-${dev}.tsrx`, 'client', dev);
		const fixed = mount(client.StaticWinner, { color: 'blue', background: 'black' });
		const fixedElement = fixed.find('#static-winner') as HTMLElement;
		try {
			expect(fixedElement.style.color).toBe('red');
			expect(fixedElement.style.backgroundColor).toBe('black');
			for (const color of ['green', null, undefined, false, '']) {
				fixed.update(client.StaticWinner, { color, background: 'white' });
				expect(fixed.find('#static-winner')).toBe(fixedElement);
				expect(fixedElement.style.color).toBe('red');
				expect(fixedElement.style.backgroundColor).toBe('white');
			}
		} finally {
			fixed.unmount();
		}

		const dynamic = mount(client.DynamicWinner, { color: null, background: 'black' });
		const dynamicElement = dynamic.find('#dynamic-winner') as HTMLElement;
		try {
			expect(dynamicElement.style.color).toBe('');
			expect(dynamicElement.style.backgroundColor).toBe('black');
			for (const color of ['blue', null, 'green', undefined, 'purple', false, 'yellow', '']) {
				dynamic.update(client.DynamicWinner, { color, background: 'white' });
				expect(dynamic.find('#dynamic-winner')).toBe(dynamicElement);
				expect(dynamicElement.style.color).toBe(typeof color === 'string' ? color : '');
				expect(dynamicElement.style.backgroundColor).toBe('white');
			}
		} finally {
			dynamic.unmount();
		}
	});

	it.each([false, true])(
		'evaluates overwritten style expressions in authored order in dev=%s',
		(dev) => {
			const source = `
export function App(props) @{
	<div
		id="duplicate-order"
		data-before={props.read('before')}
		style={{ left: props.read('discarded'), color: props.read('color'), left: props.read('overwritten'), 'left': props.read('winner') }}
		data-after={props.read('after')}
	/>
}`;
			const client = compiled(source, `duplicate-order-${dev}.tsrx`, 'client', dev);
			const calls: string[] = [];
			const values: Record<string, string | number> = {
				discarded: 5,
				color: 'red',
				overwritten: 8,
				winner: 12,
			};
			const read = (key: string) => {
				calls.push(key);
				return values[key] ?? key;
			};
			const root = mount(client.App, { read });
			const element = root.find('#duplicate-order') as HTMLElement;
			try {
				expect(calls).toEqual(['before', 'discarded', 'color', 'overwritten', 'winner', 'after']);
				expect(element.style.left).toBe('12px');
				expect(element.style.color).toBe('red');
				calls.length = 0;
				values.discarded = 20;
				values.color = 'blue';
				root.update(client.App, { read });
				expect(calls).toEqual(['before', 'discarded', 'color', 'overwritten', 'winner', 'after']);
				expect(element.style.left).toBe('12px');
				expect(element.style.color).toBe('blue');
			} finally {
				root.unmount();
			}
		},
	);

	it.each([false, true])(
		'preserves inferred names while evaluating overwritten style classes in dev=%s',
		(dev) => {
			const source = `
export function Direct(props) @{
	<div style={{ color: class { static { props.record(this.name); } }, color: 'red', background: props.background }} />
}

export function Wrapped(props) @{
	<div style={{ color: (class { static { props.record(this.name); } } as unknown), color: 'red', background: props.background }} />
}`;
			const client = compiled(source, `duplicate-class-names-${dev}.tsrx`, 'client', dev);
			for (const name of ['Direct', 'Wrapped']) {
				const names: string[] = [];
				const record = (value: string) => names.push(value);
				const root = mount(client[name], { record, background: 'black' });
				const element = root.find('div') as HTMLElement;
				try {
					expect(names).toEqual(['color']);
					expect(element.style.color).toBe('red');
					expect(element.style.backgroundColor).toBe('black');
					names.length = 0;
					root.update(client[name], { record, background: 'white' });
					expect(names).toEqual(['color']);
					expect(root.find('div')).toBe(element);
					expect(element.style.color).toBe('red');
					expect(element.style.backgroundColor).toBe('white');
				} finally {
					root.unmount();
				}
			}
		},
	);

	it.each([false, true])(
		'propagates duplicate expression errors before changing styles in dev=%s',
		(dev) => {
			const source = `
export function App(props) @{
	<div id="duplicate-error" style={{ left: props.read('discarded'), color: props.read('color'), left: props.read('winner') }} />
}`;
			const client = compiled(source, `duplicate-error-${dev}.tsrx`, 'client', dev);
			for (const failure of ['discarded', 'winner']) {
				const calls: string[] = [];
				const throwingRead = (key: string) => {
					calls.push(key);
					if (key === failure) throw new Error(`failed ${failure}`);
					return key === 'color' ? 'blue' : 20;
				};
				const expectedCalls =
					failure === 'discarded' ? ['discarded'] : ['discarded', 'color', 'winner'];
				expect(() => mount(client.App, { read: throwingRead })).toThrow(`failed ${failure}`);
				expect(calls).toEqual(expectedCalls);
				const root = mount(client.App, { read: (key: string) => (key === 'color' ? 'red' : 5) });
				const element = root.find('#duplicate-error') as HTMLElement;
				try {
					calls.length = 0;
					expect(() => root.update(client.App, { read: throwingRead })).toThrow(
						`failed ${failure}`,
					);
					expect(calls).toEqual(expectedCalls);
					expect(element.style.left).toBe('5px');
					expect(element.style.color).toBe('red');
				} finally {
					root.unmount();
				}
			}
		},
	);

	it.each([false, true])(
		'retains the first insertion position of duplicate style keys in dev=%s',
		(dev) => {
			const client = compiled(DUPLICATE_SOURCE, `duplicate-position-${dev}.tsrx`, 'client', dev);
			for (const name of ['LonghandFirst', 'ShorthandFirst']) {
				const root = mount(client[name], { discarded: '1px', margin: '4px', top: '8px' });
				const element = root.find('div') as HTMLElement;
				try {
					expect(element.style.marginTop).toBe(name === 'LonghandFirst' ? '4px' : '8px');
					expect(element.style.marginRight).toBe('4px');
					root.update(client[name], { discarded: '2px', margin: '12px', top: '16px' });
					expect(root.find('div')).toBe(element);
					expect(element.style.marginTop).toBe(name === 'LonghandFirst' ? '12px' : '16px');
					expect(element.style.marginRight).toBe('12px');
				} finally {
					root.unmount();
				}
			}
		},
	);

	it.each([false, true])('hydrates duplicate style values and key order in dev=%s', (dev) => {
		const id = `duplicate-hydration-${dev}.tsrx`;
		const server = compiled(DUPLICATE_SOURCE, id, 'server', dev);
		const client = compiled(DUPLICATE_SOURCE, id, 'client', dev);
		for (const [name, initialColor, nextColor, initialTop, nextTop] of [
			['StaticWinner', 'red', 'red', '', ''],
			['DynamicWinner', '', 'blue', '', ''],
			['LiteralDuplicates', '', '', '4px', '4px'],
		]) {
			const props = {
				color: null,
				background: 'black',
				discarded: '1px',
				margin: '4px',
				top: '8px',
			};
			const container = document.createElement('div');
			container.innerHTML = renderToString(server[name], props).html;
			document.body.appendChild(container);
			const element = container.querySelector('div') as HTMLElement;
			const original = element.getAttribute('style');
			const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
			let root: ReturnType<typeof hydrateRoot> | undefined;
			try {
				expect(element.style.color).toBe(initialColor);
				expect(element.style.marginTop).toBe(initialTop);
				if (name === 'LiteralDuplicates') {
					expect(element.style.backgroundColor).toBe('');
					expect(element.style.display).toBe('');
					expect(element.style.getPropertyValue('--removed')).toBe('');
					expect(original).not.toContain('--removed');
				}
				root = hydrateRoot(container, client[name], props);
				flushSync(() => {});
				expect(container.querySelector('div')).toBe(element);
				expect(element.getAttribute('style')).toBe(original);
				if (name === 'LiteralDuplicates') {
					expect(element.style.getPropertyValue('--removed')).toBe('');
				}
				expect(
					warnings.mock.calls.filter((args) => /hydrat|mismatch/i.test(String(args[0]))),
				).toEqual([]);
				flushSync(() =>
					root!.render(client[name], {
						color: 'blue',
						background: 'white',
						discarded: '2px',
						margin: '12px',
						top: '16px',
					}),
				);
				expect(container.querySelector('div')).toBe(element);
				expect(element.style.color).toBe(nextColor);
				expect(element.style.marginTop).toBe(nextTop);
			} finally {
				root?.unmount();
				warnings.mockRestore();
				container.remove();
			}
		}
	});

	it.each([false, true])('updates one and several dynamic values in dev=%s', (dev) => {
		const client = compiled(SOURCE, `object-literals-${dev}.tsrx`, 'client', dev);
		const single = mount(client.Single, { color: 'red' });
		const one = single.find('#single-style') as HTMLElement;
		expect(one.style.color).toBe('red');
		single.update(client.Single, { color: 'blue' });
		expect(single.find('#single-style')).toBe(one);
		expect(one.style.color).toBe('blue');
		single.update(client.Single, { color: null });
		expect(one.style.color).toBe('');
		single.unmount();

		const multiple = mount(client.Multiple, { top: 8, color: 'red !important', accent: 10 });
		const many = multiple.find('#multiple-style') as HTMLElement;
		expect(many.style.position).toBe('absolute');
		expect(many.style.marginTop).toBe('8px');
		expect(many.style.marginRight).toBe('4px');
		expect(many.style.color).toBe('red');
		expect(many.style.getPropertyPriority('color')).toBe('important');
		expect(many.style.getPropertyValue('--accent')).toBe('10');

		multiple.update(client.Multiple, { top: 12, color: 'blue', accent: 12 });
		expect(multiple.find('#multiple-style')).toBe(many);
		expect(many.style.marginTop).toBe('12px');
		expect(many.style.marginRight).toBe('4px');
		expect(many.style.color).toBe('blue');
		expect(many.style.getPropertyPriority('color')).toBe('');
		expect(many.style.getPropertyValue('--accent')).toBe('12');

		multiple.update(client.Multiple, { top: null, color: null, accent: null });
		expect(many.style.marginTop).toBe('');
		expect(many.style.marginRight).toBe('4px');
		expect(many.style.color).toBe('');
		expect(many.style.getPropertyValue('--accent')).toBe('');
		multiple.unmount();

		const allDynamic = mount(client.AllDynamic, { left: 5, opacity: 0.5 });
		const both = allDynamic.find('#all-dynamic-style') as HTMLElement;
		expect(both.style.left).toBe('5px');
		expect(both.style.opacity).toBe('0.5');
		allDynamic.update(client.AllDynamic, { left: 0, opacity: 1 });
		expect(allDynamic.find('#all-dynamic-style')).toBe(both);
		expect(both.style.left).toBe('0px');
		expect(both.style.opacity).toBe('1');
		allDynamic.unmount();
	});

	it('preserves a static shorthand when dynamic values start out empty', () => {
		const client = compiled(SOURCE, 'object-literal-empty.tsrx', 'client');
		const root = mount(client.Multiple, { top: null, color: null, accent: null });
		const element = root.find('#multiple-style') as HTMLElement;
		expect(element.style.marginTop).toBe('4px');
		expect(element.style.marginRight).toBe('4px');
		root.update(client.Multiple, { top: 8, color: 'blue', accent: 'active' });
		expect(element.style.marginTop).toBe('8px');
		root.update(client.Multiple, { top: null, color: null, accent: null });
		expect(element.style.marginTop).toBe('');
		expect(element.style.marginRight).toBe('4px');
		root.unmount();
	});

	it('evaluates grouped values at the style attribute in authored order', () => {
		const source = `
export function App(props) @{
	<div
		id="ordered-style"
		data-before={props.read('before')}
		style={{ position: 'absolute', left: props.read('left'), color: props.read('color') }}
		data-after={props.read('after')}
	>{'order'}</div>
}`;
		const client = compiled(source, 'object-literal-order.tsrx', 'client');
		const calls: string[] = [];
		const read = (key: string) => {
			calls.push(key);
			return key === 'left' ? 8 : key === 'color' ? 'red' : key;
		};
		const root = mount(client.App, { read });
		const element = root.find('#ordered-style') as HTMLElement;
		expect(calls).toEqual(['before', 'left', 'color', 'after']);
		expect(element.style.left).toBe('8px');
		expect(element.style.color).toBe('red');
		calls.length = 0;
		root.update(client.App, { read });
		expect(calls).toEqual(['before', 'left', 'color', 'after']);
		root.unmount();
	});

	it('evaluates the full suffix before writing a changed property', () => {
		const source = `
export function App(props) @{
	<div id="atomic-style" style={{ left: props.read('left'), color: props.read('color') }} />
}`;
		const client = compiled(source, 'object-literal-throw.tsrx', 'client');
		const root = mount(client.App, {
			read: (name: string) => (name === 'left' ? 5 : 'red'),
		});
		const element = root.find('#atomic-style') as HTMLElement;
		try {
			expect(() =>
				root.update(client.App, {
					read: (name: string) => {
						if (name === 'color') throw new Error('late style value');
						return 12;
					},
				}),
			).toThrow('late style value');
			expect(element.style.left).toBe('5px');
			expect(element.style.color).toBe('red');
		} finally {
			root.unmount();
		}
	});

	it.each(['null', 'false', 'true', "''"])(
		'accepts leading nonbaked literal %s ahead of a live property',
		(literal) => {
			const source = `
export function App(props) @{
	<div id="nonbaked-style" style={{ color: ${literal}, left: props.left }} />
}`;
			const client = compiled(source, `object-literal-${literal}.tsrx`, 'client');
			const root = mount(client.App, { left: 5 });
			const element = root.find('#nonbaked-style') as HTMLElement;
			expect(element.style.left).toBe('5px');
			expect(element.style.color).toBe('');
			root.update(client.App, { left: 12 });
			expect(element.style.left).toBe('12px');
			expect(element.style.color).toBe('');
			root.unmount();
		},
	);

	it('keeps a baked numeric zero before a dynamic property', () => {
		const source = `
export function App(props) @{
	<div id="zero-style" style={{ opacity: 0, left: props.left }} />
}`;
		const client = compiled(source, 'object-literal-zero.tsrx', 'client');
		const root = mount(client.App, { left: 5 });
		const element = root.find('#zero-style') as HTMLElement;
		expect(element.style.opacity).toBe('0');
		expect(element.style.left).toBe('5px');
		root.update(client.App, { left: 12 });
		expect(element.style.opacity).toBe('0');
		expect(element.style.left).toBe('12px');
		root.unmount();
	});

	it.each([false, true])('server markup hydrates a complete dynamic style in dev=%s', (dev) => {
		const id = `object-literal-hydration-${dev}.tsrx`;
		const source = `
export function App(props) @{
	<div id="multiple-style" style={{ position: 'absolute', top: props.top, color: props.color, '--accent': props.accent }} />
}`;
		const server = compiled(source, id, 'server', dev);
		const client = compiled(source, id, 'client', dev);
		const props = { top: 8, color: 'red', accent: 10 };
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.App, props).html;
		document.body.appendChild(container);
		const element = container.querySelector('#multiple-style') as HTMLElement;
		const original = element.getAttribute('style');
		expect(element.style.position).toBe('absolute');
		expect(element.style.top).toBe('8px');
		expect(element.style.color).toBe('red');
		expect(element.style.getPropertyValue('--accent')).toBe('10');
		const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, client.App, props);
			flushSync(() => {});
			expect(container.querySelector('#multiple-style')).toBe(element);
			expect(element.getAttribute('style')).toBe(original);
			expect(element.style.top).toBe('8px');
			expect(
				warnings.mock.calls.filter((args) => /hydrat|mismatch/i.test(String(args[0]))),
			).toEqual([]);
			flushSync(() => root!.render(client.App, { top: null, color: 'blue', accent: null }));
			expect(container.querySelector('#multiple-style')).toBe(element);
			expect(element.style.top).toBe('');
			expect(element.style.color).toBe('blue');
			expect(element.style.getPropertyValue('--accent')).toBe('');
		} finally {
			root?.unmount();
			warnings.mockRestore();
			container.remove();
		}
	});

	it('hydrates an all-dynamic style with a fixed identifier and literal suffix', () => {
		const source = `
const display = 'block';
export function App(props) @{
	<div id="interleaved-style" style={{ left: props.left, display, right: props.right, opacity: 0.5 }} />
}`;
		const id = 'object-literal-interleaved-hydration.tsrx';
		const server = compiled(source, id, 'server');
		const client = compiled(source, id, 'client');
		const container = document.createElement('div');
		container.innerHTML = renderToString(server.App, { left: 2, right: 3 }).html;
		document.body.appendChild(container);
		const element = container.querySelector('#interleaved-style') as HTMLElement;
		const original = element.getAttribute('style');
		expect(element.style.left).toBe('2px');
		expect(element.style.right).toBe('3px');
		expect(element.style.display).toBe('block');
		expect(element.style.opacity).toBe('0.5');
		const warnings = vi.spyOn(console, 'error').mockImplementation(() => {});
		let root: ReturnType<typeof hydrateRoot> | undefined;
		try {
			root = hydrateRoot(container, client.App, { left: 2, right: 3 });
			flushSync(() => {});
			expect(container.querySelector('#interleaved-style')).toBe(element);
			expect(element.getAttribute('style')).toBe(original);
			expect(
				warnings.mock.calls.filter((args) => /hydrat|mismatch/i.test(String(args[0]))),
			).toEqual([]);
			flushSync(() => root!.render(client.App, { left: 5, right: 7 }));
			expect(element.style.left).toBe('5px');
			expect(element.style.right).toBe('7px');
			expect(element.style.display).toBe('block');
			expect(element.style.opacity).toBe('0.5');
		} finally {
			root?.unmount();
			warnings.mockRestore();
			container.remove();
		}
	});

	it('keeps dynamic shorthand and longhand update precedence', () => {
		const source = `
export function App(props) @{
	<div id="overlapping-style" style={{ margin: props.margin, marginTop: props.top }} />
}`;
		const client = compiled(source, 'object-literal-shorthand.tsrx', 'client');
		const root = mount(client.App, { margin: '4px', top: '8px' });
		const element = root.find('#overlapping-style') as HTMLElement;
		expect(element.style.marginTop).toBe('8px');
		root.update(client.App, { margin: '12px', top: '8px' });
		expect(element.style.marginTop).toBe('12px');
		expect(element.style.marginRight).toBe('12px');
		root.update(client.App, { margin: '12px', top: '2px' });
		expect(element.style.marginTop).toBe('2px');
		root.unmount();
	});

	it('handles fixed identifiers, interleaved dynamics, and literal suffixes', () => {
		const source = `
const display = 'block';
export function First(props) @{
	<div id="first-style" style={{ display, color: props.color }} />
}
export function Last(props) @{
	<div id="last-style" style={{ left: props.left, right: props.right, display }} />
}
export function Middle(props) @{
	<div id="middle-style" style={{ left: props.left, display: props.display, right: props.right }} />
}
export function LiteralLast(props) @{
	<div id="literal-last-style" style={{ left: props.left, right: props.right, display: 'grid' }} />
}`;
		const client = compiled(source, 'object-literal-interleaved.tsrx', 'client');
		const first = mount(client.First, { color: 'red' });
		const firstElement = first.find('#first-style') as HTMLElement;
		expect(firstElement.style.display).toBe('block');
		expect(firstElement.style.color).toBe('red');
		first.update(client.First, { color: 'blue' });
		expect(firstElement.style.display).toBe('block');
		expect(firstElement.style.color).toBe('blue');
		first.unmount();

		const last = mount(client.Last, { left: 4, right: 5 });
		const lastElement = last.find('#last-style') as HTMLElement;
		expect(lastElement.style.left).toBe('4px');
		expect(lastElement.style.right).toBe('5px');
		expect(lastElement.style.display).toBe('block');
		last.update(client.Last, { left: 8, right: 9 });
		expect(lastElement.style.left).toBe('8px');
		expect(lastElement.style.right).toBe('9px');
		expect(lastElement.style.display).toBe('block');
		last.unmount();

		const middle = mount(client.Middle, { left: 1, display: 'flex', right: 2 });
		const middleElement = middle.find('#middle-style') as HTMLElement;
		expect(middleElement.style.display).toBe('flex');
		middle.update(client.Middle, { left: 3, display: 'grid', right: 4 });
		expect(middleElement.style.left).toBe('3px');
		expect(middleElement.style.display).toBe('grid');
		expect(middleElement.style.right).toBe('4px');
		middle.unmount();

		const suffix = mount(client.LiteralLast, { left: 1, right: 2 });
		const suffixElement = suffix.find('#literal-last-style') as HTMLElement;
		expect(suffixElement.style.display).toBe('grid');
		suffix.update(client.LiteralLast, { left: 3, right: 4 });
		expect(suffixElement.style.left).toBe('3px');
		expect(suffixElement.style.right).toBe('4px');
		expect(suffixElement.style.display).toBe('grid');
		suffix.unmount();
	});

	it('keeps colliding CSS names on the generic ordered path', () => {
		const source = `
export function App(props) @{
	<div id="alias-style" style={{ fontSize: props.first, 'font-size': props.second, cssFloat: props.floatFirst, float: props.floatSecond }} />
}`;
		const client = compiled(source, 'object-literal-alias.tsrx', 'client');
		const root = mount(client.App, {
			first: 12,
			second: 16,
			floatFirst: 'left',
			floatSecond: 'right',
		});
		const element = root.find('#alias-style') as HTMLElement;
		expect(element.style.fontSize).toBe('16px');
		expect(element.style.cssFloat).toBe('right');
		root.update(client.App, {
			first: 14,
			second: 18,
			floatFirst: 'none',
			floatSecond: 'left',
		});
		expect(element.style.fontSize).toBe('18px');
		expect(element.style.cssFloat).toBe('left');
		root.unmount();
	});

	it('keeps accessor, spread, and static suffix observations intact', () => {
		const source = `
export function App(props) @{
	<div
		id="generic-style"
		style={{
			position: 'absolute',
			...props.extra,
			get color() { props.observe('getter'); return props.color; },
			width: '12px',
		}}
	/>
}`;
		const client = compiled(source, 'object-literal-generic.tsrx', 'client');
		const observed: string[] = [];
		const root = mount(client.App, {
			color: 'red',
			extra: new Proxy(
				{ opacity: 0.5 },
				{
					ownKeys(target) {
						observed.push('spread');
						return Reflect.ownKeys(target);
					},
				},
			),
			observe: (event: string) => observed.push(event),
		});
		const element = root.find('#generic-style') as HTMLElement;
		expect(observed).toEqual(['spread', 'getter']);
		expect(element.style.opacity).toBe('0.5');
		expect(element.style.color).toBe('red');
		expect(element.style.width).toBe('12px');
		root.unmount();
	});

	it('samples an actual native signal read inside a dynamic style object', () => {
		const source = `
import 'octane/signals';
export function App(props) @{
	<div id="sampled-style" style={{ left: props.scope.get(props.left$), color: props.color }} />
}`;
		const client = loadCompiledFixtureSource(source, {
			id: 'object-literal-native-read.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const scope = createScope({ scopeKey: 'object-literal-native-read' });
		const left$ = scope.signal$('left', 5);
		const root = mount(client.App, { scope, left$, color: 'red' });
		const element = root.find('#sampled-style') as HTMLElement;
		try {
			expect(element.style.left).toBe('5px');
			flushSync(() => scope.set(left$, 12));
			expect(root.find('#sampled-style')).toBe(element);
			expect(element.style.left).toBe('12px');
			expect(element.style.color).toBe('red');
		} finally {
			root.unmount();
			scope.dispose();
		}
	});
});
