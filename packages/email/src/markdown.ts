import { marked, Renderer } from 'marked';
import type { EmailStyle } from './types.ts';

export type MarkdownStyles = Readonly<{
	h1?: EmailStyle;
	h2?: EmailStyle;
	h3?: EmailStyle;
	h4?: EmailStyle;
	h5?: EmailStyle;
	h6?: EmailStyle;
	blockQuote?: EmailStyle;
	bold?: EmailStyle;
	italic?: EmailStyle;
	link?: EmailStyle;
	codeBlock?: EmailStyle;
	codeInline?: EmailStyle;
	p?: EmailStyle;
	li?: EmailStyle;
	ul?: EmailStyle;
	ol?: EmailStyle;
	image?: EmailStyle;
	br?: EmailStyle;
	hr?: EmailStyle;
	table?: EmailStyle;
	thead?: EmailStyle;
	tbody?: EmailStyle;
	tr?: EmailStyle;
	th?: EmailStyle;
	td?: EmailStyle;
	strikethrough?: EmailStyle;
}>;

const heading = { fontWeight: '500', paddingTop: 20 };
export const markdownStyles: MarkdownStyles = {
	h1: { ...heading, fontSize: '2.5rem' },
	h2: { ...heading, fontSize: '2rem' },
	h3: { ...heading, fontSize: '1.75rem' },
	h4: { ...heading, fontSize: '1.5rem' },
	h5: { ...heading, fontSize: '1.25rem' },
	h6: { ...heading, fontSize: '1rem' },
	blockQuote: {
		background: '#f9f9f9',
		borderLeft: '10px solid #ccc',
		margin: '1.5em 10px',
		padding: '1em 10px',
	},
	bold: { fontWeight: 'bold' },
	italic: { fontStyle: 'italic' },
	link: { color: '#007bff', textDecoration: 'underline', backgroundColor: 'transparent' },
	codeBlock: {
		color: '#212529',
		fontSize: '87.5%',
		display: 'block',
		background: ' #f8f8f8',
		fontFamily: 'SFMono-Regular,Menlo,Monaco,Consolas,monospace',
		paddingTop: 10,
		paddingRight: 10,
		paddingLeft: 10,
		paddingBottom: 1,
		marginBottom: 20,
		wordWrap: 'break-word',
	},
	codeInline: {
		color: '#212529',
		fontSize: '87.5%',
		display: 'inline',
		background: ' #f8f8f8',
		fontFamily: 'SFMono-Regular,Menlo,Monaco,Consolas,monospace',
		wordWrap: 'break-word',
	},
};

const pixelProperties = new Set([
	'width',
	'height',
	'margin',
	'marginTop',
	'marginRight',
	'marginBottom',
	'marginLeft',
	'padding',
	'paddingTop',
	'paddingRight',
	'paddingBottom',
	'paddingLeft',
	'borderWidth',
	'borderTopWidth',
	'borderRightWidth',
	'borderBottomWidth',
	'borderLeftWidth',
	'outlineWidth',
	'top',
	'right',
	'bottom',
	'left',
	'fontSize',
	'letterSpacing',
	'wordSpacing',
	'maxWidth',
	'minWidth',
	'maxHeight',
	'minHeight',
	'borderRadius',
	'borderTopLeftRadius',
	'borderTopRightRadius',
	'borderBottomLeftRadius',
	'borderBottomRightRadius',
	'textIndent',
	'gridColumnGap',
	'gridRowGap',
	'gridGap',
	'translateX',
	'translateY',
]);

function inlineStyle(style: EmailStyle | undefined): string {
	if (!style) return '';
	return Object.entries(style)
		.map(([property, value]) => {
			const name = property.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
			const serialized =
				typeof value === 'number' && pixelProperties.has(property)
					? `${value}px`
					: String(value).replaceAll('"', '&quot;');
			return `${name}:${serialized}`;
		})
		.join(';');
}

const styleAttribute = (style: EmailStyle | undefined) => {
	const css = inlineStyle(style);
	return css ? ` style="${css}"` : '';
};
const styled = (tag: string, style: EmailStyle | undefined) => `${tag}${styleAttribute(style)}`;
const escapeAttribute = (value: string) => escapeHtml(value);

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

export function renderMarkdown(source: string, customStyles?: MarkdownStyles): string {
	const finalStyles = { ...markdownStyles, ...customStyles };
	const renderer = new Renderer();
	renderer.blockquote = ({ tokens }) =>
		`<${styled('blockquote', finalStyles.blockQuote)}>\n${renderer.parser.parse(tokens)}</blockquote>\n`;
	renderer.br = () => `<${styled('br', finalStyles.br)} />`;
	renderer.code = ({ text }) =>
		`<${styled('pre', finalStyles.codeBlock)}><code>${escapeHtml(text.replace(/\n$/, ''))}\n</code></pre>\n`;
	renderer.codespan = ({ text }) =>
		`<${styled('code', finalStyles.codeInline)}>${escapeHtml(text)}</code>`;
	renderer.del = ({ tokens }) =>
		`<${styled('del', finalStyles.strikethrough)}>${renderer.parser.parseInline(tokens)}</del>`;
	renderer.em = ({ tokens }) =>
		`<${styled('em', finalStyles.italic)}>${renderer.parser.parseInline(tokens)}</em>`;
	renderer.heading = ({ tokens, depth }) =>
		`<${styled(`h${depth}`, finalStyles[`h${depth}` as keyof MarkdownStyles])}>${renderer.parser.parseInline(tokens)}</h${depth}>`;
	renderer.hr = () => `<${styled('hr', finalStyles.hr)} />\n`;
	renderer.image = ({ href, text, title }) =>
		`<img src="${escapeAttribute(href)}" alt="${escapeAttribute(text)}"${title ? ` title="${escapeAttribute(title)}"` : ''}${styleAttribute(finalStyles.image)}>`;
	renderer.link = ({ href, title, tokens }) =>
		`<a href="${escapeAttribute(href)}" target="_blank"${title ? ` title="${escapeAttribute(title)}"` : ''}${styleAttribute(finalStyles.link)}>${renderer.parser.parseInline(tokens)}</a>`;
	renderer.listitem = ({ tokens, loose }) =>
		`<${styled('li', finalStyles.li)}>${loose || tokens.some((token) => token.type === 'list') ? renderer.parser.parse(tokens) : renderer.parser.parseInline(tokens)}</li>\n`;
	renderer.list = ({ items, ordered, start }) => {
		const tag = ordered ? 'ol' : 'ul';
		return `<${styled(tag + (ordered && start !== 1 ? ` start="${start}"` : ''), finalStyles[tag as 'ol' | 'ul'])}>\n${items.map((item) => renderer.listitem(item)).join('')}</${tag}>\n`;
	};
	renderer.paragraph = ({ tokens }) =>
		`<${styled('p', finalStyles.p)}>${renderer.parser.parseInline(tokens)}</p>\n`;
	renderer.strong = ({ tokens }) =>
		`<${styled('strong', finalStyles.bold)}>${renderer.parser.parseInline(tokens)}</strong>`;
	renderer.table = ({ header, rows }) => {
		const headRow = renderer.tablerow({
			text: header.map((cell) => renderer.tablecell(cell)).join(''),
		});
		const bodyRows = rows
			.map((row) =>
				renderer.tablerow({ text: row.map((cell) => renderer.tablecell(cell)).join('') }),
			)
			.join('');
		return `<${styled('table role="presentation"', finalStyles.table)}>\n<${styled('thead', finalStyles.thead)}>\n${headRow}</thead>\n<${styled('tbody', finalStyles.tbody)}>${bodyRows}</tbody></table>\n`;
	};
	renderer.tablecell = ({ tokens, align, header }) => {
		const tag = header ? 'th' : 'td';
		return `<${styled(`${tag}${align ? ` align="${align}"` : ''}`, finalStyles[tag])}>${renderer.parser.parseInline(tokens)}</${tag}>\n`;
	};
	renderer.tablerow = ({ text }) => `<${styled('tr', finalStyles.tr)}>\n${text}</tr>\n`;
	return marked.parse(source, { renderer, async: false });
}
