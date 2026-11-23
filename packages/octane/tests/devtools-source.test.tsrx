// #3132: dev-compiled templates stamp EVERY host element with its authored
// location, and the devtools hook's sourceFor() reads it back.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { installDevtoolsGlobal, type OctaneDevtoolsHook } from '../src/devtools-hook';
import { SourcesApp } from './_fixtures/devtools-sources.tsrx';
import { act, mount } from './_helpers';

const FIXTURE = 'packages/octane/tests/_fixtures/devtools-sources.tsrx';

function hook(): OctaneDevtoolsHook {
	installDevtoolsGlobal();
	return globalThis.__OCTANE_DEVTOOLS__!;
}

// Each element resolves to the full fixture path, at the column where its own
// opening tag starts: static elements, component output, @if arms and
// multi-root fragments included.
function expectEveryElementLocated(container: Element): void {
	// A <template>'s children live in its content fragment, out of the tree.
	const elements = [...container.querySelectorAll('*')];
	elements.push(
		...container.querySelector(':scope > main > template')!.content.querySelectorAll('*'),
	);
	expect(elements.map((el) => el.localName)).toEqual([
		'main',
		'h1',
		'em',
		'i',
		'p',
		'strong',
		'a',
		'section',
		'b',
		'footer',
		'svg',
		'template',
		'g',
		'template',
		'u',
	]);
	for (const el of elements) {
		const source = hook().sourceFor(el);
		expect(source, el.localName).not.toBeNull();
		// The bundler's canonical id: root-relative, so it is the Vite URL too.
		expect(source!.file).toBe(`/${FIXTURE}`);
		const line = readFileSync(`.${source!.file}`, 'utf8').split('\n')[source!.line - 1];
		expect(line.slice(source!.column), el.localName).toMatch(new RegExp(`^<${el.localName}[ >]`));
	}
	expect(hook().sourceFor(document.createElement('div'))).toBeNull();
}

describe('devtools sourceFor', () => {
	let server: ReturnType<typeof import('./_server-fixture').loadServerFixture>;
	beforeAll(async () => {
		const { loadServerFixture } = await import('./_server-fixture');
		server = loadServerFixture(FIXTURE);
	}, 30_000);

	it('locates every host element of a client mount', () => {
		const { container, unmount } = mount(SourcesApp, { show: true });
		try {
			expectEveryElementLocated(container);
		} finally {
			unmount();
		}
	});

	it('locates every adopted element after hydration', async () => {
		const container = document.createElement('div');
		document.body.append(container);
		container.innerHTML = renderToString(server['SourcesApp'], { show: true }).html;
		const main = container.querySelector('main');
		const root = hydrateRoot(container, SourcesApp, { show: true });
		try {
			await act(() => {});
			expect(container.querySelector('main')).toBe(main);
			expectEveryElementLocated(container);
		} finally {
			root.unmount();
			container.remove();
		}
	});
});
