// The build check for `hydrate: 'islands'` routes (#1514). The shell never loads
// in the browser, so every construct that needs client work outside an
// independent island must be rejected, and only checkable components accepted.
import { describe, expect, it } from 'vitest';
import { analyzeIslandsShell } from 'octane/compiler/bundler';

const shell = (body: string, imports = '') => `import { Hydrate, useState } from 'octane';
import { interaction } from 'octane/hydration';
import { Island } from './Island.tsrx';
import { Static } from './Static.tsrx';
import { Library } from 'library';
import { count$ } from './state';
${imports}
export function Page(props) @{
  ${body}
}`;

describe('islands-only shell analysis', () => {
	it('accepts static output and reports the components it renders outside islands', () => {
		const result = analyzeIslandsShell(
			shell(`<main class={props.compact ? 'compact' : 'wide'}>
    <Static />
    @if (props.open) { <p>{props.label as string}</p> }
    <Hydrate independent when={interaction()}><Island /></Hydrate>
    <input name="q" defaultValue="search" />
  </main>`),
			'/src/Page.tsrx',
		);
		expect(result.problems).toEqual([]);
		expect(result.components).toEqual([{ source: './Static.tsrx', exportName: 'Static' }]);
	});

	it.each([
		[
			'a hook',
			'const [open] = useState(false); <main>{String(open) as string}</main>',
			/hook useState/,
		],
		['an event handler', '<button onClick={() => {}}>Go</button>', /"onClick" needs client code/],
		['a ref', '<div ref={props.ref} />', /"ref" needs client code/],
		['a controlled value', '<input value={props.value} />', /controlled "value"/],
		[
			'an ordinary Hydrate',
			'<Hydrate when={interaction()}><Island /></Hydrate>',
			/ordinary <Hydrate>/,
		],
		['@try', '@try { <p>ok</p> } @catch { <p>failed</p> }', /@try recovery/],
		['a signal read', '<p>{String(count$.get()) as string}</p>', /\.get\(\) read/],
		['an optional signal read', '<p>{String(count$?.get()) as string}</p>', /\.get\(\) read/],
		[
			'a signal read through a cast receiver',
			'<p>{String((count$ as any).latest(0)) as string}</p>',
			/\.latest\(\) read/,
		],
		[
			'a signal read through a cast callee',
			'<p>{String((count$.get as () => number)()) as string}</p>',
			/\.get\(\) read/,
		],
		['a non-null signal read', '<p>{String(count$.get!()) as string}</p>', /\.get\(\) read/],
		[
			'a computed signal read',
			"<p>{String(count$['snapshot']()) as string}</p>",
			/\.snapshot\(\) read/,
		],
		[
			'a Hydrate whose independent prop is false',
			'<Hydrate independent={false} when={interaction()}><Island /></Hydrate>',
			/ordinary <Hydrate>/,
		],
		['a handle binding', '<p>{count$ as string}</p>', /signal handle binding/],
		['a spread', '<div {...props} />', /attribute spread/],
		['a package component', '<Library />', /<Library> cannot be checked/],
	])('rejects %s', (_name, body, message) => {
		const { problems } = analyzeIslandsShell(shell(body), '/src/Page.tsrx');
		expect(problems.map((problem) => problem.message).join('\n')).toMatch(message);
		expect(problems[0]).toMatchObject({ line: expect.any(Number), column: expect.any(Number) });
	});

	it('checks local components the shell renders and only the selected exports', () => {
		const source = `import { Hydrate } from 'octane';
function Local() @{ <button onClick={() => {}}>Local</button> }
export function Uses() @{ <main><Local /></main> }
export function Other() @{ <button onClick={() => {}}>Other</button> }`;
		expect(analyzeIslandsShell(source, '/src/Page.tsrx', ['Uses']).problems).toHaveLength(1);
		expect(analyzeIslandsShell(source, '/src/Page.tsrx', ['Uses']).problems[0].line).toBe(2);
		expect(analyzeIslandsShell(source, '/src/Page.tsrx', null).problems).toHaveLength(2);
	});

	it('accepts an independent Hydrate written as independent={true}', () => {
		const { problems } = analyzeIslandsShell(
			shell('<Hydrate independent={true} when={interaction()}><Island /></Hydrate>'),
			'/src/Page.tsrx',
		);
		expect(problems).toEqual([]);
	});

	// Every way a module can export the rendered component must reach the check:
	// an export the analysis cannot follow would otherwise pass with no problems.
	it.each([
		[
			'an anonymous default function',
			'export default function () @{ <button onClick={() => {}}>Go</button> }',
			null,
		],
		[
			'a default-exported identifier',
			'function Page() @{ <button onClick={() => {}}>Go</button> }\nexport default Page;',
			null,
		],
		[
			'an export list',
			'function Page() @{ <button onClick={() => {}}>Go</button> }\nexport { Page as Shell };',
			['Shell'],
		],
		[
			'an exported arrow component',
			'export const Page = () => <button onClick={() => {}}>Go</button>;',
			['Page'],
		],
		[
			'an exported function expression',
			'export const Page = function () { return <button onClick={() => {}}>Go</button>; };',
			null,
		],
	] as const)('checks the shell behind %s', (_name, body, exports) => {
		const { problems } = analyzeIslandsShell(
			`import { Hydrate } from 'octane';\n${body}`,
			'/src/Page.tsrx',
			exports === null ? null : [...exports],
		);
		expect(problems.map((problem) => problem.message)).toEqual([
			'"onClick" needs client code the shell never loads',
		]);
	});

	it('follows re-exported and imported shell components to their modules', () => {
		const source = `import Page from './Page.tsrx';
export { Layout } from './Layout.tsrx';
export default Page;`;
		expect(analyzeIslandsShell(source, '/src/entry.tsrx', null)).toEqual({
			problems: [],
			components: [
				{ source: './Layout.tsrx', exportName: 'Layout' },
				{ source: './Page.tsrx', exportName: 'default' },
			],
		});
	});

	it.each([
		['a missing export', 'export function Other() @{ <p>other</p> }'],
		[
			'a wrapped component',
			"import { memo } from 'octane';\nexport const Page = memo(() => <p />);",
		],
		['a package re-export', "export { Page } from 'library';"],
		['a star re-export', "export * from './Pages.tsrx';"],
	] as const)('rejects %s it cannot check', (_name, body) => {
		const { problems } = analyzeIslandsShell(body, '/src/entry.tsrx', ['Page']);
		expect(problems.map((problem) => problem.message)).toEqual([
			'export "Page" cannot be checked as static shell output',
		]);
	});
});
