import { describe, expect, it } from 'vitest';
import { HMR, hmr } from '../src/index.js';
import { compile } from '../src/compiler/compile.js';

const LOCAL_COMPONENT_SOURCE = `
const Route = configure({ component: Component });
function Component() @{ }
`;

function evaluateLocalComponent(code: string) {
	const evaluate = new Function('configure', `${code}\nreturn Route.component;`) as (
		configure: (options: { component: unknown }) => { component: unknown },
	) => unknown;
	return evaluate((options) => options);
}

describe('compiled function declaration hoisting', () => {
	it.each([
		['production client', { hmr: false }],
		['server', { mode: 'server' as const, hmr: false }],
		['Vite HMR client', { hmr: 'vite' as const }],
		['webpack HMR client', { hmr: 'webpack' as const }],
	])('keeps a later local component defined for a preceding config in %s', (_label, options) => {
		const code = compile(LOCAL_COMPONENT_SOURCE, 'route.tsrx', options).code;
		const component = evaluateLocalComponent(code);

		expect(component).toBeTypeOf('function');
		expect((component as Function).name).toBe('Component');
		expect(code).toContain('function Component(');
		expect(code).not.toContain('const Component = function Component');
	});

	it.each([
		['arrow, production client', '() => @{ }', { hmr: false }],
		['function expression, production client', 'function () @{ }', { hmr: false }],
		['arrow, server', '() => @{ }', { mode: 'server' as const, hmr: false }],
		['function expression, server', 'function () @{ }', { mode: 'server' as const, hmr: false }],
		['arrow, Vite HMR client', '() => @{ }', { hmr: 'vite' as const }],
		['function expression, Vite HMR client', 'function () @{ }', { hmr: 'vite' as const }],
		['arrow, webpack HMR client', '() => @{ }', { hmr: 'webpack' as const }],
		['function expression, webpack HMR client', 'function () @{ }', { hmr: 'webpack' as const }],
	])('does not hoist an authored const component in %s', (_label, initializer, options) => {
		const source = `
const Route = configure({ component: Component });
const Component = ${initializer};
`;
		const code = compile(source, 'route.tsrx', options).code;

		expect(code).toContain('const Component = function Component');
		expect(() => evaluateLocalComponent(code)).toThrow(ReferenceError);
	});

	it.each(['vite', 'webpack'] as const)(
		'keeps an exported %s HMR component hoisted while sharing wrapper metadata',
		(hmrMode) => {
			const source = `
const Route = configure({ component: Component });
export function Component() @{ }
`;
			let code = compile(source, 'route.tsrx', { hmr: hmrMode }).code;
			code = code
				.replace(
					/^import \{ HMR as _\$HMR, hmr as _\$hmr \} from 'octane';/m,
					'const { HMR: _$HMR, hmr: _$hmr } = runtime;',
				)
				.replace(/^export function Component/m, 'function Component')
				.replace(/\nif \(import\.meta\.[\s\S]*$/, '');

			const evaluate = new Function(
				'runtime',
				'configure',
				`${code}\nreturn { captured: Route.component, Component };`,
			) as (
				runtime: { HMR: typeof HMR; hmr: typeof hmr },
				configure: (options: { component: unknown }) => { component: unknown },
			) => { captured: Function & { [HMR]?: unknown }; Component: Function };
			const result = evaluate({ HMR, hmr }, (options) => options);

			expect(result.captured).toBe(result.Component);
			expect(result.captured[HMR]).toBeDefined();
			expect(code).toContain('function Component(');
			expect(code).toContain('__ComponentImplementation.displayName = "Component";');
			expect(code).toContain('const __ComponentHmr = _$hmr(__ComponentImplementation);');
		},
	);

	it.each([
		['production client', { hmr: false }],
		['server', { mode: 'server' as const, hmr: false }],
		['Vite HMR client', { hmr: 'vite' as const }],
		['webpack HMR client', { hmr: 'webpack' as const }],
	])('keeps an authored return-JSX declaration hoisted in %s', (_label, options) => {
		const source = `
const Route = configure({ component: Component });
export function Component() { return <div />; }
`;
		const code = compile(source, 'route.tsx', options).code;

		expect(code).toContain('function Component(');
		expect(code).not.toContain('const Component = function Component');
	});
});
