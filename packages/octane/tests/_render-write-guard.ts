/**
 * Strict render-write check (#2043): a render writes no DOM the page shows. It
 * may build DOM it owns off-document; writes to connected nodes land at
 * commit. Every DOM mutator is wrapped here, and a test fails when one runs on
 * a connected node while a render is open (renderWritesForbidden, which reads
 * the runtime's own state, never the stack).
 *
 * The stack only names the writer, and exempts two kinds of caller:
 * - code outside packages/octane/src (a test's or a binding's own write);
 * - the resource hint writers ('hint' in scripts/render-writers.mjs), which
 *   insert at call time as React's do.
 * Known writers awaiting their fix are listed, by test file and writer, in
 * _render-write-allowlist.ts. See .rulesync/rules/testing.md.
 */
import { afterEach, expect } from 'vitest';
import { renderWritesForbidden } from '../src/runtime.js';
import { WRITERS } from '../../../scripts/render-writers.mjs';
import { RENDER_WRITE_ALLOWLIST } from './_render-write-allowlist.js';

const HINT_WRITERS = new Set(
	[...WRITERS].filter(([, kind]) => kind === 'hint').map(([name]) => name as string),
);
const SOURCE = '/packages/octane/src/';
const GUARD = '_render-write-guard';
const TESTS = '/packages/octane/tests/';
/** The DOM implementation's own frames, such as jsdom's Proxy around a `<select>`. */
const DOM_INTERNALS = /\/node_modules\/|^node:|^<anonymous>$/;

let violations: string[] = [];
let checking = false;
/** RENDER_WRITE_REPORT=<file> appends each violation as JSON, to rebuild the allowlist. */
const REPORT = (globalThis as any).process?.env?.RENDER_WRITE_REPORT as string | undefined;
const fs = REPORT ? await import('node:fs') : null;

interface Frame {
	fn: string;
	file: string;
}

function frames(): Frame[] {
	const limit = Error.stackTraceLimit;
	Error.stackTraceLimit = 40;
	const stack = new Error().stack ?? '';
	Error.stackTraceLimit = limit;
	const out: Frame[] = [];
	for (const line of stack.split('\n').slice(1)) {
		const match = /^\s*at (?:(.*?) \()?(.*?)(?::\d+){0,2}\)?$/.exec(line);
		if (match === null) continue;
		const file = match[2];
		if (file.includes(GUARD) || DOM_INTERNALS.test(file)) continue;
		// `BlockImpl.hostElementBody [as body]` names `hostElementBody`.
		const fn = (match[1] ?? '').replace(/ \[as [^\]]+\]$/, '').replace(/^.*\./, '');
		out.push({ fn, file });
	}
	return out;
}

function connected(node: unknown): boolean {
	return node != null && typeof node === 'object' && (node as Node).isConnected === true;
}

function testFile(): string {
	const path = expect.getState().testPath ?? '';
	const at = path.indexOf(TESTS);
	return at < 0 ? path : path.slice(at + TESTS.length);
}

function check(op: string, target: unknown, extra?: unknown): void {
	if (checking || !renderWritesForbidden()) return;
	if (!connected(target) && !connected(extra)) return;
	checking = true;
	try {
		const stack = frames();
		const first = stack[0];
		if (first === undefined || !first.file.includes(SOURCE)) return;
		if (stack.some((frame) => HINT_WRITERS.has(frame.fn))) return;
		const file = testFile();
		const writer = first.fn || '(anonymous)';
		if (RENDER_WRITE_ALLOWLIST.some((entry) => entry.file === file && entry.writer === writer))
			return;
		const path = stack
			.filter((frame) => frame.file.includes(SOURCE))
			.slice(0, 6)
			.map((frame) => frame.fn || '(anonymous)')
			.join(' < ');
		violations.push(`${op} during render by ${writer}: ${path}`);
		fs?.appendFileSync(REPORT!, JSON.stringify({ file, writer, op, path }) + '\n');
	} finally {
		checking = false;
	}
}

function wrap(proto: any, name: string, argNode = -1): void {
	const original = proto?.[name];
	if (typeof original !== 'function') return;
	proto[name] = function (this: unknown, ...args: unknown[]) {
		check(name, this, argNode >= 0 ? args[argNode] : undefined);
		return original.apply(this, args);
	};
}

function wrapSetter(proto: any, name: string, owner?: (self: any) => unknown): void {
	const descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
	if (descriptor?.set === undefined) return;
	Object.defineProperty(proto, name, {
		...descriptor,
		set(this: unknown, value: unknown) {
			check('set ' + name, owner ? owner(this) : this);
			descriptor.set!.call(this, value);
		},
	});
}

if (typeof Node !== 'undefined') {
	const G = globalThis as any;
	wrap(Node.prototype, 'insertBefore', 0);
	wrap(Node.prototype, 'appendChild', 0);
	wrap(Node.prototype, 'removeChild', 0);
	wrap(Node.prototype, 'replaceChild', 1);
	wrap(Node.prototype, 'normalize');
	for (const C of [G.Element, G.CharacterData, G.DocumentType])
		for (const name of ['remove', 'before', 'after', 'replaceWith']) wrap(C?.prototype, name);
	for (const C of [G.Element, G.Document, G.DocumentFragment])
		for (const name of ['append', 'prepend', 'replaceChildren', 'moveBefore'])
			wrap(C?.prototype, name);
	for (const name of [
		'setAttribute',
		'setAttributeNS',
		'removeAttribute',
		'removeAttributeNS',
		'toggleAttribute',
		'setAttributeNode',
		'removeAttributeNode',
		'insertAdjacentElement',
		'insertAdjacentHTML',
		'insertAdjacentText',
	])
		wrap(Element.prototype, name);
	for (const name of ['appendData', 'insertData', 'deleteData', 'replaceData'])
		wrap(CharacterData.prototype, name);
	wrap(G.Text?.prototype, 'splitText');
	wrapSetter(Node.prototype, 'nodeValue');
	wrapSetter(Node.prototype, 'textContent');
	wrapSetter(CharacterData.prototype, 'data');
	for (const name of ['innerHTML', 'outerHTML', 'className', 'id'])
		wrapSetter(Element.prototype, name);
	for (const C of [
		'HTMLInputElement',
		'HTMLTextAreaElement',
		'HTMLSelectElement',
		'HTMLOptionElement',
	]) {
		const proto = G[C]?.prototype;
		for (const name of [
			'value',
			'checked',
			'defaultValue',
			'defaultChecked',
			'selected',
			'defaultSelected',
			'multiple',
			'selectedIndex',
			'indeterminate',
			'text',
		])
			wrapSetter(proto, name);
		for (const name of ['setSelectionRange', 'select', 'setRangeText']) wrap(proto, name);
	}
	// Style and class lists change their element: remember which one each is.
	const owners = new WeakMap<object, Element>();
	const remember = (proto: any, name: string) => {
		const descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
		if (descriptor?.get === undefined) return;
		Object.defineProperty(proto, name, {
			...descriptor,
			get(this: Element) {
				const value = descriptor.get!.call(this);
				if (value !== null && typeof value === 'object') owners.set(value, this);
				return value;
			},
		});
	};
	remember(Element.prototype, 'classList');
	remember(G.HTMLElement?.prototype, 'style');
	remember(G.SVGElement?.prototype, 'style');
	remember(G.HTMLElement?.prototype, 'dataset');
	const owner = (self: object) => owners.get(self);
	const tokens = G.DOMTokenList?.prototype;
	if (tokens !== undefined) {
		for (const name of ['add', 'remove', 'toggle', 'replace']) {
			const original = tokens[name];
			tokens[name] = function (this: object, ...args: unknown[]) {
				check('classList.' + name, owner(this));
				return original.apply(this, args);
			};
		}
		wrapSetter(tokens, 'value', owner);
	}
	const style = G.CSSStyleDeclaration?.prototype;
	if (style !== undefined) {
		for (const name of ['setProperty', 'removeProperty']) {
			const original = style[name];
			style[name] = function (this: object, ...args: unknown[]) {
				check('style.' + name, owner(this));
				return original.apply(this, args);
			};
		}
		for (const key of Object.getOwnPropertyNames(style)) {
			const descriptor = Object.getOwnPropertyDescriptor(style, key);
			if (descriptor?.set !== undefined) wrapSetter(style, key, owner);
		}
	}

	afterEach(() => {
		if (violations.length === 0) return;
		const found = violations;
		violations = [];
		throw new Error(
			`A render wrote committed DOM (#2043):\n  ${[...new Set(found)].join('\n  ')}\n` +
				'Stage the write at commit, or build the node off-document.',
		);
	});
}
