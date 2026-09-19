import { describe, expect, it } from 'vitest';
import { parseModule } from '../../src/compiler/parser.node.js';
import { findVoidComponentExports } from '../../src/compiler/bundler.js';

describe('compiled component export contracts', () => {
	it('certifies component exports only while their lexical bindings keep the compiled contract', () => {
		const freeze = (value: any): any => {
			if (value && typeof value === 'object' && !Object.isFrozen(value)) {
				for (const child of Object.values(value)) freeze(child);
				Object.freeze(value);
			}
			return value;
		};
		for (const [tail, eligible] of [
			['App = () => "replacement";', false],
			['function replace() { App = () => "replacement"; }', false],
			['({App} = replacement);', false],
			['[App] = replacement;', false],
			['for (App of replacements) {}', false],
			['eval("App = () => 1");', false],
			['(eval as Function)("App = () => 1");', false],
			['function unrelated(App) { App = () => "unrelated"; }', true],
			['{ let App; App = () => "unrelated"; }', true],
			['try {} catch (App) { App = () => "unrelated"; }', true],
			['for (let App of replacements) { App = () => "unrelated"; }', true],
		] as const) {
			for (const exported of ['export function App()', 'export default function App()']) {
				const ast = freeze(
					parseModule(`${exported} @{ <main>first</main> }\n${tail}`, '/project/View.tsrx'),
				);
				expect(findVoidComponentExports(ast, '/project/View.tsrx')).toEqual(
					eligible ? [exported.includes('default') ? 'default' : 'App'] : [],
				);
			}
		}
	});
});
