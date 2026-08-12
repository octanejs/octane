import { expect, test, vi } from 'vitest';
import * as React from 'octane';
import renderer from '../react-test-renderer-adapter.ts';
import SyntaxHighlighter from '../../src';
import { PrismAsync as PrismSyntaxHighlighter } from '../../src';
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
const javaCode =
	'package com.javatest;\n\npublic class BubbleSort {\n  /**\n   * Applies bubble sort to an array and returns whether the array was sorted correctly.\n   */\n  public boolean checkSort(int[] a) {\n    sort(a);\n\n    for (int i = 0; i < a.length - 1; i++) {\n      if (a[i] > a[i + 1]) {\n        return false;\n      }\n    }\n\n    return true;\n  }\n\n  /**\n   * Bubble sort an array, mutating the array (contains a bug).\n   */\n  public void sort(int [] a) {\n    int j;\n    boolean flag = true;\n    int temp;';
const jsxCode = `
import React from "react";

const x = \`
template string.
\`

const y = () => {
  return (
    <div>
      jsx
    </div>
  )
}
`;
test('SyntaxHighlighter component renders correctly', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{ language: 'javascript', wrapLines: true },
				code,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter allows lineProps as an object', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{
					language: 'javascript',
					wrapLines: true,
					lineProps: { style: { color: 'red' } },
				},
				code,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter allows lineProps as function', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{
					language: 'javascript',
					wrapLines: true,
					lineProps: () => ({ style: { color: 'red' } }),
				},
				code,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter renders java code correctly with wrapLines', () => {
	const tree = renderer.create(
		/* @__PURE__ */ React.createElement(
			SyntaxHighlighter,
			{
				language: 'java',
				wrapLines: true,
				lineProps: (lineNumber) => {
					const style = { display: '', backgroundColor: '' };
					if (lineNumber < 5) {
						style.display = 'block';
						style.backgroundColor = '#A9DBB8';
					} else if (lineNumber < 10) {
						style.display = 'block';
						style.backgroundColor = '#EDE4AF';
					} else if (lineNumber < 20) {
						style.display = 'block';
						style.backgroundColor = '#BA2D0B';
					}
					return { style };
				},
			},
			javaCode,
		),
	);
	expect(tree).toMatchSnapshot();
});
test('Prism SyntaxHighlighter renders JSX code correctly with wrapLines', () => {
	const tree = renderer.create(
		/* @__PURE__ */ React.createElement(
			PrismSyntaxHighlighter,
			{
				language: 'jsx',
				wrapLines: true,
				lineProps: {
					style: { backgroundColor: 'red' },
					className: 'test-line-class',
				},
			},
			jsxCode,
		),
	);
	expect(tree).toMatchSnapshot();
});
