import { createElement as createReactElement } from 'react';
import { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { PortableText } from '@octanejs/portabletext';
import { PortableText as ReactPortableText } from '@portabletext/react';

const value = [
	{
		_type: 'block',
		_key: 'body',
		style: 'normal',
		markDefs: [],
		children: [{ _type: 'span', _key: 'text', text: 'Rendered on the server', marks: ['strong'] }],
	},
];

describe('@octanejs/portabletext — SSR', () => {
	it('matches @portabletext/react static markup', () => {
		const octane = renderToStaticMarkup(PortableText, { value }).html;
		const react = renderReactToStaticMarkup(createReactElement(ReactPortableText, { value }));
		expect(octane).toBe(react);
	});
});
