import { describe, expect, it } from 'vitest';
import { parsePathSvg } from '../dist/path-svg.js';

describe('path-only SVG assets', () => {
	it('reads root attributes and ordered paths without interpreting their data', () => {
		const source = `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="24" viewBox="-1, 0, 24, 24" fill="none">
			<path d="M0 0L1.5 2z" fill="currentColor"/>
			<path d='m3-2a2 2 0 0 1 1 1' stroke='#abcdef80' stroke-width='0.5' fill-rule='evenodd' clip-rule='nonzero' />
		</svg>`;
		expect(parsePathSvg(source)).toEqual({
			root: {
				xmlns: 'http://www.w3.org/2000/svg',
				width: '1em',
				height: '24',
				viewBox: '-1, 0, 24, 24',
				fill: 'none',
			},
			paths: [
				{ d: 'M0 0L1.5 2z', fill: 'currentColor' },
				{
					d: 'm3-2a2 2 0 0 1 1 1',
					stroke: '#abcdef80',
					'stroke-width': '0.5',
					'fill-rule': 'evenodd',
					'clip-rule': 'nonzero',
				},
			],
		});
	});

	const path = '<path d="M0 0Z"/>';
	it.each([
		['URL modules', 'data:image/svg+xml,caption'],
		['unknown XML namespaces', `<svg xmlns="urn:other">${path}</svg>`],
		['entities', '<svg><path d="M0&#x20;0"/></svg>'],
		['document type declarations', `<!DOCTYPE svg><svg>${path}</svg>`],
		['unknown attributes', '<svg><path d="M0 0" transform="scale(2)"/></svg>'],
		['numeric loader normalization', `<svg width="01.00">${path}</svg>`],
		['noncanonical stroke width', '<svg><path d="M0 0" stroke-width=".5"/></svg>'],
		['duplicate attributes', `<svg width="1" width="2">${path}</svg>`],
		['unquoted attributes', '<svg><path d=M0/></svg>'],
		['XML-normalized tabs', `<svg viewBox="0\t0 1 1">${path}</svg>`],
		['XML-normalized newlines', '<svg><path d="M0\r\n0"/></svg>'],
		['missing attribute separators', '<svg><path d="M0 0"fill="red"/></svg>'],
		['multiple roots', `<svg>${path}</svg><svg>${path}</svg>`],
		['nested groups', `<svg><g>${path}</g></svg>`],
		['scripts', `<svg>${path}<script>alert(1)</script></svg>`],
		['DOM event attributes', '<svg><path d="M0 0" onload="go()"/></svg>'],
		['paint references', '<svg><path d="M0 0" fill="url(#paint)"/></svg>'],
		['text nodes', `<svg>${path}text</svg>`],
		['truncated input', `<svg>${path}`],
		['paths without data', '<svg><path/></svg>'],
		['prototype properties', `<svg constructor="red">${path}</svg>`],
	])('declines %s', (_, source) => {
		expect(parsePathSvg(source)).toBeNull();
	});
});
