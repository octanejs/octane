import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// `<title>` is TWO different elements: document `<title>` hoists to
// document.head (React-19 style), but SVG `<title>` is the accessibility
// tooltip child of an svg subtree and must stay in place — in BOTH compile
// modes (regression: the server compile threw "does not support node type
// HeadHoist" for an svg tooltip; the client would have hoisted it into the
// document head).

const SOURCE = `
export function Chart(props) @{
	<>
		<title>{'Document title — hoists'}</title>
		<svg viewBox="0 0 10 10">
			<path d="M0,0 h10">
				<title>{'Tooltip — stays in the svg'}</title>
			</path>
		</svg>
	</>
}
`;

describe('svg <title> is not head-hoisted', () => {
	it('client: the svg tooltip stays in the template; the document title hoists', () => {
		const { code } = compile(SOURCE, 'chart.tsrx');
		// The svg tooltip text is template/binding content...
		expect(code).toContain('Tooltip — stays in the svg');
		// ...emitted as markup inside the svg template, not as a head element.
		expect(code).toMatch(/<title>[\s\S]*?<\/title>/);
		// The document-level title still rides the head-hoist channel.
		expect(code).toContain('headBlock');
	});

	it('server: compiles (no HeadHoist error) and emits the tooltip inline', () => {
		const { code } = compile(SOURCE, 'chart.tsrx', { mode: 'server' });
		expect(code).toContain('Tooltip — stays in the svg');
		expect(code).toMatch(/<title>/);
		// Document title goes through the server head channel.
		expect(code).toContain('ssrHeadEl');
	});
});
