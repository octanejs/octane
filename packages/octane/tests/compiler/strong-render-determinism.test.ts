import { describe, expect, it } from 'vitest';
import { compile } from '../../src/compiler/compile.js';
import { slotHooks } from '../../src/compiler/slot-hooks.js';
import { compileToVolarMappings } from '../../src/compiler/volar.js';

const RENDER_IMPURE_CALL = 'OCTANE_STRONG_RENDER_IMPURE_CALL';
const RENDER_LOCALE_FORMAT = 'OCTANE_STRONG_RENDER_LOCALE_FORMAT';
const RENDER_STATE_UPDATE = 'OCTANE_STRONG_RENDER_STATE_UPDATE';
const RENDER_REF_READ = 'OCTANE_STRONG_RENDER_REF_READ';

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
export function App({ t, n, date, locale, timeZone, options }) {
  const [label] = useState(() => new Date(t).toLocaleString());
  const [clicked, setClicked] = useState('');
  useEffect(() => { console.log(new Date(t).toLocaleString()); });
  return (
    <button onClick={() => setClicked(new Date(t).toString())}>
      {new Date(t).toLocaleString('en-US', { timeZone: 'UTC' })}
      {new Date(t).toLocaleDateString(locale, { timeZone })}
      {new Date(t).toLocaleDateString('en-US', options)}
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
