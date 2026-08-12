import { expect, test, vi } from 'vitest';
import * as React from 'octane';
import renderer from '../react-test-renderer-adapter.ts';
import { Light as SyntaxHighlighter } from '../../src';
import objc from 'highlight.js/lib/languages/objectivec';
SyntaxHighlighter.registerLanguage('objc', objc);
SyntaxHighlighter.registerLanguage('objectivec', objc);
test('SyntaxHighlighter renders childre unadultered when no language disocvered in highlight auto', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				null,
				`Contacts* contacts = [[Contacts alloc]init];`,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
