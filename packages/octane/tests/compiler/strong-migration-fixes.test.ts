import { describe, expect, it } from 'vitest';
import { collectDiagnostics, compile } from '../../src/compiler/compile.js';

type Edit = { start: number; end: number; text: string };
type Suggestion = { message?: string; hook?: string; edits?: Edit[] };
type Diagnostic = {
	code: string;
	severity: string;
	message: string;
	start: { line: number; column: number; offset: number };
	suggestions?: Suggestion[];
};

function strong(source: string, filename = '/src/App.tsx') {
	const { diagnostics, error } = collectDiagnostics(`"use strong";\n${source}`, filename);
	expect(error, String(error)).toBe(null);
	return diagnostics as Diagnostic[];
}

function errors(source: string, filename?: string) {
	return strong(source, filename).filter((diagnostic) => diagnostic.severity === 'error');
}

// Apply every suggested edit once, the way `octane analyze --fix` does for a
// single suggestion, and return the rewritten module including its directive.
function applyEdits(source: string, edits: readonly Edit[]) {
	let text = `"use strong";\n${source}`;
	for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
		text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
	}
	return text;
}

function editsOf(diagnostic: Diagnostic | undefined) {
	return diagnostic?.suggestions?.find((suggestion) => suggestion.edits)?.edits;
}

const STORE = `import { useRef } from 'octane';
class Store { add() {} }
`;

describe("Strong migration guidance for React's lazy ref idiom", () => {
	it.each([
		['=== null', 'if (store.current === null) store.current = new Store();'],
		['== null', 'if (store.current == null) store.current = new Store();'],
		['=== undefined', 'if (store.current === undefined) store.current = new Store();'],
		['reversed', 'if (null === store.current) store.current = new Store();'],
		['negation', 'if (!store.current) store.current = new Store();'],
		['block', 'if (store.current === null) {\n\t\tstore.current = new Store();\n\t}'],
		['??=', 'store.current ??= new Store();'],
		['||=', 'store.current ||= new Store();'],
	])('names useLazyRef and rewrites the %s form', (_, init) => {
		const source = `${STORE}export function Cart() {
	const store = useRef<Store | null>(null);
	${init}
	return <button onClick={() => store.current?.add()}>Add</button>;
}
`;
		const found = errors(source);
		expect(found.length).toBeGreaterThan(0);
		for (const diagnostic of found) {
			expect(['OCTANE_STRONG_RENDER_REF_READ', 'OCTANE_STRONG_RENDER_REF_WRITE']).toContain(
				diagnostic.code,
			);
			expect(diagnostic.message).toContain('useLazyRef');
		}
		// Only the first report of an idiom carries the rewrite, so applying
		// every suggestion in a file rewrites it once.
		expect(found.filter((diagnostic) => editsOf(diagnostic)).length).toBe(1);

		const fixed = applyEdits(source, editsOf(found[0])!);
		expect(fixed).toContain("import { useRef, useLazyRef } from 'octane';");
		expect(fixed).toContain('const store = useLazyRef(() => new Store());');
		expect(fixed).not.toContain('store.current = new Store()');
		expect(fixed).not.toContain('??=');
		expect(() => compile(fixed, '/src/App.tsx')).not.toThrow();
	});

	it('parenthesizes an object literal factory body', () => {
		const source = `import { useRef } from 'octane';
export function Counter() {
	const state = useRef(null);
	state.current ??= { count: 0 };
	return <div />;
}
`;
		const [diagnostic] = errors(source);
		expect(diagnostic.suggestions?.[0].message).toContain('useLazyRef(() => ({ count: 0 }))');
		expect(applyEdits(source, editsOf(diagnostic)!)).toContain(
			'const state = useLazyRef(() => ({ count: 0 }));',
		);
	});

	it.each([
		[
			'a statement between the declaration and the initialization',
			'const store = useRef<Store | null>(null);\n\tconst label = "cart";\n\tif (store.current === null) store.current = new Store();',
		],
		[
			'a comment the rewrite would delete',
			'const store = useRef<Store | null>(null);\n\t// create once\n\tif (store.current === null) store.current = new Store();',
		],
		[
			'a let declaration',
			'let store = useRef<Store | null>(null);\n\tif (store.current === null) store.current = new Store();',
		],
		[
			'a non-empty initial value',
			'const store = useRef<Store | null>(new Store());\n\tif (store.current === null) store.current = new Store();',
		],
	])('names useLazyRef without an edit when there is %s', (_, body) => {
		const source = `${STORE}export function Cart() {
	${body}
	return <div />;
}
`;
		const found = errors(source).filter((diagnostic) => diagnostic.code.includes('REF'));
		expect(found.length).toBeGreaterThan(0);
		for (const diagnostic of found) {
			expect(diagnostic.message).toContain('useLazyRef');
			expect(editsOf(diagnostic)).toBeUndefined();
		}
	});

	it('keeps the generic ref guidance, naming both new hooks, for other render reads', () => {
		const source = `import { useRef } from 'octane';
export function Width() {
	const el = useRef<HTMLDivElement>(null);
	return <div ref={el}>{String(el.current?.offsetWidth)}</div>;
}
`;
		const [diagnostic] = errors(source);
		expect(diagnostic.code).toBe('OCTANE_STRONG_RENDER_REF_READ');
		expect(diagnostic.message).toContain('useLayoutSnapshot');
		expect(diagnostic.message).not.toContain('initializing');
	});

	it('works in a .tsrx component body', () => {
		const source = `${STORE}export function Cart() @{
	const store = useRef<Store | null>(null);
	if (store.current === null) store.current = new Store();
	<button onClick={() => store.current?.add()}>{'Add'}</button>
}
`;
		const [diagnostic] = errors(source, '/src/App.tsrx');
		const fixed = applyEdits(source, editsOf(diagnostic)!);
		expect(fixed).toContain('const store = useLazyRef(() => new Store());');
		expect(() => compile(fixed, '/src/App.tsrx')).not.toThrow();
	});
});

describe('Strong migration guidance for measurements copied into state', () => {
	it.each([
		['offsetWidth', 'el.current?.offsetWidth ?? 0'],
		['getBoundingClientRect', 'el.current?.getBoundingClientRect().width ?? 0'],
	])('names useLayoutSnapshot when an effect stores %s', (_, measure) => {
		for (const hook of ['useLayoutEffect', 'useEffect']) {
			const source = `import { ${hook}, useRef, useState } from 'octane';
export function Label() {
	const el = useRef<HTMLSpanElement>(null);
	const [width, setWidth] = useState(0);
	${hook}(() => {
		setWidth(${measure});
	});
	return <span ref={el}>{String(width)}</span>;
}
`;
			const [diagnostic] = errors(source);
			expect(diagnostic.code).toBe('OCTANE_STRONG_EFFECT_STATE_UPDATE');
			expect(diagnostic.message).toContain('useLayoutSnapshot');
			expect(diagnostic.suggestions?.[0].hook).toBe('useLayoutSnapshot');
		}
	});

	it.each([
		['queueMicrotask', 'queueMicrotask(() => setWidth(el.current?.offsetWidth ?? 0));'],
		[
			'a zero-delay timer',
			'setTimeout(() => {\n\t\t\tconst rect = el.current?.getBoundingClientRect();\n\t\t\tsetWidth(rect?.width ?? 0);\n\t\t});',
		],
		['startTransition', 'startTransition(() => setWidth(el.current?.offsetWidth ?? 0));'],
	])('names useLayoutSnapshot when a measurement is stored from %s', (_, body) => {
		const source = `import { startTransition, useLayoutEffect, useRef, useState } from 'octane';
export function Label() {
	const el = useRef<HTMLSpanElement>(null);
	const [width, setWidth] = useState(0);
	useLayoutEffect(() => {
		${body}
	});
	return <span ref={el}>{String(width)}</span>;
}
`;
		const diagnostic = errors(source).find(
			(entry) => entry.code === 'OCTANE_STRONG_EFFECT_STATE_UPDATE',
		);
		expect(diagnostic?.message).toContain('useLayoutSnapshot');
		expect(diagnostic?.suggestions?.[0].hook).toBe('useLayoutSnapshot');
	});

	it.each([
		[
			'the returned cleanup',
			'setValue(name);\n\t\treturn () => console.log(el.current?.offsetWidth);',
		],
		[
			'a frame callback',
			'setValue(name);\n\t\tconst id = requestAnimationFrame(() => el.current?.getBoundingClientRect());\n\t\treturn () => cancelAnimationFrame(id);',
		],
		['a layout write', 'if (el.current) el.current.scrollTop = 0;\n\t\tsetValue(name);'],
	])('does not call it a measurement when layout is only touched in %s', (_, body) => {
		const source = `import { useEffect, useRef, useState } from 'octane';
export function Name({ name }: { name: string }) {
	const el = useRef<HTMLDivElement>(null);
	const [value, setValue] = useState('');
	useEffect(() => {
		${body}
	});
	return <div ref={el}>{value}</div>;
}
`;
		const diagnostic = errors(source).find(
			(entry) => entry.code === 'OCTANE_STRONG_EFFECT_STATE_UPDATE',
		);
		expect(diagnostic?.message).not.toContain('copies a DOM measurement');
		expect(diagnostic?.suggestions?.[0].hook).toBe('useLinkedState');
	});

	it('keeps the useLinkedState guidance for a state update that is not a measurement', () => {
		const source = `import { useEffect, useState } from 'octane';
export function Name({ name }: { name: string }) {
	const [value, setValue] = useState('');
	useEffect(() => {
		setValue(name);
	});
	return <span>{value}</span>;
}
`;
		const [diagnostic] = errors(source);
		expect(diagnostic.code).toBe('OCTANE_STRONG_EFFECT_STATE_UPDATE');
		expect(diagnostic.message).not.toContain('copies a DOM measurement');
		expect(diagnostic.suggestions?.[0].hook).toBe('useLinkedState');
	});
});

describe('Strong migration rewrites for useMemo and useCallback', () => {
	it.each([
		['an expression body', 'useMemo(() => items.length, [items])', 'items.length'],
		['a single return', 'useMemo(() => { return items.length; }, [items])', 'items.length'],
		[
			'an object literal',
			'useMemo(() => ({ size: items.length }), [items])',
			'({ size: items.length })',
		],
		['a lower-precedence body', 'useMemo(() => !items.length, [items])', '(!items.length)'],
		['a callback', 'useCallback((id: string) => pick(id), [pick])', '(id: string) => pick(id)'],
		['a callback reference', 'useCallback(pick, [pick])', 'pick'],
	])('rewrites %s', (_, call, replacement) => {
		const hook = call.slice(0, call.indexOf('('));
		const source = `import { ${hook} } from 'octane';
export function List({ items, pick }: { items: string[]; pick: (id: string) => void }) {
	const value = ${call};
	return <div onClick={() => pick(String(value))} />;
}
`;
		const [diagnostic] = errors(source);
		expect(diagnostic.code).toBe('OCTANE_STRONG_MANUAL_MEMO');
		const fixed = applyEdits(source, editsOf(diagnostic)!);
		expect(fixed).toContain(`const value = ${replacement};`);
		expect(() => compile(fixed, '/src/App.tsx')).not.toThrow();
	});

	it.each([
		['several statements', 'useMemo(() => { const n = items.length; return n; }, [items])'],
		['a parameter', 'useMemo((n?: number) => n ?? items.length, [items])'],
		['a spread argument', 'useMemo(...[() => items.length, [items]] as const)'],
	])('describes the replacement without an edit for %s', (_, call) => {
		const source = `import { useMemo } from 'octane';
export function List({ items }: { items: string[] }) {
	const value = ${call};
	return <div>{String(value)}</div>;
}
`;
		const memo = errors(source).find(
			(diagnostic) => diagnostic.code === 'OCTANE_STRONG_MANUAL_MEMO',
		);
		expect(memo?.suggestions?.[0].message).toBeTruthy();
		expect(editsOf(memo)).toBeUndefined();
	});
});

describe('collectDiagnostics', () => {
	const CLOCK = `export function Clock() {
	const now = Date.now();
	const seed = Math.random();
	return <span>{String(now) + String(seed)}</span>;
}
`;

	it('reports every Strong violation where compile() throws only the first', () => {
		expect(errors(CLOCK).map((diagnostic) => [diagnostic.code, diagnostic.start.line])).toEqual([
			['OCTANE_STRONG_RENDER_IMPURE_CALL', 3],
			['OCTANE_STRONG_RENDER_IMPURE_CALL', 4],
		]);
		expect(() => compile(`"use strong";\n${CLOCK}`, '/src/App.tsx')).toThrow(
			/:3:\d+: \[OCTANE_STRONG_RENDER_IMPURE_CALL\]/,
		);
	});

	it('applies the strong option to a module without the directive', () => {
		const { diagnostics } = collectDiagnostics(CLOCK, '/src/App.tsx', { strong: true });
		expect(diagnostics.map((diagnostic: Diagnostic) => diagnostic.code)).toEqual([
			'OCTANE_STRONG_RENDER_IMPURE_CALL',
			'OCTANE_STRONG_RENDER_IMPURE_CALL',
		]);
		expect(collectDiagnostics(CLOCK, '/src/App.tsx').diagnostics).toEqual([]);
	});

	it('keeps compatibility-mode warnings and returns compile failures as the error', () => {
		const warned = collectDiagnostics(
			'export function Bad() @{\n\t<input type="text" value={\'a\' as string} onChange={() => {}} />\n}\n',
			'/src/Bad.tsrx',
		);
		expect(warned.error).toBe(null);
		expect(warned.diagnostics.map((diagnostic: Diagnostic) => diagnostic.code)).toEqual([
			'OCTANE_NATIVE_TEXT_ONCHANGE',
		]);

		const broken = collectDiagnostics(
			'"use strong";\nexport function Broken() @{ <div> }\n',
			'/src/B.tsrx',
		);
		expect(broken.diagnostics).toEqual([]);
		expect(broken.error).toBeInstanceOf(Error);
	});

	it('links a thrown Strong error to its documentation', () => {
		expect(() => compile(`"use strong";\n${CLOCK}`, '/src/App.tsx')).toThrow(
			'See https://octanejs.dev/docs/strong-mode#octane-strong-render-impure-call',
		);
	});
});
