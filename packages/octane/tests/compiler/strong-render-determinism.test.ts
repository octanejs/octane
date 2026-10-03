import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const RENDER_IMPURE_CALL = 'OCTANE_STRONG_RENDER_IMPURE_CALL';
const RENDER_LOCALE_FORMAT = 'OCTANE_STRONG_RENDER_LOCALE_FORMAT';
const RENDER_STATE_UPDATE = 'OCTANE_STRONG_RENDER_STATE_UPDATE';
const RENDER_REF_READ = 'OCTANE_STRONG_RENDER_REF_READ';
const RENDER_SIDE_EFFECT = 'OCTANE_STRONG_RENDER_SIDE_EFFECT';
const RENDER_AMBIENT_READ = 'OCTANE_STRONG_RENDER_AMBIENT_READ';
const IMPURE_UPDATER = 'OCTANE_STRONG_IMPURE_UPDATER';

const IMPORTS = "import { useEffect, useLayoutEffect, useRef, useState } from 'octane';\n";
const MODES = [
	{ mode: 'client', dev: true },
	{ mode: 'client', dev: false },
	{ mode: 'server', dev: true },
	{ mode: 'server', dev: false },
] as const;

function errors(source: string, filename: string) {
	return compileToVolarMappings(source, filename).diagnostics.filter(
		(diagnostic: { severity: string }) => diagnostic.severity === 'error',
	);
}

/** Compatibility mode accepts the module; Strong rejects it everywhere with `code`. */
function expectStrongError(source: string, filename: string, code: string) {
	expect(() => compile(source, filename)).not.toThrow();
	const strong = `"use strong";\n${source}`;
	expect(() => compile(strong, filename)).toThrow(code);
	for (const options of MODES) {
		expect(() => compile(source, filename, { ...options, strong: true } as any)).toThrow(code);
	}
	expect(errors(strong, filename)).toContainEqual(
		expect.objectContaining({ code, severity: 'error' }),
	);
}

function expectStrongValid(source: string, filename: string) {
	const strong = `"use strong";\n${source}`;
	expect(() => compile(strong, filename)).not.toThrow();
	expect(errors(strong, filename)).toEqual([]);
}

function messageOf(source: string, filename: string, code: string): string {
	const diagnostic = errors(`"use strong";\n${source}`, filename).find(
		(entry: { code: string }) => entry.code === code,
	);
	expect(diagnostic).toBeDefined();
	return diagnostic!.message;
}

describe('Strong render-phase array callbacks', () => {
	it.each([
		['map', 'items.map((item) => item.value * Math.random())'],
		['filter', 'items.filter(() => Math.random() > 0.5)'],
		['forEach', 'items.forEach((item) => seen.push(Math.random()))'],
		['reduce', 'items.reduce((sum) => sum + Math.random(), 0)'],
		['reduceRight', 'items.reduceRight((sum) => sum + Date.now(), 0)'],
		['flatMap', 'items.flatMap(() => [Math.random()])'],
		['some', 'items.some(() => Math.random() > 0.5)'],
		['every', 'items.every(() => performance.now() > 0)'],
		['find', 'items.find(() => Math.random() > 0.5)'],
		['findIndex', 'items.findIndex(() => Math.random() > 0.5)'],
		['findLast', 'items.findLast(() => Math.random() > 0.5)'],
		['sort', '[...items].sort(() => Math.random() - 0.5)'],
		['toSorted', 'items.toSorted(() => Math.random() - 0.5)'],
		['Array.from', 'Array.from(items, () => Math.random())'],
		['optional calls', 'items?.map?.(() => Math.random())'],
		['computed method names', "items['map'](() => Math.random())"],
	])('rejects nondeterminism in a %s callback', (_label, call) => {
		const source = `export function App({ items }) {
  const seen = [];
  const value = ${call};
  return <p>{String(value)}{seen.length}</p>;
}`;
		expectStrongError(source, '/src/App.tsx', RENDER_IMPURE_CALL);
	});

	it('rejects the .tsx probe keys and children rendered from .map', () => {
		const key = `export function A({ items }) { return <ul>{items.map(i => <li key={Math.random()}>{i.name}</li>)}</ul>; }`;
		const child = `export function A({ items }) { return <ul>{items.map(i => <li key={i.id}>{Math.random()}</li>)}</ul>; }`;
		expectStrongError(key, '/src/App.tsx', RENDER_IMPURE_CALL);
		expectStrongError(child, '/src/App.tsx', RENDER_IMPURE_CALL);
		expect(messageOf(key, '/src/App.tsx', RENDER_IMPURE_CALL)).toContain('stable ID from the item');
		expect(messageOf(child, '/src/App.tsx', RENDER_IMPURE_CALL)).toContain(
			'Read time or randomness outside render',
		);
	});

	it('follows callbacks passed by reference and applies the other render rules', () => {
		expectStrongError(
			`export function App({ items }) {
  const renderItem = (item) => <li key={item.id}>{Date.now()}</li>;
  return <ul>{items.map(renderItem)}</ul>;
}`,
			'/src/App.tsx',
			RENDER_IMPURE_CALL,
		);
		expectStrongError(
			`${IMPORTS}export function App({ items }) {
  const [selected, setSelected] = useState(null);
  items.forEach(setSelected);
  return <p>{selected}</p>;
}`,
			'/src/App.tsx',
			RENDER_STATE_UPDATE,
		);
		expectStrongError(
			`${IMPORTS}export function App({ items }) {
  const widths = useRef({});
  return <ul>{items.map((item) => <li key={item.id}>{widths.current[item.id]}</li>)}</ul>;
}`,
			'/src/App.tsx',
			RENDER_REF_READ,
		);
	});

	it('checks data mapping in .tsrx, @for rows, and plain custom-hook modules', () => {
		expectStrongError(
			`export function App({ items }) @{
  const labels = items.map((item) => item.name + Math.random());
  <p>{labels.join(', ') as string}</p>
}`,
			'/src/App.tsrx',
			RENDER_IMPURE_CALL,
		);
		expectStrongError(
			`export function App({ groups }) @{
  <ul>
    @for (const group of groups; key group.id) {
      <li>{group.items.filter(() => Math.random() > 0.5).length as number}</li>
    }
  </ul>
}`,
			'/src/App.tsrx',
			RENDER_IMPURE_CALL,
		);
		expect(() =>
			slotHooks(
				'"use strong"; export function useShuffled(items) { return items.toSorted(() => Math.random() - 0.5); }',
				'/src/useShuffled.ts',
			),
		).toThrow(RENDER_IMPURE_CALL);
	});

	it('still checks a generator passed to an array method, whose body runs later', () => {
		const source = `import * as Octane from 'octane';
export function App({ items }) {
  const steps = items.map(function* () { Octane.flushSync(() => {}); });
  return <p>{steps.length}</p>;
}`;
		expectStrongError(source, '/src/App.tsx', 'OCTANE_STRONG_COMPAT_IMPORT');
		expectStrongValid(
			source.replace('Octane.flushSync(() => {});', 'yield Math.random();'),
			'/src/App.tsx',
		);
	});

	it('keeps deferred, lazy, deterministic, and shadowed callbacks legal', () => {
		expectStrongValid(
			`${IMPORTS}const Math = { random: () => 0.5 };
export function App({ items, request }) {
  const [seeds] = useState(() => items.map(() => globalThis.Math.random()));
  const [picked, setPicked] = useState(null);
  useEffect(() => { items.forEach(() => console.log(Date.now())); });
  const doubled = items.map((item) => item.value * 2);
  const stable = items.map((item) => item.value * Math.random());
  request.then(() => Date.now());
  return <button onClick={() => items.forEach((item) => setPicked(item.id + Date.now()))}>{String(seeds.length + doubled.length + stable.length)}{picked}</button>;
}`,
			'/src/App.tsx',
		);
	});
});

describe('Strong random IDs during render', () => {
	it.each([
		['randomUUID', 'crypto.randomUUID()'],
		['getRandomValues', 'crypto.getRandomValues(new Uint8Array(4))[0]'],
		['optional chains', 'crypto?.randomUUID?.()'],
		['computed members', "crypto['randomUUID']()"],
		['const aliases', '(() => { const c = crypto; return c.randomUUID(); })()'],
	])('rejects %s and suggests useId', (_label, call) => {
		const source = `export function App() { const id = ${call}; return <p id={String(id)} />; }`;
		expectStrongError(source, '/src/App.tsx', RENDER_IMPURE_CALL);
		expect(messageOf(source, '/src/App.tsx', RENDER_IMPURE_CALL)).toContain('useId()');
	});

	it('rejects random keys in .tsx lists and @for headers with the key replacement', () => {
		const list = `export function App({ items }) { return <ul>{items.map((item) => <li key={crypto.randomUUID()}>{item.name}</li>)}</ul>; }`;
		const row = `export function App({ items }) @{
  <ul>
    @for (const item of items; key crypto.randomUUID()) {
      <li>{item.name as string}</li>
    }
  </ul>
}`;
		expectStrongError(list, '/src/App.tsx', RENDER_IMPURE_CALL);
		expect(messageOf(list, '/src/App.tsx', RENDER_IMPURE_CALL)).toContain(
			'stable ID from the item',
		);
		expectStrongError(row, '/src/App.tsrx', RENDER_IMPURE_CALL);
		expect(messageOf(row, '/src/App.tsrx', RENDER_IMPURE_CALL)).toContain(
			'stable ID from the item',
		);
	});

	it('keeps event, lazy-initializer, shadowed, and non-random crypto use legal', () => {
		expectStrongValid(
			`${IMPORTS}export function App({ crypto: provided }) {
  const [draftId] = useState(() => crypto.randomUUID());
  const [id, setId] = useState('');
  const subtle = crypto.subtle;
  return <button onClick={() => setId(crypto.randomUUID())}>{draftId}{id}{String(Boolean(subtle))}{provided.randomUUID()}</button>;
}
export function Shadowed({ crypto }) { return <p>{crypto.randomUUID()}</p>; }`,
			'/src/App.tsx',
		);
	});
});

describe('Strong locale and time-zone formatting during render', () => {
	it.each([
		['toLocaleString', 'new Date(t).toLocaleString()'],
		['toLocaleDateString', 'new Date(t).toLocaleDateString()'],
		['toLocaleTimeString', 'new Date(t).toLocaleTimeString()'],
		['a locale without a time zone', "new Date(t).toLocaleDateString('en-US')"],
		[
			'visible options without a time zone',
			"new Date(t).toLocaleDateString('en-US', { month: 'short' })",
		],
		['an empty locale list', "new Date(t).toLocaleString([], { timeZone: 'UTC' })"],
		['an undefined locale', "new Date(t).toLocaleString(undefined, { timeZone: 'UTC' })"],
		['an undefined time zone', "new Date(t).toLocaleString('en-US', { timeZone: undefined })"],
		['toString', 'new Date(t).toString()'],
		['toTimeString', 'new Date(t).toTimeString()'],
		['Date aliases', '(() => { const date = new Date(t); return date.toLocaleDateString(); })()'],
		['Intl.DateTimeFormat calls', 'Intl.DateTimeFormat().format(t)'],
		['new Intl.DateTimeFormat without a time zone', "new Intl.DateTimeFormat('en-US').format(t)"],
		['new Intl.NumberFormat', 'new Intl.NumberFormat().format(t)'],
		['Intl.RelativeTimeFormat', "new Intl.RelativeTimeFormat().format(t, 'day')"],
		['the probe with new Date()', 'new Intl.DateTimeFormat().format(new Date())'],
	])('rejects %s', (_label, expression) => {
		const source = `export function App({ t }) { return <p>{${expression}}</p>; }`;
		expectStrongError(source, '/src/App.tsx', RENDER_LOCALE_FORMAT);
	});

	it('names explicit locale and time-zone replacements', () => {
		const date = `export function App({ t }) { return <p>{new Date(t).toLocaleString()}</p>; }`;
		const intl = `export function App({ n }) { return <p>{new Intl.NumberFormat().format(n)}</p>; }`;
		expect(messageOf(date, '/src/App.tsx', RENDER_LOCALE_FORMAT)).toContain(
			"toLocaleString('en-US', { timeZone: 'UTC' })",
		);
		expect(messageOf(intl, '/src/App.tsx', RENDER_LOCALE_FORMAT)).toContain(
			"new Intl.NumberFormat('en-US')",
		);
	});

	it('rejects rendering with module-level formatters that lack a locale or time zone', () => {
		expectStrongError(
			`const format = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
export function App({ t }) { return <p>{format.format(t)}</p>; }`,
			'/src/App.tsx',
			RENDER_LOCALE_FORMAT,
		);
		expectStrongError(
			`export function App({ n }) { return <p>{numbers.format(n)}</p>; }
const numbers = new Intl.NumberFormat();`,
			'/src/App.tsx',
			RENDER_LOCALE_FORMAT,
		);
		expectStrongError(
			`const format = new Intl.DateTimeFormat();
export function App({ t }) { const local = format; const again = local; return <p>{again.format(t)}</p>; }`,
			'/src/App.tsx',
			RENDER_LOCALE_FORMAT,
		);
	});

	it('leaves locale formatting in updaters and reducers to the updater checks', () => {
		// Updaters and reducers run on the client after an event, and a replay on
		// the same client formats the same way, so locale formatting there is
		// stable. Randomness is not, and still reports as an impure updater.
		expectStrongValid(
			`${IMPORTS}import { useReducer } from 'octane';
const format = new Intl.DateTimeFormat();
function stamp(log, t) { return [...log, new Date(t).toLocaleString(), format.format(t)]; }
export function App({ t }) {
  const [log, setLog] = useState([]);
  const [last, record] = useReducer((current, next) => new Date(next).toLocaleTimeString(), '');
  return <button onClick={() => { setLog((current) => stamp(current, t)); record(t); }}>{log.length}{last}</button>;
}`,
			'/src/App.tsx',
		);
		expectStrongError(
			`${IMPORTS}export function App() {
  const [ids, setIds] = useState([]);
  return <button onClick={() => setIds((current) => [...current, crypto.randomUUID()])}>{ids.length}</button>;
}`,
			'/src/App.tsx',
			'OCTANE_STRONG_IMPURE_UPDATER',
		);
	});

	it('checks .tsrx @for rows and plain custom-hook modules', () => {
		expectStrongError(
			`export function Posts({ posts }) @{
  <ul>
    @for (const post of posts; key post.id) {
      <li>{new Date(post.at).toLocaleDateString() as string}</li>
    }
  </ul>
}`,
			'/src/Posts.tsrx',
			RENDER_LOCALE_FORMAT,
		);
		expect(() =>
			slotHooks(
				'"use strong"; export function useLabel(t) { return new Date(t).toLocaleString(); }',
				'/src/useLabel.ts',
			),
		).toThrow(RENDER_LOCALE_FORMAT);
	});

	it('keeps explicit, opaque, deferred, deterministic, and shadowed formatting legal', () => {
		expectStrongValid(
			`${IMPORTS}const utc = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'medium' });
const count = new Intl.NumberFormat('en-US');
export function App({ t, n, date, locale, timeZone, options, args, rest }) {
  const [label] = useState(() => new Date(t).toLocaleString());
  const [clicked, setClicked] = useState('');
  useEffect(() => { console.log(new Date(t).toLocaleString()); });
  return (
    <button onClick={() => setClicked(new Date(t).toString())}>
      {new Date(t).toLocaleString('en-US', { timeZone: 'UTC' })}
      {new Date(t).toLocaleDateString(locale, { timeZone })}
      {new Date(t).toLocaleDateString('en-US', options)}
      {new Date(t).toLocaleString(...args)}{new Date(t).toLocaleString('en-US', ...rest)}
      {new Intl.DateTimeFormat(...args).format(t)}{Intl.NumberFormat(...args).format(n)}
      {new Date(t).toISOString()}{new Date(t).toUTCString()}{new Date(t).getTime()}
      {new Date(2024, 0, 1).toDateString()}
      {new Intl.DateTimeFormat(locale, { timeZone, month: 'long' }).format(t)}
      {utc.format(t)}{count.format(n)}{date.toLocaleString()}{n.toLocaleString()}
      {label}{clicked}
    </button>
  );
}
export function Shadowed({ Date, Intl, t }) {
  return <p>{new Date(t).toLocaleString()}{new Intl.NumberFormat().format(t)}</p>;
}`,
			'/src/App.tsx',
		);
	});

	it('keeps valid Strong output unchanged', () => {
		const source = `export function Stamp({ t }) {
  return <time>{new Date(t).toLocaleString('en-US', { timeZone: 'UTC' })}</time>;
}`;
		for (const mode of ['client', 'server'] as const) {
			const standard = compile(source, '/src/Stamp.tsx', { mode });
			const strong = compile(source, '/src/Stamp.tsx', { mode, strong: true } as any);
			expect(strong.code).toBe(standard.code);
		}
	});
});

describe('Strong scheduling during render', () => {
	const codes = (source: string, filename = '/src/App.tsx') =>
		errors(`"use strong";\n${source}`, filename).map((entry: { code: string }) => entry.code);

	it.each([
		['setTimeout', 'setTimeout(() => notify(), 100);'],
		['setInterval', 'setInterval(notify, 1000);'],
		['queueMicrotask', 'queueMicrotask(notify);'],
		['requestAnimationFrame', 'requestAnimationFrame(() => notify());'],
		['requestIdleCallback', 'requestIdleCallback(notify);'],
		['a kept timer id', 'const timer = setTimeout(notify, 0);'],
		['an optional call', 'setTimeout?.(notify, 0);'],
		['a conditional call', 'if (enabled) setTimeout(notify, 0);'],
		['a logical call', 'enabled && queueMicrotask(notify);'],
		['a module alias', 'later(notify, 0);'],
		['a local alias', 'const schedule = requestAnimationFrame; schedule(notify);'],
		['a synchronous helper', 'scheduleNotify(notify);'],
		['a local closure', 'const run = () => setTimeout(notify, 0); run();'],
		['a known array callback', 'items.forEach((item) => queueMicrotask(item));'],
	])('rejects %s', (_label, setup) => {
		const source = `const later = setTimeout;
function scheduleNotify(callback) { setTimeout(callback, 0); }
export function Tick({ notify, enabled, items }) {
  ${setup}
  return <div>Ready</div>;
}`;
		expectStrongError(source, '/src/App.tsx', RENDER_SIDE_EFFECT);
	});

	it('names the scheduler at its authored location', () => {
		const source = `export function Tick({ notify }) {
  requestAnimationFrame(notify);
  return <div />;
}`;
		const [diagnostic] = errors(`"use strong";\n${source}`, '/src/App.tsx');
		expect(diagnostic).toMatchObject({
			code: RENDER_SIDE_EFFECT,
			start: { line: 3, column: 2 },
			end: { line: 3, column: 23 },
		});
		expect(diagnostic.message).toContain('`requestAnimationFrame()` during render');
		expect(diagnostic.message).toContain('effect that cancels it in cleanup');
	});

	it('rejects eager factories for effects and event props', () => {
		const factories = `function makeSetup(notify) { setTimeout(notify, 0); return () => {}; }
function makeHandler(notify) { queueMicrotask(notify); return () => notify(); }`;
		expectStrongError(
			`${IMPORTS}${factories}
export function Effect({ notify }) {
  useEffect(makeSetup(notify), [notify]);
  return <div />;
}`,
			'/src/App.tsx',
			RENDER_SIDE_EFFECT,
		);
		expectStrongError(
			`${factories}
export function Button({ notify }) {
  return <button onClick={makeHandler(notify)}>Notify</button>;
}`,
			'/src/App.tsx',
			RENDER_SIDE_EFFECT,
		);
	});

	it('rejects scheduling in lazy initializers, which may still capture a clock', () => {
		expectStrongValid(
			`${IMPORTS}export function App() {
  const [startedAt] = useState(() => Date.now());
  return <time>{startedAt}</time>;
}`,
			'/src/App.tsx',
		);
		for (const initializer of [
			'useState(() => { setTimeout(() => {}, 0); return 0; })',
			'useState(initial)',
			'useReducer((value) => value, 0, (value) => { queueMicrotask(() => {}); return value; })',
		]) {
			expectStrongError(
				`${IMPORTS}import { useReducer } from 'octane';
function initial() { requestIdleCallback(() => {}); return 0; }
export function App() {
  const [value] = ${initializer};
  return <div>{value}</div>;
}`,
				'/src/App.tsx',
				RENDER_SIDE_EFFECT,
			);
		}
		// A lazy initializer may read browser globals, so only the scheduling reports.
		expect(
			codes(`${IMPORTS}export function App() {
  const [value] = useState(() => { window.setTimeout(() => {}, 0); return globalThis['queueMicrotask'](() => {}); });
  return <div>{value}</div>;
}`),
		).toEqual([RENDER_SIDE_EFFECT, RENDER_SIDE_EFFECT]);
	});

	it('reports a global-object scheduler alongside the browser read during render', () => {
		expect(
			codes(`export function App({ notify }) {
  window.setTimeout(notify, 0);
  return <div />;
}`),
		).toEqual([RENDER_AMBIENT_READ, RENDER_SIDE_EFFECT]);
	});

	it('leaves scheduling in updaters and reducers to the updater check', () => {
		expect(
			codes(`${IMPORTS}export function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount((current) => { setTimeout(() => {}, 0); return current + 1; })}>{count}</button>;
}`),
		).toEqual([IMPURE_UPDATER]);
	});

	it('checks .tsrx components and plain custom-hook modules', () => {
		expectStrongError(
			`export function Tick({ notify }) @{
  setTimeout(() => notify(), 100);
  <div>Ready</div>
}`,
			'/src/Tick.tsrx',
			RENDER_SIDE_EFFECT,
		);
		expect(() =>
			slotHooks(
				'"use strong"; export function useTick(notify) { setTimeout(notify, 0); }',
				'/src/useTick.ts',
			),
		).toThrow(RENDER_SIDE_EFFECT);
		expect(() =>
			slotHooks(
				'"use strong"; export function useTick(notify) { return () => setTimeout(notify, 0); }',
				'/src/useTick.ts',
			),
		).not.toThrow();
	});

	it('keeps events, effects, deferred bodies, unused helpers, and other names legal', () => {
		expectStrongValid(
			`${IMPORTS}import { useImperativeHandle } from 'octane';
setTimeout(() => {}, 0);
function scheduleLater() { setTimeout(() => {}, 0); }
function unused(notify) { queueMicrotask(notify); }
export function App({ notify, timers, ref, enabled }) {
  const box = useRef(null);
  const later = () => setTimeout(notify, 0);
  useEffect(() => {
    const timer = setTimeout(() => { setTimeout(notify, 0); }, 100);
    return () => clearTimeout(timer);
  });
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => box.current.classList.add('in'));
    return () => cancelAnimationFrame(frame);
  });
  useImperativeHandle(ref, () => ({ ping: () => queueMicrotask(notify) }));
  timers.setTimeout(notify, 0);
  if (false) setTimeout(notify, 0);
  let swap = setTimeout;
  swap = (callback) => callback();
  swap(() => {});
  return (
    <div ref={box}>
      <button onClick={() => setTimeout(notify, 0)}>Later</button>
      <button onClick={later}>Closure</button>
      <button onClick={scheduleLater}>Helper</button>
    </div>
  );
}
export function Shadowed({ setTimeout, requestAnimationFrame, notify }) {
  setTimeout(notify, 0);
  requestAnimationFrame(notify);
  return <div />;
}`,
			'/src/App.tsx',
		);
	});

	it('keeps valid Strong output unchanged', () => {
		const source = `import { useEffect } from 'octane';
export function Tick({ notify }) {
  useEffect(() => {
    const timer = setTimeout(() => notify(), 100);
    return () => clearTimeout(timer);
  }, [notify]);
  return <button onClick={() => queueMicrotask(notify)}>Ready</button>;
}`;
		for (const mode of ['client', 'server'] as const) {
			const standard = compile(source, '/src/Tick.tsx', { mode });
			const strong = compile(source, '/src/Tick.tsx', { mode, strong: true } as any);
			expect(strong.code).toBe(standard.code);
		}
	});
});
