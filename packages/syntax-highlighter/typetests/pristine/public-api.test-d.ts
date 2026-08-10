import React from 'react';
import SyntaxHighlighter, {
	Light,
	Prism,
	PrismLight,
	createElement,
	type SyntaxHighlighterProps,
} from 'react-syntax-highlighter';
import javascript from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import github from 'react-syntax-highlighter/dist/esm/styles/hljs/github';

// @type-case props
const props = {
	language: 'javascript',
	children: 'const answer = 42;',
	style: github,
	showLineNumbers: true,
	lineNumberStyle: (line: number) => ({ color: line > 1 ? 'red' : 'blue' }),
	lineProps: (line: number) => ({ id: `line-${line}` }),
	PreTag: (componentProps: React.HTMLProps<HTMLElement>) =>
		React.createElement('section', componentProps),
	CodeTag: 'samp',
	renderer: ({ rows, stylesheet, useInlineStyles }) =>
		rows.map((node, index) =>
			createElement({ node, stylesheet, useInlineStyles, key: `row-${index}` }),
		),
} satisfies SyntaxHighlighterProps;

// @type-case render
React.createElement(SyntaxHighlighter, props);
// @type-case light-register
Light.registerLanguage('javascript', javascript);
// @type-case prism-alias-name
PrismLight.alias('js', ['javascript', 'jsx']);
// @type-case prism-alias-map
PrismLight.alias({ js: 'javascript' });
// @type-case default-supported
SyntaxHighlighter.supportedLanguages.includes('javascript');
// @type-case prism-supported
Prism.supportedLanguages.includes('javascript');

// @type-case missing-children
// @ts-expect-error -- children/code is the only required public prop.
const missingChildren: SyntaxHighlighterProps = { language: 'javascript' };
// @type-case non-string-children
// @ts-expect-error -- the pinned declarations accept only string code.
const nonStringChildren: SyntaxHighlighterProps = { children: 42 };

void missingChildren;
void nonStringChildren;
