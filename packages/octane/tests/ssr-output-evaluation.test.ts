import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prerender } from 'octane/static';
import { renderToString } from 'octane/server';
import { hydrateRoot } from '../src/index.js';
import { loadCompiledFixtureSource, loadServerFixture } from './_server-fixture';

const fixture = 'packages/octane/tests/_fixtures/ssr-output-evaluation.tsrx';
const source = readFileSync(fixture, 'utf8');

afterEach(() => vi.restoreAllMocks());

function visibleHtml(html: string) {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

for (const dev of [true, false]) {
	const server = loadServerFixture(fixture, { compileOptions: { dev } });
	describe(`server expression evaluation (${dev ? 'development' : 'production'})`, () => {
		it('evaluates a sole attribute before coercion and child rendering, including reentrant rendering', () => {
			const log: string[] = [];
			const props = {
				read(name: string) {
					log.push(`read:${name}`);
					return {
						toString() {
							log.push(`coerce:${name}`);
							const nested = renderToString(server.SingleAttribute, {
								read: () => 'inner',
								child: () => 'nested',
							});
							expect(visibleHtml(nested.html)).toBe('<div title="inner"><span>nested</span></div>');
							return 'outer & value';
						},
					};
				},
				child() {
					log.push('child');
					return 'body';
				},
			};
			expect(visibleHtml(renderToString(server.SingleAttribute, props).html)).toBe(
				'<div title="outer &amp; value"><span>body</span></div>',
			);
			expect(log).toEqual(['read:title', 'coerce:title', 'child']);
		});

		it('evaluates sibling attribute expressions before serializing either value', () => {
			const log: string[] = [];
			const out = renderToString(server.MultipleAttributes, {
				read(name: string) {
					log.push(`read:${name}`);
					return {
						toString() {
							log.push(`coerce:${name}`);
							return name;
						},
					};
				},
				child() {
					log.push('child');
					return 'body';
				},
			});
			expect(visibleHtml(out.html)).toBe(
				'<div title="title" data-value="value"><span title="nested">body</span></div>',
			);
			expect(log).toEqual([
				'read:title',
				'read:value',
				'coerce:title',
				'coerce:value',
				'read:nested',
				'coerce:nested',
				'child',
			]);
		});

		it('reads spread getters before later direct attributes and preserves the final writer', () => {
			const log: string[] = [];
			const spread = {
				get title() {
					log.push('get:title');
					return 'overwritten';
				},
				get ['data-value']() {
					log.push('get:value');
					return 'spread';
				},
			};
			const out = renderToString(server.SpreadAttribute, {
				read(name: string) {
					log.push(`read:${name}`);
					return name === 'spread' ? spread : 'final';
				},
				child() {
					log.push('child');
					return 'body';
				},
			});
			expect(visibleHtml(out.html)).toBe('<div title="final" data-value="spread">body</div>');
			expect(log).toEqual(['read:spread', 'get:title', 'get:value', 'read:title', 'child']);
		});

		it('snapshots an array through its custom iterator before rendering and mutating rows', () => {
			const log: string[] = [];
			const rows = [
				{ id: 'a', label: 'A' },
				{ id: 'b', label: 'B' },
			];
			rows[Symbol.iterator] = function* () {
				for (let i = this.length - 1; i >= 0; i--) {
					log.push(`yield:${this[i].id}`);
					yield this[i];
				}
			};
			const out = renderToString(server.KeyedRows, {
				rows,
				key(row: { id: string }) {
					log.push(`key:${row.id}`);
					return row.id;
				},
				visit(row: { id: string }, argumentCount: number) {
					expect(argumentCount).toBe(2);
					log.push(`visit:${row.id}`);
					rows.length = 0;
				},
			});
			expect(visibleHtml(out.html)).toBe('<ul><li data-id="b">B</li><li data-id="a">A</li></ul>');
			expect(log).toEqual(['yield:b', 'yield:a', 'key:b', 'visit:b', 'key:a', 'visit:a']);
		});

		it('keeps destructuring defaults and index values in key and body evaluation order', () => {
			const log: string[] = [];
			let fallback = 0;
			const out = renderToString(server.DestructuredRows, {
				rows: [{ id: 'a' }, { id: 'b' }],
				fallback() {
					log.push('fallback');
					return `default-${++fallback}`;
				},
				key(id: string, index: number) {
					log.push(`key:${id}:${index}`);
					return id;
				},
				visit(id: string, index: number, argumentCount: number) {
					expect(argumentCount).toBe(3);
					log.push(`visit:${id}:${index}`);
				},
			});
			expect(visibleHtml(out.html)).toBe(
				'<ul><li data-id="a">default-2</li><li data-id="b">default-4</li></ul>',
			);
			expect(log).toEqual([
				'fallback',
				'key:a:0',
				'fallback',
				'visit:a:0',
				'fallback',
				'key:b:1',
				'fallback',
				'visit:b:1',
			]);
		});

		it('renders the empty arm without evaluating an item key or body', () => {
			const fail = () => {
				throw new Error('unexpected item evaluation');
			};
			for (const rows of [[], null, undefined]) {
				expect(
					visibleHtml(renderToString(server.KeyedRows, { rows, key: fail, visit: fail }).html),
				).toBe('<ul><li>empty</li></ul>');
			}
		});

		it('isolates keyed async values and restores identities after a throwing list', async () => {
			expect(() =>
				renderToString(server.KeyedRows, {
					rows: [{ id: 'bad', label: 'bad' }],
					key: () => 'bad',
					visit() {
						throw new Error('stop');
					},
				}),
			).toThrow('stop');
			const [a, b] = await Promise.all(
				['A', 'B'].map((prefix) =>
					prerender(server.AsyncRows, {
						rows: ['one', 'two'].map((id) => ({ id, value: Promise.resolve(`${prefix}:${id}`) })),
					}),
				),
			);
			expect(visibleHtml(a.html)).toMatch(/>A:one<\/li><li[^>]*>A:two<\/li>/);
			expect(visibleHtml(b.html)).toMatch(/>B:one<\/li><li[^>]*>B:two<\/li>/);
			const ids = [...a.html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
			expect(ids).toHaveLength(2);
			expect(new Set(ids).size).toBe(2);
		});

		it('keeps resolved values with their keys when a suspended list reorders', async () => {
			let resolveFirst!: (value: string) => void;
			const rows = [
				{
					id: 'a',
					value: new Promise<string>((resolve) => {
						resolveFirst = resolve;
					}),
				},
				{ id: 'b', value: Promise.resolve('B') },
			];
			const pending = prerender(server.AsyncRows, { rows });
			rows.reverse();
			resolveFirst('A');
			const result = await pending;
			expect(visibleHtml(result.html)).toMatch(
				/data-id="b"[^>]*>B<\/li><li data-id="a"[^>]*>A<\/li>/,
			);
		});

		it('hydrates keyed row hosts by adoption', async () => {
			const client = loadCompiledFixtureSource(source, {
				id: fixture,
				mode: 'client',
				compileOptions: { dev, hmr: false },
			});
			const props = {
				rows: [
					{ id: 'a', label: 'A' },
					{ id: 'b', label: 'B' },
				],
				key: (row: { id: string }) => row.id,
				visit() {},
			};
			const container = document.createElement('div');
			container.innerHTML = renderToString(server.KeyedRows, props).html;
			document.body.append(container);
			const nodes = [...container.querySelectorAll('li')];
			const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
			const root = hydrateRoot(container, client.KeyedRows, props);
			try {
				await Promise.resolve();
				const hydratedRows = [...container.querySelectorAll('li')];
				expect(hydratedRows).toHaveLength(nodes.length);
				nodes.forEach((node, index) => expect(hydratedRows[index]).toBe(node));
				expect(nodes.map((node) => node.textContent)).toEqual(['A', 'B']);
				expect(
					errors.mock.calls.filter((call) => /hydration mismatch/i.test(String(call[0]))),
				).toEqual([]);
			} finally {
				root.unmount();
				container.remove();
			}
		});
	});
}
