import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { slotHooks } from '../../src/compiler/slot-hooks.js';

const targets = [
	{ mode: 'client', dev: true },
	{ mode: 'client', dev: false },
	{ mode: 'server', dev: true },
	{ mode: 'server', dev: false },
	{
		mode: 'client',
		dev: true,
		renderer: { id: 'test', module: 'octane/universal', target: 'universal' },
	},
	{
		mode: 'client',
		dev: false,
		renderer: { id: 'test', module: 'octane/universal', target: 'universal' },
	},
] as const;

describe('context provider authoring', () => {
	for (const extension of ['tsrx', 'tsx']) {
		for (const target of targets) {
			const label = `${extension}, ${target.mode}, ${target.dev ? 'dev' : 'prod'}${'renderer' in target ? ', universal' : ''}`;
			it(`rejects Context.Provider with a migration diagnostic (${label})`, () => {
				const source = `import { createContext } from 'octane';
const Theme = createContext('light');
export function App() { return <Theme.Provider value="dark"><div /></Theme.Provider>; }`;
				expect(() => compile(source, 'App.' + extension, target)).toThrow(
					/Context\.Provider.*<Context value=/,
				);
			});

			it(`accepts the context itself as the provider (${label})`, () => {
				const source = `import { createContext } from 'octane';
const Theme = createContext('light');
export function App() { return <Theme value="dark"><div /></Theme>; }`;
				expect(() => compile(source, 'App.' + extension, target)).not.toThrow();
			});
		}
	}

	it.each([
		`import { createContext as makeContext } from 'octane'; const Theme = makeContext('light');`,
		`import * as Octane from 'octane'; const Theme = Octane.createContext('light');`,
		`import { createContext } from 'octane/server'; const Theme = createContext('light');`,
		`import { createContext } from 'octane/universal'; const Theme = createContext('light');`,
		`import { createContext } from '@octanejs/lynx/renderer'; const Theme = createContext('light');`,
		`import { createContext } from '@octanejs/lynx/main-renderer'; const Theme = createContext('light');`,
		`import { createContext } from 'octane'; const makeContext = createContext; const Original = makeContext('light'); const Theme = Original;`,
		`import { createContext } from 'octane'; let Theme = createContext('light');`,
		`import * as Octane from 'octane'; const Theme = Octane?.createContext?.('light');`,
	])('recognizes context factories and immutable aliases: %s', (setup) => {
		expect(() =>
			compile(
				`${setup}\nexport function App() { return <Theme.Provider value="dark" />; }`,
				'App.tsx',
			),
		).toThrow(/Context\.Provider.*<Context value=/);
	});

	it.each([
		`const Legacy = Theme.Provider;`,
		`const Legacy = Theme['Provider'];`,
		`const Legacy = Theme?.Provider;`,
		`const Legacy = (Theme as any).Provider;`,
		`const { Provider: Legacy } = Theme;`,
		`let Legacy; ({ Provider: Legacy } = Theme);`,
		String.raw`const Legacy = Theme.Provi\u0064er;`,
	])('rejects legacy provider references: %s', (reference) => {
		expect(() =>
			compile(
				`import { createContext } from 'octane'; const Theme = createContext('light'); ${reference}`,
				'App.tsx',
			),
		).toThrow(/Context\.Provider.*<Context value=/);
	});

	it('allows destructuring an unrelated provider next to an Octane context', () => {
		expect(() =>
			compile(
				`import { createContext } from 'octane';
const Theme = createContext('light');
const Components = { Provider: () => null };
let Provider; ({ Provider } = Components);`,
				'App.tsx',
			),
		).not.toThrow();
	});

	it.each(['client', 'server'] as const)(
		'rejects legacy references in plain modules for %s transforms',
		(environment) => {
			expect(() =>
				slotHooks(
					`import { createContext } from 'octane'; const Theme = createContext('light'); export const Legacy = Theme.Provider;`,
					'contexts.ts',
					{ environment },
				),
			).toThrow(/Context\.Provider.*<Context value=/);
		},
	);

	it('allows mutable values that are reassigned to an ordinary component namespace', () => {
		expect(() =>
			compile(
				`import { createContext } from 'octane';
let Theme = createContext('light');
Theme = { Provider: () => null };
export function App() { return <Theme.Provider />; }`,
				'App.tsx',
			),
		).not.toThrow();
	});

	it('reports the authored property location', () => {
		const source = `import { createContext } from 'octane';
const Theme = createContext('light');
export function App() { return <Theme.Provider value="dark" />; }`;
		let error: any;
		try {
			compile(source, 'App.tsx');
		} catch (caught) {
			error = caught;
		}
		expect(error).toMatchObject({
			code: 'OCTANE_CONTEXT_PROVIDER',
			loc: { line: 3, column: source.split('\n')[2].indexOf('Provider') },
			filename: 'App.tsx',
		});
	});

	it('rejects a local context while respecting parameter and factory shadows', () => {
		expect(() =>
			compile(
				`import { createContext } from 'octane';
export function App() {
  const Theme = createContext('light');
  return <Theme.Provider value="dark" />;
}`,
				'App.tsx',
			),
		).toThrow(/Context\.Provider/);
		expect(() =>
			compile(
				`import { createContext } from 'octane';
const Theme = createContext('light');
export function App(Theme) { return <Theme.Provider />; }
export function Factory(createContext) {
  const Other = createContext();
  return <Other.Provider />;
}`,
				'App.tsx',
			),
		).not.toThrow();
	});

	it('preserves unrelated member components and providers from other frameworks', () => {
		expect(() =>
			compile(
				`import { createContext } from 'other-framework';
const Theme = createContext('light');
const Components = { Provider: () => null };
export function App() { return <Components.Provider><Theme.Provider /></Components.Provider>; }`,
				'App.tsx',
			),
		).not.toThrow();
	});

	it.each(targets)('accepts spread props on direct contexts: %j', (target) => {
		expect(() =>
			compile(
				`import { createContext } from 'octane';
const Theme = createContext('light');
export function App(props) { return <Theme {...props}><div>{props.children}</div></Theme>; }`,
				'App.tsx',
				target,
			),
		).not.toThrow();
	});
});
