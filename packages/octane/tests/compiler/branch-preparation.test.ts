// @vitest-environment node
import { parseModule } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { walkAst } from '../_profile-output.js';

// Branch admission is compiler/runtime ABI: a wrong bit lets an off-tree
// preparation retain a live foreign host, even if the first rendered value
// happens to be plain text. Inspect emitted arguments, not helper names or
// intermediate compiler structures.
function emittedMasks(source: string, dev: boolean, strong: boolean, helper: string) {
	const { code } = compile(source, 'branch-preparation.tsrx', { dev, strong, hmr: false });
	const program = parseModule(code, 'branch-preparation.js');
	let binding: string | undefined;
	for (const statement of program.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'octane') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type === 'ImportSpecifier' && specifier.imported.name === helper)
				binding = specifier.local.name;
		}
	}
	const masks: Array<{ lite: number; prepare: number; args: number }> = [];
	walkAst(program, (node) => {
		if (node.type !== 'CallExpression' || node.callee?.name !== binding || !binding) return;
		masks.push({
			lite: node.arguments[8]?.value ?? 0,
			prepare: node.arguments[9]?.value ?? 0,
			args: node.arguments.length,
		});
	});
	return masks;
}

for (const dev of [false, true]) {
	for (const strong of [false, true]) {
		describe(`branch placement ABI dev=${dev} strong=${strong}`, () => {
			it('distinguishes an owned flat arm from an omitted arm, allowing scalar coercion and a static control', () => {
				const masks = emittedMasks(
					`export function App(p) @{
						<main>
							@if (p.on) {
								<section ref={p.armRef} title={p.object}>
									<input defaultValue="draft" />
									<button aria-label={p.label} hidden={p.hide} onClick={p.click}>
										{p.text as string}
									</button>
								</section>
							}
						</main>
					}`,
					dev,
					strong,
					'ifBlock',
				);
				expect(masks).toEqual([{ lite: 1, prepare: 1, args: 10 }]);
			});

			it.each([
				['component', '<section><Leaf /></section>'],
				['generic hole', '<section>{p.children}</section>'],
				[
					'loop',
					'<ul>@for (const item of p.items; key item.id) { <li>{item.name as string}</li> }</ul>',
				],
				['portal', '<section>{createPortal(<p>foreign</p>, p.target)}</section>'],
				['head resource', '<section><title>{p.title as string}</title><p>body</p></section>'],
				['custom element', '<section><octane-input /></section>'],
				['customized built-in', '<section><button is="octane-button" /></section>'],
				['dynamic form property', '<section><input defaultValue={p.draft} /></section>'],
				['root text parent', '<>{p.text as string}<i>tail</i></>'],
				['unsupported spread', '<section {...p.rest} />'],
			])('omits placement proof for %s while keeping the normal branch ABI', (_kind, then) => {
				const masks = emittedMasks(
					`import {createPortal} from 'octane';
					function Leaf() @{ <i>leaf</i> }
					export function App(p) @{ <main>@if (p.on) { ${then} }</main> }`,
					dev,
					strong,
					'ifBlock',
				);
				expect(masks.at(-1)?.prepare).toBe(0);
				expect(masks.at(-1)?.args).toBeLessThanOrEqual(9);
			});

			it('assigns default and case bits independently and never wraps after the 30th case', () => {
				const cases = Array.from({ length: 32 }, (_, i) =>
					i === 1
						? `@case ${i}: { <section>{p.children}</section> }`
						: `@case ${i}: { <p data-case="${i}">case</p> }`,
				).join('\n');
				const masks = emittedMasks(
					`export function App(p) @{
						<main>@switch (p.value) { ${cases} @default: { <aside>empty</aside> } }</main>
					}`,
					dev,
					strong,
					'switchBlock',
				);
				expect(masks).toHaveLength(1);
				expect(masks[0].prepare).toBe(0x7fffffff ^ 4);
				expect(masks[0].args).toBe(10);
			});

			it('keeps hookful full-arm ownership while allowing its own native template to be prepared', () => {
				const masks = emittedMasks(
					`import {useState} from 'octane';
					export function App(p) @{
						<main>@if (p.on) {
							const [value, set] = useState('draft');
							<button onClick={() => set('next')}>{value as string}</button>
						}</main>
					}`,
					dev,
					strong,
					'ifBlock',
				);
				expect(masks).toEqual([{ lite: 0, prepare: 1, args: 10 }]);
			});
		});
	}
}
