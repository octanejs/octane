import { expect, test, vi } from 'vitest';
import * as React from 'octane';
import renderer from '../react-test-renderer-adapter.ts';
import { PrismAsync as SyntaxHighlighter } from '../../src';
import prism from '../../src/styles/prism/prism';
test('SyntaxHighlighter renders jsx highlighted text', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{ language: 'jsx', style: prism },
				`import React from "react";
import uniquePropHOC from "./lib/unique-prop-hoc";

class Expire extends React.Component {
    constructor(props) {
        super(props);
        this.state = { component: props.children }
    }
    componentDidMount() {
        setTimeout(() => {
            this.setState({
                component: null
            });
        }, this.props.time || this.props.seconds * 1000);
    }
    render() {
        return this.state.component;
    }
}`,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('SyntaxHighlighter should just render text if syntax is not registered', () => {
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{ language: 'python', style: prism },
				"print('hello')",
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('When the code split is loaded - SyntaxHighlighter renders jsx highlighted text', async () => {
	await SyntaxHighlighter.preload();
	const tree = renderer
		.create(
			/* @__PURE__ */ React.createElement(
				SyntaxHighlighter,
				{ language: 'jsx', style: prism },
				`import React from "react";
  import uniquePropHOC from "./lib/unique-prop-hoc";

  class Expire extends React.Component {
      constructor(props) {
          super(props);
          this.state = { component: props.children }
      }
      componentDidMount() {
          setTimeout(() => {
              this.setState({
                  component: null
              });
          }, this.props.time || this.props.seconds * 1000);
      }
      render() {
          return this.state.component;
      }
  }`,
			),
		)
		.toJSON();
	expect(tree).toMatchSnapshot();
});
test('Prism SyntaxHighlighter renders template strings and JSX correctly', () => {
	const tree = renderer.create(
		/* @__PURE__ */ React.createElement(
			SyntaxHighlighter,
			{ language: 'jsx', style: prism },
			`import React from "react";

const x = \`
template string.
\`

const y = () => {
  return (
    <div>
      jsx
    </div>
  )
}`,
		),
	);
	expect(tree).toMatchSnapshot();
});
