import { expect, test, vi } from 'vitest';
import * as React from 'octane';
import renderer from '../react-test-renderer-adapter.ts';
import SyntaxHighlighter from '../../src';
const code = `
/* This is a multi-
   line comment. 
*/

void setup() {
}

void loop() {
}
`;
test('Syntaxhighliter correctly renders multi-line comments in arduino language', () => {
	const tree = renderer
		.create(/* @__PURE__ */ React.createElement(SyntaxHighlighter, { language: 'arduino' }, code))
		.toJSON();
	expect(tree).toMatchSnapshot();
});
