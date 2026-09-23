import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A `{x as string}` hole that shares its parent with siblings owns one `<!>`
// position in the client template, and later sibling claims are walked from
// it. The HTML parser creates no Text node for '', so the server must still
// serialize one node for an empty hole or every later claim lands one node
// off (the following component adopted nothing, and recovery used to delete
// the enclosing host and blank the root).

const SRC = `
function After() @{
	<button class="after">{'after'}</button>
}
export function Before({ a }: { a: string }) @{
	<p>{a as string}<After /></p>
}
export function Nested({ a }: { a: string }) @{
	<div><p>{a as string}<After /></p><i>{'sib'}</i></div>
}
export function Trailing({ a }: { a: string }) @{
	<p><After />{a as string}</p>
}
export function Between({ a }: { a: string }) @{
	<p><After />{a as string}<After /></p>
}
export function TwoHoles({ a, b }: { a: string; b: string }) @{
	<p>{a as string}{b as string}<After /></p>
}
export function StaticBefore({ a }: { a: string }) @{
	<p>{'x'}{a as string}<After /></p>
}
export function StaticAfter({ a }: { a: string }) @{
	<p>{a as string}{'x'}<After /></p>
}
export function StaticTrailing({ a, b }: { a: string; b: string }) @{
	<p>{'x'}{a as string}<span>{b as string}</span></p>
}
export function AfterIf({ a, on }: { a: string; on: boolean }) @{
	<p>@if (on) {<b>{'on'}</b>}{a as string}<After /></p>
}
export function DynamicElement({ a, b }: { a: string; b: string }) @{
	<p>{a as string}<span>{b as string}</span></p>
}
export function FragmentRoot({ a }: { a: string }) @{
	<>{a as string}<After /></>
}
export function Pre({ a }: { a: string }) @{
	<pre>{a as string}<After /></pre>
}
export function Sole({ a }: { a: string }) @{
	<p>{a as string}</p>
}
`;

const server = loadCompiledFixtureSource(SRC, {
	id: 'empty-text-hole.tsrx',
	mode: 'server',
	compileOptions: {},
});
const client = loadCompiledFixtureSource(SRC, {
	id: 'empty-text-hole.tsrx',
	mode: 'client',
	compileOptions: {},
});

type Props = Record<string, unknown>;

const containers: HTMLElement[] = [];
afterEach(() => {
	for (const c of containers.splice(0)) c.remove();
	vi.restoreAllMocks();
});

async function roundTrip(name: string, props: Props, next: Props) {
	const container = document.createElement('div');
	document.body.appendChild(container);
	containers.push(container);
	const serverHtml = ServerRT.renderToString(server[name], props).html;
	container.innerHTML = serverHtml;
	const serverText = container.textContent;
	const serverButtons = Array.from(container.querySelectorAll('button'));
	const serverElements = Array.from(container.querySelectorAll('*'));
	const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
	const recoverable: unknown[] = [];
	const root = hydrateRoot(container, client[name], props, {
		onRecoverableError: (error) => recoverable.push(error),
	});
	await act(() => {});
	const hydrated = {
		text: container.textContent,
		buttons: Array.from(container.querySelectorAll('button')),
		elements: Array.from(container.querySelectorAll('*')),
	};
	flushSync(() => root.render(client[name], next));
	const updated = container.textContent;
	root.unmount();
	return {
		serverHtml,
		serverText,
		serverButtons,
		serverElements,
		hydrated,
		updated,
		recoverable,
		errors: errors.mock.calls,
	};
}

function expectAdopted(result: Awaited<ReturnType<typeof roundTrip>>) {
	expect(result.recoverable).toEqual([]);
	expect(result.errors).toEqual([]);
	expect(result.hydrated.text).toBe(result.serverText);
	// Every server element, including each component's button, is adopted in place.
	expect(result.hydrated.elements).toEqual(result.serverElements);
	expect(result.hydrated.buttons).toEqual(result.serverButtons);
}

describe('hydrateRoot — empty sibling-position text holes', () => {
	const cases: [string, Props, Props, string][] = [
		['Before', { a: '' }, { a: 'later' }, 'laterafter'],
		['Nested', { a: '' }, { a: 'later' }, 'lateraftersib'],
		['Trailing', { a: '' }, { a: 'later' }, 'afterlater'],
		['Between', { a: '' }, { a: 'later' }, 'afterlaterafter'],
		['TwoHoles', { a: '', b: '' }, { a: 'l1', b: 'l2' }, 'l1l2after'],
		['TwoHoles', { a: 'v', b: '' }, { a: 'l1', b: 'l2' }, 'l1l2after'],
		['TwoHoles', { a: '', b: 'v' }, { a: 'l1', b: 'l2' }, 'l1l2after'],
		['StaticBefore', { a: '' }, { a: 'later' }, 'xlaterafter'],
		['StaticAfter', { a: '' }, { a: 'later' }, 'laterxafter'],
		['StaticTrailing', { a: '', b: '' }, { a: 'l1', b: 'l2' }, 'xl1l2'],
		['AfterIf', { a: '', on: false }, { a: 'later', on: true }, 'onlaterafter'],
		['AfterIf', { a: '', on: true }, { a: 'later', on: false }, 'laterafter'],
		['DynamicElement', { a: '', b: 'v' }, { a: 'l1', b: 'l2' }, 'l1l2'],
		['FragmentRoot', { a: '' }, { a: 'later' }, 'laterafter'],
		['Pre', { a: '' }, { a: 'later' }, 'laterafter'],
		['Sole', { a: '' }, { a: 'later' }, 'later'],
	];

	it.each(cases)('%s %j adopts the server DOM and updates', async (name, props, next, text) => {
		const result = await roundTrip(name, props, next);
		expectAdopted(result);
		expect(result.updated).toBe(text);
	});

	it.each(cases)('%s %j with non-empty values still adopts', async (name, props, next) => {
		const filled = Object.fromEntries(
			Object.entries(props).map(([k, v]) => [k, typeof v === 'string' ? `s-${k}` : v]),
		);
		const result = await roundTrip(name, filled, next);
		expectAdopted(result);
	});
});

describe('hydrateRoot — misaligned text hole recovery', () => {
	// Markup from a server without the empty-hole stand-in: the client walk runs
	// past the component range. Recovery may rebuild the component, but it must
	// never delete the enclosing host or anything outside it.
	it('keeps the host and its siblings when a component claim runs off the end', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		containers.push(container);
		container.innerHTML =
			'<div><p><!--[--><button class="after">after</button><!--]--></p><i>sib</i></div>';
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const recoverable: unknown[] = [];
		const root = hydrateRoot(
			container,
			client.Nested,
			{ a: '' },
			{
				onRecoverableError: (error) => recoverable.push(error),
			},
		);
		await act(() => {});
		expect(recoverable.length).toBeGreaterThan(0);
		expect(container.querySelectorAll('p')).toHaveLength(1);
		expect(container.querySelector('i')?.textContent).toBe('sib');
		expect(container.querySelector('p')!.textContent).toContain('after');
		flushSync(() => root.render(client.Nested, { a: 'later' }));
		expect(container.querySelector('p')!.textContent).toContain('later');
		expect(container.querySelector('i')?.textContent).toBe('sib');
		root.unmount();
	});
});
