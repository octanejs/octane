import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ServerRT from 'octane/server';
import { createRoot, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { loadCompiledFixtureSource } from '../_server-fixture.js';

const ID = 'subtemplate-own-locals.tsrx';
const SOURCE = readFileSync(
	join(process.cwd(), 'packages/octane/tests/hydration/_fixtures', ID),
	'utf8',
);

const server = loadCompiledFixtureSource(SOURCE, { id: ID, mode: 'server' });

// Each rendered child's tag and text, ignoring hydration markers.
const shape = (host: Element | null) =>
	Array.from(host?.children ?? [], (child) => `${child.localName}:${child.textContent}`);

let container: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});

afterEach(() => {
	root?.unmount();
	root = null;
	expect(container.childNodes.length).toBe(0);
	container.remove();
});

// Dev and production client compiles place helpers and lift handlers
// differently, so both have to thread the sub-template's names.
for (const dev of [true, false]) {
	const client = loadCompiledFixtureSource(SOURCE, {
		id: ID,
		mode: 'client',
		compileOptions: { dev, hmr: false },
	});

	const mount = (name: string, props: Record<string, unknown>) => {
		root = createRoot(container);
		root.render(client[name], props);
	};

	const update = (name: string, props: Record<string, unknown>) =>
		flushSync(() => root!.render(client[name], props));

	// Render the server HTML into the container, then hydrate it with the client
	// build of the same component.
	const serve = (name: string, props: Record<string, unknown>) => {
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
	};

	const hydrate = (name: string, props: Record<string, unknown>) => {
		const errors: unknown[] = [];
		root = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error: unknown) => errors.push(error),
		});
		flushSync(() => {});
		return errors;
	};

	describe(`sub-template locals in hoisted arms (dev=${dev})`, () => {
		it('reads a sub-template const in @if/@else arms at value position', () => {
			const arm = () => shape(container.querySelector('.value-arm'));
			mount('ValueArm', { value: ' first ' });
			expect(arm()).toEqual(['b:first']);
			const bold = container.querySelector('.value-arm b');

			update('ValueArm', { value: 'second' });
			expect(arm()).toEqual(['b:second']);
			expect(container.querySelector('.value-arm b')).toBe(bold);

			update('ValueArm', { value: '   ' });
			expect(arm()).toEqual(['i:empty']);

			update('ValueArm', { value: 'third' });
			expect(arm()).toEqual(['b:third']);
		});

		it('reads a sub-template const in keyed @for rows', () => {
			const rows = () => shape(container.querySelector('.output-rows ul'));
			mount('OutputRows', { items: ['a', 'b'], loud: false });
			expect(rows()).toEqual(['li:a.', 'li:b.']);
			const survivor = container.querySelectorAll('.output-rows li')[1];

			update('OutputRows', { items: ['b', 'c'], loud: true });
			expect(rows()).toEqual(['li:b!', 'li:c!']);
			expect(container.querySelector('.output-rows li')).toBe(survivor);
		});

		it('reads a sub-template const in a lifted event handler', () => {
			const log: string[] = [];
			mount('OutputHandler', { loud: false, log });
			const button = container.querySelector('.output-handler button') as HTMLButtonElement;
			expect(button.textContent).toBe('log.');
			button.click();
			expect(log.splice(0)).toEqual(['.', 'click']);

			update('OutputHandler', { loud: true, log });
			expect(container.querySelector('.output-handler button')).toBe(button);
			expect(button.textContent).toBe('log!');
			button.click();
			expect(log.splice(0)).toEqual(['!', 'click']);
		});

		it('reads a const derived from a sub-template param in @switch and @try arms', () => {
			const arms = () => shape(container.querySelector('.switch-try'));
			mount('ParamSwitchTry', { mode: 'a' });
			expect(arms()).toEqual(['b:A', 'u:A']);

			update('ParamSwitchTry', { mode: 'b' });
			expect(arms()).toEqual(['i:B', 'u:B']);

			update('ParamSwitchTry', { mode: 'c' });
			expect(arms()).toEqual(['i:C', 'u:C']);

			update('ParamSwitchTry', { mode: 'a' });
			expect(arms()).toEqual(['b:A', 'u:A']);
		});

		it('reads component and portal-body locals in a lifted portal handler', () => {
			const log: string[] = [];
			const target = document.createElement('aside');
			document.body.appendChild(target);
			try {
				mount('PortalHandler', { value: 'first', log, target });
				const button = target.querySelector('.portal-handler-action') as HTMLButtonElement;
				expect(button.textContent).toBe('first#');
				button.click();
				expect(log.splice(0)).toEqual(['first#', 'click']);

				update('PortalHandler', { value: 'second', log, target });
				expect(target.querySelector('.portal-handler-action')).toBe(button);
				expect(button.textContent).toBe('second#');
				button.click();
				expect(log.splice(0)).toEqual(['second#', 'click']);

				root!.unmount();
				root = null;
				expect(target.childNodes.length).toBe(0);
			} finally {
				target.remove();
			}
		});

		it('hydrates an @if arm reading a sub-template const at value position', () => {
			const arm = () => shape(container.querySelector('.value-arm'));
			serve('ValueArm', { value: ' first ' });
			expect(arm()).toEqual(['b:first']);
			const bold = container.querySelector('.value-arm b');

			expect(hydrate('ValueArm', { value: ' first ' })).toEqual([]);
			expect(container.querySelector('.value-arm b')).toBe(bold);

			update('ValueArm', { value: 'second' });
			expect(arm()).toEqual(['b:second']);
			expect(container.querySelector('.value-arm b')).toBe(bold);

			update('ValueArm', { value: '' });
			expect(arm()).toEqual(['i:empty']);
		});

		it('hydrates keyed @for rows reading a sub-template const', () => {
			const rows = () => shape(container.querySelector('.output-rows ul'));
			serve('OutputRows', { items: ['a', 'b'], loud: false });
			expect(rows()).toEqual(['li:a.', 'li:b.']);
			const [first, survivor] = Array.from(container.querySelectorAll('.output-rows li'));

			expect(hydrate('OutputRows', { items: ['a', 'b'], loud: false })).toEqual([]);
			expect(container.querySelector('.output-rows li')).toBe(first);

			update('OutputRows', { items: ['b', 'c'], loud: true });
			expect(rows()).toEqual(['li:b!', 'li:c!']);
			expect(container.querySelector('.output-rows li')).toBe(survivor);
		});

		it('hydrates a lifted event handler reading a sub-template const', () => {
			const log: string[] = [];
			serve('OutputHandler', { loud: false, log });
			const button = container.querySelector('.output-handler button') as HTMLButtonElement;
			expect(button.textContent).toBe('log.');

			expect(hydrate('OutputHandler', { loud: false, log })).toEqual([]);
			expect(container.querySelector('.output-handler button')).toBe(button);
			button.click();
			expect(log.splice(0)).toEqual(['.', 'click']);

			update('OutputHandler', { loud: true, log });
			expect(button.textContent).toBe('log!');
			button.click();
			expect(log.splice(0)).toEqual(['!', 'click']);
		});

		it('hydrates @switch and @try arms reading a sub-template const', () => {
			const arms = () => shape(container.querySelector('.switch-try'));
			serve('ParamSwitchTry', { mode: 'a' });
			expect(arms()).toEqual(['b:A', 'u:A']);
			const [bold, underline] = Array.from(container.querySelector('.switch-try')!.children);

			expect(hydrate('ParamSwitchTry', { mode: 'a' })).toEqual([]);
			expect(container.querySelector('.switch-try b')).toBe(bold);
			expect(container.querySelector('.switch-try u')).toBe(underline);
			expect(arms()).toEqual(['b:A', 'u:A']);

			update('ParamSwitchTry', { mode: 'b' });
			expect(arms()).toEqual(['i:B', 'u:B']);
			expect(container.querySelector('.switch-try u')).toBe(underline);
		});

		it('mounts a hydrated portal whose lifted handler reads component and body locals', () => {
			const log: string[] = [];
			const target = document.createElement('aside');
			document.body.appendChild(target);
			try {
				serve('PortalHandler', { value: 'first', log, target });
				const host = container.querySelector('.portal-handler');
				expect(host).not.toBeNull();
				expect(target.childNodes.length).toBe(0);

				expect(hydrate('PortalHandler', { value: 'first', log, target })).toEqual([]);
				expect(container.querySelector('.portal-handler')).toBe(host);
				const button = target.querySelector('.portal-handler-action') as HTMLButtonElement;
				expect(button.textContent).toBe('first#');
				button.click();
				expect(log.splice(0)).toEqual(['first#', 'click']);

				update('PortalHandler', { value: 'second', log, target });
				expect(target.querySelector('.portal-handler-action')).toBe(button);
				button.click();
				expect(log.splice(0)).toEqual(['second#', 'click']);

				root!.unmount();
				root = null;
				expect(target.childNodes.length).toBe(0);
			} finally {
				target.remove();
			}
		});
	});
}
