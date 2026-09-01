import { isChildrenBlock, type OctaneNode } from 'octane';
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';
import { renderMarkdown, type MarkdownStyles } from './markdown.ts';
import type { EmailElementProps, EmailStyle } from './types.ts';

loadLanguages();

function resolveTextChild(child: unknown): string {
	let value = child;
	if (typeof value === 'function' && !isChildrenBlock(value)) {
		value = (value as () => unknown)();
	}
	if (typeof value === 'string') return value;
	if (isChildrenBlock(child)) {
		throw new Error('Markdown children must be a string prop: use <Markdown children={"…"} />. ' +
			'JSX children compile to a children block, which is not a string.');
	}
	throw new Error('Markdown children must resolve to a string');
}

export type MarkdownProps =
	Readonly<Omit<EmailElementProps<HTMLDivElement>, 'children' | 'style'>> & Readonly<{
		children: string;
		markdownCustomStyles?: MarkdownStyles;
		markdownContainerStyles?: EmailStyle;
	}>;

export function Markdown(props: MarkdownProps) @{
	const {
		children: _children,
		markdownContainerStyles,
		markdownCustomStyles,
		ref,
		...rest
	} = props;
	<div
		{...rest}
		{...(ref === undefined ? {} : { ref })}
		data-id="react-email-markdown"
		style={markdownContainerStyles}
		dangerouslySetInnerHTML={{
			__html: renderMarkdown(resolveTextChild(props.children), markdownCustomStyles),
		}}
	/>
}

export type PrismLanguage = keyof typeof Prism.languages;
export type Theme = Record<string, EmailStyle | undefined> & { base?: EmailStyle };

export interface CodeBlockProps extends EmailElementProps<HTMLPreElement> {
	lineNumbers?: boolean;
	fontFamily?: string;
	theme: Theme;
	language: PrismLanguage;
	code: string;
}

type Token = string | Prism.Token;

function tokenStyle(token: Prism.Token, theme: Theme): EmailStyle {
	let style = { ...theme[token.type] };
	const aliases = Array.isArray(token.alias) ? token.alias : [token.alias];
	for (const alias of aliases) if (alias) style = { ...style, ...theme[alias] };
	return style;
}

function CodeToken({
	token,
	theme,
	inheritedStyle,
}: {
	token: Token;
	theme: Theme;
	inheritedStyle?: EmailStyle;
}): OctaneNode {
	if (typeof token === 'string') return <span style={inheritedStyle}>{token.replaceAll(
		' ',
		' ‍​',
	)}</span>;
	const style = { ...inheritedStyle, ...tokenStyle(token, theme) };
	if (Array.isArray(token.content)) return <>
		@for (const child of token.content; index childIndex; key childIndex) {
			<CodeToken token={child} theme={theme} inheritedStyle={style} />
		}
	</>;
	return <span style={style}>
		{typeof token.content === 'string'
			? token.content
			: <CodeToken token={token.content} theme={theme} inheritedStyle={style} />}
	</span>;
}

function CodeLine({
	tokens,
	lineNumber,
	lineNumbers,
	fontFamily,
	theme,
}: {
	tokens: Token[];
	lineNumber: number;
	lineNumbers: boolean;
	fontFamily?: string;
	theme: Theme;
}) @{
	<>
		@if (lineNumbers) {
			<span
				style={{ width: '2em', height: '1em', display: 'inline-block', fontFamily }}
			>{lineNumber}</span>
		}
		@for (const [tokenIndex, token] of tokens.entries(); key tokenIndex) {
			<CodeToken token={token} theme={theme} inheritedStyle={{ fontFamily }} />
		}
		<br />
	</>
}

export function CodeBlock({
	code,
	fontFamily,
	lineNumbers = false,
	theme,
	language,
	style,
	ref,
	...props
}: CodeBlockProps) @{
	const grammar = Prism.languages[language];
	if (
		grammar === undefined
	) throw new Error(`CodeBlock: There is no language defined on Prism called ${String(language)}`);
	const lines = code.split(/\r\n|\r|\n/gm).map((line) => Prism.tokenize(line, grammar));
	<pre
		{...props}
		{...(ref === undefined ? {} : { ref })}
		style={{ ...theme.base, width: '100%', ...style }}
	>
		<code>
			@for (const [lineIndex, tokens] of lines.entries(); key lineIndex) {
				<CodeLine
					tokens={tokens}
					lineNumber={lineIndex + 1}
					lineNumbers={lineNumbers}
					fontFamily={fontFamily}
					theme={theme}
				/>
			}
		</code>
	</pre>
}

export const vscDarkPlus: Theme = {
	base: {
		color: '#d4d4d4',
		fontSize: '13px',
		textShadow: 'none',
		fontFamily: 'Menlo, Monaco, Consolas, "Andale Mono", "Ubuntu Mono", "Courier New", monospace',
		direction: 'ltr',
		textAlign: 'left',
		whiteSpace: 'pre',
		wordSpacing: 'normal',
		wordBreak: 'normal',
		lineHeight: '1.5',
		tabSize: '4',
		hyphens: 'none',
		padding: '1em',
		margin: '.5em 0',
		overflow: 'auto',
		background: '#1e1e1e',
	},
	comment: { color: '#6a9955' },
	keyword: { color: '#569cd6' },
	boolean: { color: '#569cd6' },
	number: { color: '#b5cea8' },
	string: { color: '#ce9178' },
	operator: { color: '#d4d4d4' },
	punctuation: { color: '#d4d4d4' },
	function: { color: '#dcdcaa' },
	'class-name': { color: '#4ec9b0' },
};

export const xonokai: Theme = {
	base: {
		tabSize: '2',
		hyphens: 'none',
		whiteSpace: 'pre-wrap',
		wordWrap: 'normal',
		fontFamily: 'Menlo, Monaco, "Courier New", monospace',
		fontSize: '14px',
		color: '#76d9e6',
		textShadow: 'none',
		background: '#2a2a2a',
		padding: '15px',
		borderRadius: '4px',
		border: '1px solid #e1e1e8',
		overflow: 'auto',
		position: 'relative',
	},
	comment: { color: '#6f705e' },
	operator: { color: '#a77afe' },
	boolean: { color: '#a77afe' },
	number: { color: '#a77afe' },
	string: { color: '#e6d06c' },
	keyword: { color: '#ef3b7d' },
	punctuation: { color: '#bebec5' },
};
