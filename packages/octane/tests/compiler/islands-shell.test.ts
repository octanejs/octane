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
});
