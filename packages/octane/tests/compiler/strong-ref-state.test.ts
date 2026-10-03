import { describe, expect, it } from 'vitest';
import { collectDiagnostics } from '../../src/compiler/compile.js';

// Octane calls a host element's callback ref while the element commits, before
// paint, so Strong checks its state updates like layout effect setup.
const REF = 'OCTANE_STRONG_REF_STATE_UPDATE';

type Diagnostic = {
	code: string;
	severity: string;
	message: string;
	suggestions?: { hook?: string }[];
};

function errors(source: string, filename = '/src/App.tsx') {
	const { diagnostics, error } = collectDiagnostics(`"use strong";\n${source}`, filename);
	expect(error, String(error)).toBe(null);
	return (diagnostics as Diagnostic[]).filter((diagnostic) => diagnostic.severity === 'error');
}

const codes = (source: string, filename?: string) =>
	errors(source, filename).map((diagnostic) => diagnostic.code);

// A component that renders `width` and `node`, so neither state is write-only.
const label = (setup: string, ref: string, tag = 'span') => `
import { startTransition, useRef, useState } from 'octane';
declare function load(): Promise<number>;
export function Label({ text, wide }: { text: string; wide: boolean }) {
	const el = useRef<HTMLElement | null>(null);
	const [width, setWidth] = useState(0);
	const [node, setNode] = useState<HTMLElement | null>(null);
	${setup}
	return <${tag} ref={${ref}}>{text + ' ' + width + ' ' + String(node)}</${tag}>;
}
`;

describe('Strong callback ref state updates', () => {
	it('rejects a measurement copied into state, naming useLayoutSnapshot', () => {
		const [diagnostic, ...rest] = errors(`import { useState } from 'octane';
export function Label({ text }: { text: string }) {
	const [width, setWidth] = useState(0);
	return <span ref={(el) => { if (el) setWidth(el.offsetWidth); }}>{text + ' ' + width}</span>;
}
`);
		expect(rest).toEqual([]);
		expect(diagnostic.code).toBe(REF);
		expect(diagnostic.message).toContain('callback ref');
		expect(diagnostic.message).toContain('useLayoutSnapshot(() => measure(), { initial })');
		expect(diagnostic.suggestions?.[0].hook).toBe('useLayoutSnapshot');
	});

	it.each([
		['getBoundingClientRect', 'el.getBoundingClientRect().width'],
		['getComputedStyle', 'Number.parseFloat(getComputedStyle(el).width)'],
		['clientWidth', 'el.clientWidth'],
	])('names useLayoutSnapshot for a %s measurement', (_, measure) => {
		const [diagnostic] = errors(label('', `(el) => { if (el) setWidth(${measure}); }`));
		expect(diagnostic.code).toBe(REF);
		expect(diagnostic.suggestions?.[0].hook).toBe('useLayoutSnapshot');
	});

	it('names useLayoutSnapshot when a helper the ref calls stores a measurement', () => {
		const [diagnostic] = errors(
			label(
				'const update = (el: HTMLElement) => setWidth(el.offsetWidth);',
				'(el) => { if (el) update(el); }',
			),
		);
		expect(diagnostic.code).toBe(REF);
		expect(diagnostic.suggestions?.[0].hook).toBe('useLayoutSnapshot');
	});

	it('keeps the element-in-state guidance for an update that is not a measurement', () => {
		const [diagnostic] = errors(label('', '(el) => setNode(el)'));
		expect(diagnostic.code).toBe(REF);
		expect(diagnostic.message).not.toContain('copies a DOM measurement');
		expect(diagnostic.message).toContain('ref object');
		expect(diagnostic.suggestions?.[0].hook).toBe('useRef');
	});

	// A setter passed directly runs no function of its own, so the component's
	// own reads say nothing about the value it stores.
	it.each([
		['a callback ref', '', '<span ref={setNode}>{String(node) + box.offsetWidth}</span>', REF],
		[
			'an effect',
			'useLayoutEffect(setNode);',
			'<span>{String(node) + box.offsetWidth}</span>',
			'OCTANE_STRONG_EFFECT_STATE_UPDATE',
		],
	])(
		'does not read the component as the measurement when a setter is passed as %s',
		(_, setup, output, code) => {
			const [diagnostic] = errors(`import { useLayoutEffect, useState } from 'octane';
export function Label({ box }: { box: { offsetWidth: number } }) {
	const [node, setNode] = useState<HTMLElement | null>(null);
	${setup}
	return ${output};
}
`);
			expect(diagnostic.code).toBe(code);
			expect(diagnostic.message).not.toContain('copies a DOM measurement');
		},
	);

	it.each([
		['an inline function expression', '', 'function (el) { setNode(el); }'],
		['a state setter', '', 'setNode'],
		['a local function', 'function attach(el: HTMLElement | null) { setNode(el); }', 'attach'],
		['a local arrow', 'const attach = (el: HTMLElement | null) => setNode(el);', 'attach'],
		[
			'a local helper the callback calls',
			'const update = (el: HTMLElement) => setWidth(el.offsetWidth);',
			'(el) => { if (el) update(el); }',
		],
		['a list entry', '', '[el, (node) => setNode(node)]'],
		[
			'a local function in a list',
			'const attach = (el: HTMLElement | null) => setNode(el);',
			'[el, attach]',
		],
		['a setter in a list', '', '[setNode, el]'],
		[
			'a conditional callback',
			'const attach = (el: HTMLElement | null) => setNode(el);',
			'wide ? attach : el',
		],
		[
			'a cast callback',
			'',
			'((el: HTMLElement | null) => setNode(el)) as (el: HTMLElement | null) => void',
		],
	])('rejects a synchronous update from %s', (_, setup, ref) => {
		expect(codes(label(setup, ref))).toEqual([REF]);
	});

	it.each(['svg', 'my-element'])('checks the callback ref of a <%s> host element', (tag) => {
		expect(codes(label('', '(el) => setNode(el)', tag))).toEqual([REF]);
	});

	it.each([
		['startTransition', '(el) => { startTransition(() => setNode(el)); }'],
		['queueMicrotask', '(el) => { queueMicrotask(() => setNode(el)); }'],
		['a zero-delay timer', '(el) => { setTimeout(() => setNode(el), 0); }'],
		['a settled promise', '(el) => { Promise.resolve().then(() => setNode(el)); }'],
		['an await that does not wait', 'async (el) => { await null; setNode(el); }'],
	])('rejects an update that %s runs before paint', (_, ref) => {
		expect(codes(label('', ref))).toEqual([REF]);
	});

	it('works in a .tsrx template', () => {
		const source = `import { useState } from 'octane';
export function Label({ text }: { text: string }) @{
	const [width, setWidth] = useState(0);
	<span ref={(el) => { if (el) setWidth(el.offsetWidth); }}>{text + ' ' + width as string}</span>
}
`;
		expect(codes(source, '/src/App.tsrx')).toEqual([REF]);
	});

	it.each([
		[
			'requestAnimationFrame',
			'(el) => { if (!el) return; const frame = requestAnimationFrame(() => setWidth(el.offsetWidth)); return () => cancelAnimationFrame(frame); }',
		],
		[
			'a timer with a positive delay',
			'(el) => { if (!el) return; const timer = setTimeout(() => setWidth(el.offsetWidth), 16); return () => clearTimeout(timer); }',
		],
		[
			'a ResizeObserver',
			'(el) => { if (!el) return; const observer = new ResizeObserver(() => setWidth(el.offsetWidth)); observer.observe(el); return () => observer.disconnect(); }',
		],
		[
			'an event listener',
			"(el) => { if (!el) return; const scroll = () => setWidth(el.scrollLeft); el.addEventListener('scroll', scroll); return () => el.removeEventListener('scroll', scroll); }",
		],
		['a pending request', '(el) => { if (el) load().then(setWidth); }'],
	])('keeps an update deferred to %s legal', (_, ref) => {
		expect(codes(label('', ref))).toEqual([]);
	});

	it.each([
		['a ref object', 'el'],
		['a callback that writes no state', '(node) => { node?.focus(); }'],
		['a list of ref objects', '[el, el]'],
	])('keeps %s legal', (_, ref) => {
		expect(codes(label('', ref))).toEqual([]);
	});

	it('leaves a component ref prop to the component that calls it', () => {
		const source = `import { useState } from 'octane';
import { Field } from './field';
export function Form() {
	const [node, setNode] = useState<HTMLElement | null>(null);
	return <Field ref={(el: HTMLElement | null) => setNode(el)} label={String(node)} />;
}
`;
		expect(codes(source)).toEqual([]);
	});

	it('still allows the same update from an event handler', () => {
		expect(
			codes(
				label('', 'el').replace(
					'ref={el}',
					'ref={el} onClick={(event) => setNode(event.currentTarget)}',
				),
			),
		).toEqual([]);
	});

	it('does not apply effect-only dependency checks to a callback ref', () => {
		// A callback ref has no dependency list, so reading the latest state through
		// a getter is not a hidden dependency.
		const source = `import { useState } from 'octane';
export function Label({ text }: { text: string }) {
	const [width, setWidth, getWidth] = useState(0);
	return <span ref={(el) => { if (el && getWidth() === 0) requestAnimationFrame(() => setWidth(el.offsetWidth)); }}>{text + ' ' + width}</span>;
}
`;
		expect(codes(source)).toEqual([]);
	});

	it('reports nothing outside Strong mode', () => {
		const source = label('', '(el) => setNode(el)');
		const { diagnostics, error } = collectDiagnostics(source, '/src/App.tsx');
		expect(error).toBe(null);
		expect(diagnostics.map((diagnostic: Diagnostic) => diagnostic.code)).not.toContain(REF);
	});
});
