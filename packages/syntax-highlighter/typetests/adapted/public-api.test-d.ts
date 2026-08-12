import { createElement as createOctaneElement } from 'octane';
import SyntaxHighlighter, {
	Light,
	LightAsync,
	Prism,
	PrismAsync,
	PrismLight,
	createElement,
	type SyntaxHighlighterProps,
} from '@octanejs/syntax-highlighter';
import javascript from '@octanejs/syntax-highlighter/dist/esm/languages/hljs/javascript';
import github from '@octanejs/syntax-highlighter/dist/esm/styles/hljs/github';

// @type-case props
const props = {
	language: 'javascript',
	children: 'const answer = 42;',
	style: github,
	showLineNumbers: true,
	lineNumberStyle: (line: number) => ({ color: line > 1 ? 'red' : 'blue' }),
	lineProps: (line: number) => ({ id: `line-${line}` }),
	PreTag: (componentProps: Record<string, unknown>) =>
		createOctaneElement('section', componentProps),
	CodeTag: 'samp',
	renderer: ({ rows, stylesheet, useInlineStyles }) =>
		rows.map((node, index) =>
			createElement({ node, stylesheet, useInlineStyles, key: `row-${index}` }),
		),
} satisfies SyntaxHighlighterProps;

// @type-case render
createOctaneElement(SyntaxHighlighter, props);
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
// @type-case async-preload adapted-only
await LightAsync.preload();
// @type-case async-load-language adapted-only
await LightAsync.loadLanguage('javascript');
// @type-case async-supported adapted-only
LightAsync.isSupportedLanguage('javascript');
// @type-case async-registered adapted-only
LightAsync.isRegistered('javascript');

// @type-case light-no-supported adapted-only
// @ts-expect-error -- Light exposes registration, not a supported-language inventory.
Light.supportedLanguages;
// @type-case prism-async-no-register adapted-only
// @ts-expect-error -- PrismAsync cannot register languages.
PrismAsync.registerLanguage('javascript', javascript);
// @type-case prism-light-no-supported adapted-only
// @ts-expect-error -- PrismLight exposes registration and aliases, not an inventory.
PrismLight.supportedLanguages;

// @type-case missing-children
// @ts-expect-error -- children/code is the only required public prop.
const missingChildren: SyntaxHighlighterProps = { language: 'javascript' };
// @type-case non-string-children
// @ts-expect-error -- the pinned declarations accept only string code.
const nonStringChildren: SyntaxHighlighterProps = { children: 42 };

void missingChildren;
void nonStringChildren;
