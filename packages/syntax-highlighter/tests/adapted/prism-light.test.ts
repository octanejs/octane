import { expect, test, vi } from 'vitest';
import * as React from 'octane';
import renderer from '../react-test-renderer-adapter.ts';
import { PrismLight as SyntaxHighlighter } from '../../src';
import jsx from '../../src/languages/prism/jsx';
import prism from '../../src/styles/prism/prism';
SyntaxHighlighter.registerLanguage('jsx', jsx);
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
