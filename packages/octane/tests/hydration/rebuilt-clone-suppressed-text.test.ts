import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// suppressHydrationWarning keeps an adopted element's server text where the
// client's differs, one level deep, as in React. It never hides a structural
// mismatch: when the server rendered another tag where a template with
// suppressed text holes stands, the root still renders on the client (no server
// node survives), shows the client's text, and reports the mismatch once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-clone-suppressed-text.tsrx',
);
const FILE = 'rebuilt-clone-suppressed-text.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** 1-based line of the first fixture line containing `text`. */
function lineOf(text: string): number {
	const index = LINES.findIndex((line) => line.includes(text));
	if (index < 0) throw new Error(`fixture has no line containing ${text}`);
	return index + 1;
}

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	let out = '';
	for (let child = node.firstChild; child !== null; child = child.nextSibling) {
		if (child.nodeType === 3) out += child.nodeValue;
		if (child.nodeType !== 1) continue;
		const el = child as Element;
		out += `<${el.localName}>${markup(el)}</${el.localName}>`;
	}
	return out;
}

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — suppressHydrationWarning and text holes ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		root?.unmount();
		container.remove();
		errSpy.mockRestore();
	});

	const warnings = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	async function hydrate(name: string, clientProps: Record<string, unknown>): Promise<string[]> {
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return recoverable;
	}

	it.each([
		{
			site: 'an only-child text hole',
			name: 'Branch',
			leaf: 'function Leaf(',
			expected: '<i>ok</i>',
		},
		{
			site: 'a sibling text hole',
			name: 'SiblingBranch',
			leaf: 'function SiblingLeaf(',
			expected: '<i><u>x</u>ok</i>',
		},
		{
			site: 'a nested element',
			name: 'NestedBranch',
			leaf: 'function NestedLeaf(',
			expected: '<i><u>ok</u></i>',
		},
		{
			site: 'a renderable hole',
			name: 'HoleBranch',
			leaf: 'function HoleLeaf(',
			expected: '<i>ok</i>',
		},
	])(
		'renders the root on the client for a wrong tag where $site is suppressed',
		async ({ name, leaf, expected }) => {
			container.innerHTML = ServerRT.renderToString(server[name], { server: true }).html;
			const before = [...container.querySelectorAll('*')];
			const recoverable = await hydrate(name, {});

			expect(markup(container.firstElementChild!)).toBe(expected);
			expect(before.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(
				dev
					? [
							`Octane hydration mismatch at ${FILE}:${lineOf(leaf) + 1}:1: the client expected ` +
								'<i> but the server rendered <b>. The nearest Suspense or Hydrate boundary, or ' +
								'the root, will be regenerated on the client.',
						]
					: [],
			);
		},
	);

	it.each([
		{ site: 'an only-child text hole', name: 'Label', expected: '<i>server</i>' },
		{ site: 'a sibling text hole', name: 'SiblingLabel', expected: '<i><u>x</u>server</i>' },
	])('keeps the server text of $site in an adopted element', async ({ name, expected }) => {
		container.innerHTML = ServerRT.renderToString(server[name], { text: 'server' }).html;
		const adopted = container.querySelector('i')!;
		const recoverable = await hydrate(name, { text: 'client' });

		expect(container.querySelector('i')).toBe(adopted);
		expect(markup(container.firstElementChild!)).toBe(expected);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
