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
test('SyntaxHighlighter renders div where pre tag is by default', () => {
	const tree = renderer
		.create(/* @__PURE__ */ React.createElement(SyntaxHighlighter, { PreTag: 'div' }, code))
		.toJSON();
	expect(tree).toMatchSnapshot();
});
function Pre({ children, ...rest }) {
	return /* @__PURE__ */ React.createElement('p', { ...rest }, children);
}
test('SyntaxHighlighter component renders custom react component where pre tag is by default', () => {
	const tree = renderer
		.create(/* @__PURE__ */ React.createElement(SyntaxHighlighter, { PreTag: Pre }, code))
		.toJSON();
	expect(tree).toMatchSnapshot();
});
