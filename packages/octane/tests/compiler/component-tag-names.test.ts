import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// JSX host-vs-component classification for identifier tags. JSX semantics
// (Babel/TS `isCompatTag`, ESTree) treat an identifier tag as a HOST string
// tag only when it starts with a lowercase ASCII letter — `_`- and
// `$`-prefixed identifiers are component REFERENCES: `<_Inner/>` must lower
// to `createElement(_Inner, …)`, never `createElement('_Inner', …)`.

const client = (src: string): string => compile(src, 'App.tsrx').code;
const server = (src: string): string => compile(src, 'App.tsrx', { mode: 'server' }).code;

const APP = (tag: string) => `
  function Inner() @{ <span>{'x'}</span> }
  export function App() {
    const ${tag} = Inner;
    return <${tag}/>;
  }
`;

describe('identifier JSX tags — host vs component classification', () => {
	it('`<_Inner/>` is a component reference in client mode', () => {
		const out = client(APP('_Inner'));
		expect(out).toContain('createElement(_Inner,');
		expect(out).not.toMatch(/['"<]_Inner\b/); // no string tag, no template HTML
	});

	it('`<_Inner/>` is a component reference in server mode', () => {
		const out = server(APP('_Inner'));
		expect(out).toContain('ssrComponent(__s, _Inner,');
		expect(out).not.toMatch(/['"<]_Inner\b/);
	});

	it('`<$Inner/>` is a component reference in client mode', () => {
		const out = client(APP('$Inner'));
		expect(out).toContain('createElement($Inner,');
		expect(out).not.toMatch(/['"<]\$Inner/);
	});

	it('`<$Inner/>` is a component reference in server mode', () => {
		const out = server(APP('$Inner'));
		expect(out).toContain('ssrComponent(__s, $Inner,');
		expect(out).not.toMatch(/['"<]\$Inner/);
	});

	it('lowercase and dashed tags stay host tags', () => {
		const src = `export function App() @{ <div><my-element/></div> }`;
		expect(client(src)).toContain('<my-element>');
		expect(server(src)).toContain('<my-element>');
	});
});
