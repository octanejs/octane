import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { prerender } from 'octane/static';
import { evaluateCompiledFixtureCode } from './_server-fixture.js';
import { act, mount } from './_helpers.js';

function deferred() {
	let resolve!: (value: string) => void;
	const promise = new Promise<string>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

function fixtureSource(kind: string): string {
	return `import { Hydrate, use } from 'octane';
import { interaction } from 'octane/hydration';
function Gate(props) @{
  const value = use(props.load('gate'));
  <span>{value as string}</span>
}
function Outside(props) @{
  const value = use(props.load('outside'));
  <span>{value as string}</span>
}
function TemplateHost(props) @{ <props.render /> }
function Parent(props) @{
  const value = use(props.load('parent'));
  ${kind === 'independent' ? '' : 'const template = { render: () => @{ <button type="button">Callback</button> } };'}
  <section><strong>{value as string}</strong>
    ${kind === 'independent' ? '<Hydrate independent when={interaction()}><button type="button">Island</button></Hydrate>' : '<TemplateHost render={template.render} />'}
    <Outside load={props.load} />
  </section>
}
export function Page(props) @{
  <main>
    @try {
      <><Gate load={props.load} /><Parent load={props.load} /></>
    } @pending { <i>Waiting</i> }
  </main>
}`;
}

describe('nested template warm-plan ownership', () => {
	it.each(
		[false, true].flatMap((dev) =>
			['independent', 'authored callback'].map((kind) => ({ dev, kind })),
		),
	)(
		'warms the enclosing parent and outside child before its earlier sibling resolves (%j)',
		async ({ dev, kind }) => {
			const file = '/project/src/NestedTemplateWarm.tsrx';
			const server = evaluateCompiledFixtureCode(
				compile(fixtureSource(kind), file, { mode: 'server', dev }).code,
				file,
				'server',
				undefined,
			);
			const expected = ['gate', 'parent', 'outside'];
			const requests = new Map(expected.map((key) => [key, deferred()]));
			const started: string[] = [];
			const done = prerender(
				server.Page,
				{
					load(key: string) {
						started.push(key);
						return requests.get(key)!.promise;
					},
				},
				{
					independentHydration: {
						buildId: 'warm-plan-test',
						resolve: (boundaryId) => ({ moduleId: boundaryId, styles: [] }),
					},
				},
			);
			let html = '';
			try {
				await new Promise((resolve) => setTimeout(resolve, 0));
				expect(started).toHaveLength(expected.length);
				expect(new Set(started)).toEqual(new Set(expected));
			} finally {
				for (const [key, request] of requests) request.resolve(key.toUpperCase());
				html = (await done).html;
			}
			for (const key of expected) expect(html).toContain(key.toUpperCase());
			expect(html).toContain(kind === 'independent' ? 'Island' : 'Callback');
			expect(html).not.toContain('<i>Waiting</i>');
			expect([...started].sort()).toEqual([...expected].sort());
		},
	);

	it.each([false, true])(
		'retains the enclosing authored callback warm plan on client mount (dev=%s)',
		async (dev) => {
			const file = '/project/src/NestedTemplateWarm.tsrx';
			const client = evaluateCompiledFixtureCode(
				compile(fixtureSource('authored callback'), file, { mode: 'client', dev }).code,
				file,
				'client',
				undefined,
			);
			const expected = ['gate', 'parent', 'outside'];
			const requests = new Map(expected.map((key) => [key, deferred()]));
			const started: string[] = [];
			const rendered = mount(client.Page, {
				load(key: string) {
					started.push(key);
					return requests.get(key)!.promise;
				},
			});
			try {
				expect(started).toHaveLength(expected.length);
				expect(new Set(started)).toEqual(new Set(expected));
				await act(() => {
					for (const [key, request] of requests) request.resolve(key.toUpperCase());
				});
				for (const key of expected)
					expect(rendered.container.textContent).toContain(key.toUpperCase());
				expect(rendered.container.textContent).toContain('Callback');
				expect(rendered.container.textContent).not.toContain('Waiting');
				expect([...started].sort()).toEqual([...expected].sort());
			} finally {
				for (const [key, request] of requests) request.resolve(key.toUpperCase());
				rendered.unmount();
			}
		},
	);
});
