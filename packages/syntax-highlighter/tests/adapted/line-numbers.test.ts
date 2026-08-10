import { expect, test, vi } from 'vitest';
import * as React from 'octane';
import renderer from '../react-test-renderer-adapter.ts';
import SyntaxHighlighter from '../../src';
const code = `const woah = fun => fun + 1;
const dude = woah(2) + 3;
function thisIsAFunction() {
  return [1,2,3].map(n => n + 1).filter(n !== 3);
}
console.log('making up fake code is really hard');

function itIs() {
  return 'no seriously really it is';
}
`;
test('SyntaxHighlighter component renders line numbers if showLineNumbers === true', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{ language: 'javascript', showLineNumbers: true },
				code,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter component does not render line numbers if showLineNumbers === undefined', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(SyntaxHighlighter, { language: 'javascript' }, code),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter component does not render line numbers if showInlineNumbers === true && showLineNumbers === undefined', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{ language: 'javascript', showInlineLineNumbers: true },
				code,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter component renders correctly', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{ language: 'javascript', showLineNumbers: true },
				code,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter allows lineNumberStyle as object', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{
					language: 'javascript',
					showLineNumbers: true,
					lineNumberStyle: { color: 'red' },
				},
				code,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter allows lineNumberStyle as function', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{
					language: 'javascript',
					showLineNumbers: true,
					lineNumberStyle: () => ({ color: 'red' }),
				},
				code,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter allows lineNumberStyle as function for inline line numbers', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{
					language: 'javascript',
					showLineNumbers: true,
					showInlineLineNumbers: true,
					lineNumberStyle: () => ({ color: 'red' }),
				},
				code,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
