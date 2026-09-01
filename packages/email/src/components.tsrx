import type { OctaneNode } from 'octane';
import type { EmailElementProps, EmailStyle } from './types.ts';
import { computeOutlookSpacing, parseButtonPadding, pixelsToPoints } from './button-utils.ts';
import { computeMargins, splitPadding, withMargins } from './utils.ts';

function withRef<T>(ref: ((element: T | null) => void) | { current: T | null } | null | undefined) {
	return ref === undefined ? {} : { ref };
}

export type BodyProps = EmailElementProps<HTMLBodyElement>;
export function Body({ children, style = {}, ref, ...props }: BodyProps) @{
	const reset: EmailStyle = {
		background: style.background,
		backgroundColor: style.backgroundColor,
	};
	for (const key of [
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
	]) {
		if ((style as Record<string, unknown>)[key] !== undefined) (reset as Record<
			string,
			unknown
		>)[key] = 0;
	}
	<body
		{...props}
		{...withRef(ref)}
		dir={props.dir as string | undefined ?? 'ltr'}
		lang={props.lang as string | undefined ?? 'en'}
		style={reset}
	>
		<table
			border={0}
			width="100%"
			cellPadding="0"
			cellSpacing="0"
			role="presentation"
			align="center"
		>
			<tbody>
				<tr>
					<td
						dir={props.dir as string | undefined ?? 'ltr'}
						lang={props.lang as string | undefined ?? 'en'}
						style={style}
					>{children}</td>
				</tr>
			</tbody>
		</table>
	</body>
}

export type HtmlProps = EmailElementProps<HTMLHtmlElement> & { lang?: string; dir?: string };
export function Html({ children, lang = 'en', dir = 'ltr', ref, ...props }: HtmlProps) @{
	<html {...props} {...withRef(ref)} dir={dir} lang={lang}>{children}</html>
}

export type HeadProps = EmailElementProps<HTMLHeadElement>;
export function Head({ children }: HeadProps) @{
	<>
		<meta content="text/html; charset=UTF-8" httpEquiv="Content-Type" />
		<meta name="x-apple-disable-message-reformatting" />
		{/* Octane forbids authored <head>; render() extracts this temporary carrier. */}
		<body data-octane-email-head="head">{children}</body>
	</>
}

export type ContainerProps = EmailElementProps<HTMLTableElement>;
export function Container({ children, style = {}, ref, ...props }: ContainerProps) @{
	const [cellStyle, tableStyle] = splitPadding(style);
	<table
		align="center"
		width="100%"
		{...props}
		{...withRef(ref)}
		border={0}
		cellPadding="0"
		cellSpacing="0"
		role="presentation"
		style={{ maxWidth: '37.5em', ...tableStyle }}
	>
		<tbody>
			<tr style={{ width: '100%' }}>
				<td style={cellStyle}>{children}</td>
			</tr>
		</tbody>
	</table>
}

export type SectionProps = EmailElementProps<HTMLTableElement>;
export function Section({ children, style = {}, ref, ...props }: SectionProps) @{
	const [cellStyle, tableStyle] = splitPadding(style);
	<table
		align="center"
		width="100%"
		border={0}
		cellPadding="0"
		cellSpacing="0"
		role="presentation"
		{...props}
		{...withRef(ref)}
		style={tableStyle}
	>
		<tbody>
			<tr>
				<td style={cellStyle}>{children}</td>
			</tr>
		</tbody>
	</table>
}

export type RowProps = EmailElementProps<HTMLTableElement>;
export function Row({ children, style, ref, ...props }: RowProps) @{
	<table
		align="center"
		width="100%"
		border={0}
		cellPadding="0"
		cellSpacing="0"
		role="presentation"
		{...props}
		{...withRef(ref)}
		style={style}
	>
		<tbody style={{ width: '100%' }}>
			<tr style={{ width: '100%' }}>{children}</tr>
		</tbody>
	</table>
}

export type ColumnProps = EmailElementProps<HTMLTableCellElement>;
export function Column({ children, style, ref, ...props }: ColumnProps) @{
	<td {...props} {...withRef(ref)} data-id="__react-email-column" style={style}>{children}</td>
}

export type TextProps = EmailElementProps<HTMLParagraphElement>;
export function Text({ style = {}, ref, ...props }: TextProps) @{
	const defaults: EmailStyle = {};
	if (style.marginTop === undefined) defaults.marginTop = '16px';
	if (style.marginBottom === undefined) defaults.marginBottom = '16px';
	const margins = computeMargins({ ...defaults, ...style });
	<p
		{...props}
		{...withRef(ref)}
		style={{ fontSize: '14px', lineHeight: '24px', ...style, ...margins }}
	/>
}

export type LinkProps = EmailElementProps<HTMLAnchorElement> & { href?: string; target?: string };
export function Link({ children, target = '_blank', style, ref, ...props }: LinkProps) @{
	<a
		{...props}
		{...withRef(ref)}
		style={{ color: '#067df7', textDecorationLine: 'none', ...style }}
		target={target}
	>{children}</a>
}

export type ImgProps =
	EmailElementProps<HTMLImageElement> & {
		alt?: string;
		src?: string;
		width?: string | number;
		height?: string | number;
	};
export function Img({ alt = '', src, width, height, style, ref, ...props }: ImgProps) @{
	<img
		{...props}
		{...withRef(ref)}
		alt={alt}
		height={height}
		src={src}
		style={{ display: 'block', outline: 'none', border: 'none', textDecoration: 'none', ...style }}
		width={width}
	/>
}

export type HrProps = EmailElementProps<HTMLHRElement>;
export function Hr({ style, ref, ...props }: HrProps) @{
	<hr
		{...props}
		{...withRef(ref)}
		style={{
			width: '100%',
			border: 'none',
			borderColor: 'transparent',
			borderTop: '1px solid #eaeaea',
			...style,
		}}
	/>
}

export type HeadingProps =
	EmailElementProps<HTMLHeadingElement> & {
		as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
		m?: string | number;
		mx?: string | number;
		my?: string | number;
		mt?: string | number;
		mr?: string | number;
		mb?: string | number;
		ml?: string | number;
	};
export function Heading({
	as: Tag = 'h1',
	children,
	style,
	ref,
	m,
	mx,
	my,
	mt,
	mr,
	mb,
	ml,
	...props
}: HeadingProps) @{
	<Tag
		{...props}
		{...withRef(ref)}
		style={{ ...withMargins({ m, mx, my, mt, mr, mb, ml }), ...style }}
	>{children}</Tag>
}

export interface FontProps {
	fontFamily: string;
	fallbackFontFamily: string | string[];
	webFont?: {
		url: string;
		format: 'woff' | 'woff2' | 'truetype' | 'opentype' | 'embedded-opentype' | 'svg';
	};
	fontStyle?: string;
	fontWeight?: string | number;
}
export function Font({
	fontFamily,
	fallbackFontFamily,
	webFont,
	fontStyle = 'normal',
	fontWeight = 400,
}: FontProps) @{
	const fallbacks = Array.isArray(fallbackFontFamily) ? fallbackFontFamily : [fallbackFontFamily];
	const source = webFont ? `src: url(${webFont.url}) format('${webFont.format}');` : '';
	const css = `\n    @font-face {\n      font-family: '${fontFamily}';\n      font-style: ${fontStyle};\n      font-weight: ${fontWeight};\n      mso-font-alt: '${fallbacks[0]}';\n      ${source}\n    }\n\n    * {\n      font-family: '${fontFamily}', ${fallbacks.join(
		', ',
	)};\n    }\n  `;
	// A dynamic host keeps email CSS global instead of entering Octane's scoped-style pipeline.
	const Style = 'style';
	<Style dangerouslySetInnerHTML={{ __html: css }} />
}

const PREVIEW_MAX_LENGTH = 200;
const WHITE_SPACE = ' ‌​‍‎‏﻿';
export type PreviewProps =
	Readonly<Omit<EmailElementProps<HTMLDivElement>, 'children'>> & Readonly<{
		text?: string;
		children?: string | string[];
		useTitleTag?: boolean;
	}>;
export function Preview({
	text: explicitText,
	children = '',
	useTitleTag = true,
	ref,
	...props
}: PreviewProps) @{
	const childText =
		Array.isArray(children)
			? children.join('')
			: typeof children === 'string'
				? children
				: '';
	const text = (explicitText ?? childText).substring(0, PREVIEW_MAX_LENGTH);
	<>
		@if (useTitleTag) {
			<title>{text}</title>
		}
		<div
			style={{
				display: 'none',
				overflow: 'hidden',
				lineHeight: '1px',
				opacity: 0,
				maxHeight: 0,
				maxWidth: 0,
			}}
			data-skip-in-text={true}
			{...props}
			{...withRef(ref)}
		>
			{text}
			@if (text.length < PREVIEW_MAX_LENGTH) {
				<div>{WHITE_SPACE.repeat(PREVIEW_MAX_LENGTH - text.length)}</div>
			}
		</div>
	</>
}

export type CodeInlineProps = EmailElementProps<HTMLElement>;
export function CodeInline({ children, style, ref, ...props }: CodeInlineProps) @{
	<code
		{...props}
		{...withRef(ref)}
		style={{
			display: 'inline',
			background: 'rgba(135,131,120,0.15)',
			padding: '2px 4px',
			borderRadius: '4px',
			...style,
		}}
	>{children}</code>
}

export type ButtonProps = EmailElementProps<HTMLAnchorElement> & { href?: string; target?: string };
export function Button({ children, style = {}, target = '_blank', ref, ...props }: ButtonProps) @{
	const [paddingTop, paddingRight, paddingBottom, paddingLeft] = parseButtonPadding(style);
	const textRaise = pixelsToPoints((paddingTop ?? 0) + (paddingBottom ?? 0));
	const [leftFontWidth, leftSpaceCount] = computeOutlookSpacing(paddingLeft ?? 0);
	const [rightFontWidth, rightSpaceCount] = computeOutlookSpacing(paddingRight ?? 0);
	const buttonStyle: EmailStyle = {
		lineHeight: '100%',
		textDecoration: 'none',
		display: 'inline-block',
		maxWidth: '100%',
		msoPaddingAlt: '0px',
		...style,
		paddingTop,
		paddingRight,
		paddingBottom,
		paddingLeft,
	};
	const labelStyle: EmailStyle = {
		maxWidth: '100%',
		display: 'inline-block',
		lineHeight: '120%',
		msoPaddingAlt: '0px',
		msoTextRaise: pixelsToPoints(paddingBottom),
	};
	<a {...props} {...withRef(ref)} style={buttonStyle} target={target}>
		<span
			dangerouslySetInnerHTML={{
				__html: `<!--[if mso]><i style="mso-font-width:${
					leftFontWidth * 100
				}%;mso-text-raise:${textRaise}px" hidden>${'&#8202;'.repeat(
					leftSpaceCount,
				)}</i><![endif]-->`,
			}}
		/>
		<span style={labelStyle}>{children}</span>
		<span
			dangerouslySetInnerHTML={{
				__html: `<!--[if mso]><i style="mso-font-width:${
					rightFontWidth * 100
				}%" hidden>${'&#8202;'.repeat(rightSpaceCount)}&#8203;</i><![endif]-->`,
			}}
		/>
	</a>
}

export type { OctaneNode };
