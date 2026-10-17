import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, flushSync, hasPendingWork, hydrateRoot, type Root } from '../../src/index.js';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

// A hydration attempt that suspends is dropped, and its retry adopts the server
// DOM afresh. React never touches the DOM while it renders, so a dropped attempt
// leaves no trace: the page keeps the server's HTML exactly, with no mutation
// for a MutationObserver to report. What the attempt would have changed (a
// Text for an empty server text, a boundary the client renders instead of the
// server's arm) waits for the commit of the attempt that completes.

const SOURCE = `
import { Suspense, use } from 'octane';

function ServerThrows(props) @{
	if (props.server) throw new Error('server only');
	<b>{'client arm'}</b>
}

function Gate(props) @{
	if (props.gate) use(props.gate);
	<em>{'ready'}</em>
}

function Content(props) @{
	<>
		<p>{props.text as string}</p>
		<span>{props.empty as string}</span>
		<div>{props.a as string}{props.b as string}</div>
		<Suspense fallback={<i>{'pending'}</i>}>
			<ServerThrows server={props.server} />
		</Suspense>
		<Gate gate={props.gate} />
	</>
}

export function Root(props) @{
	<main>
		<Content {...props} />
	</main>
}

export function Arm(props) @{
	props.log?.push('Arm');
	<main>
		<h1>{'shell'}</h1>
		<section>
			@try {
				<Content {...props} />
			} @pending {
				<i>{'loading'}</i>
			}
		</section>
	</main>
}
`;

const server = loadCompiledFixtureSource<any>(SOURCE, {
	id: 'dropped-attempt.tsrx',
	mode: 'server',
});
const client = loadCompiledFixtureSource<any>(SOURCE, {
	id: 'dropped-attempt.tsrx',
	mode: 'client',
});

const PROPS = { text: 'x', empty: '', a: '', b: '' };

let container: HTMLElement;
let root: Root | undefined;
beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
});
afterEach(() => {
	root?.unmount();
	root = undefined;
	container.remove();
	vi.restoreAllMocks();
});

/** Every mutation under `target` until the returned stop. */
function observe(target: Node): () => MutationRecord[] {
	const records: MutationRecord[] = [];
	const observer = new MutationObserver((list) => records.push(...list));
	observer.observe(target, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
	});
	return () => {
		records.push(...observer.takeRecords());
		observer.disconnect();
		return records;
	};
}

describe('a dropped hydration attempt', () => {
	it.each(['Root', 'Arm'])('leaves the server DOM untouched in %s', async (name) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		container.innerHTML = (
			await prerender(server[name], { ...PROPS, server: true }, { onError: () => {} })
		).html;
		const html = container.innerHTML;
		// The attempt that suspends never reaches the arm's boundary or its texts.
		const scope = name === 'Arm' ? container.querySelector('section')! : container;
		const stop = observe(scope);
		let resolve!: () => void;
		const gate = new Promise<void>((done) => (resolve = done));
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ ...PROPS, server: false, gate },
			{ onRecoverableError: (error) => recoverable.push(error) },
		);
		flushSync(() => {});
		await act(async () => {});
		expect(stop()).toEqual([]);
		if (name === 'Root') expect(container.innerHTML).toBe(html);

		const shownBefore = container.querySelector('p');
		await act(async () => resolve());
		await vi.waitFor(() => expect(container.querySelector('em')?.textContent).toBe('ready'));
		expect(container.querySelector('p')).toBe(shownBefore);
		expect(container.querySelector('b')?.textContent).toBe('client arm');
		expect(container.querySelector('i')).toBeNull();
		expect(recoverable).toHaveLength(1);
	});

	// The retry its wakeable schedules renders only the boundary, over its server
	// arm, with the inputs it holds; the component around it does not run again.
	it('retries only the boundary when its wakeable settles', async () => {
		container.innerHTML = (await prerender(server.Arm, { ...PROPS, server: false })).html;
		const em = container.querySelector('em');
		const log: string[] = [];
		let resolve!: () => void;
		const gate = new Promise<void>((done) => (resolve = done));
		root = hydrateRoot(container, client.Arm, { ...PROPS, server: false, gate, log });
		await act(async () => {});
		expect(log).toEqual(['Arm']);

		await act(async () => resolve());
		await vi.waitFor(() => expect(hasPendingWork()).toBe(false));
		expect(container.querySelector('em')).toBe(em);
		expect(log).toEqual(['Arm']);
		// The adopted tree is live, and its parent renders on an update.
		await act(async () => root!.render(client.Arm, { ...PROPS, text: 'y', server: false, log }));
		expect(container.querySelector('p')!.textContent).toBe('y');
		expect(log).toEqual(['Arm', 'Arm']);
	});
});
