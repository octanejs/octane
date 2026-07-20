import { renderMarkdownReact } from '@tanstack/markdown/react';
import * as React from 'react';
import { InlineCode, MarkdownImg } from '~/ui';
import { findFirstImageSrc, parseSiteMarkdown, type MarkdownDocument } from '~/utils/markdown';
import { isSafeHttpUrl } from '~/utils/url-boundary';
import { CodeBlock } from './CodeBlock';
import { MarkdownLink } from './MarkdownLink';
import { MdCommentComponent, MdFrameworkPanel, MdTabPanel } from './MdComponents';

type MarkdownRenderOptions = {
	preserveTabPanels?: boolean;
};

export type MarkdownProps = {
	content?: string;
	document?: MarkdownDocument;
	preserveTabPanels?: boolean;
	/** Render the first image in the document as high-priority/eager (e.g. blog post hero images) */
	eagerFirstImage?: boolean;
};

export function Markdown({ content, document, preserveTabPanels, eagerFirstImage }: MarkdownProps) {
	const parsed = React.useMemo(
		() => document ?? parseSiteMarkdown(content ?? ''),
		[content, document],
	);

	return React.useMemo(() => {
		const firstImageSrc = eagerFirstImage ? findFirstImageSrc(parsed) : undefined;

		return renderMarkdownReact(parsed, {
			allowHtml: true,
			components: createMarkdownComponents({
				preserveTabPanels,
				firstImageSrc,
			}),
			headingAnchors,
		});
	}, [parsed, preserveTabPanels, eagerFirstImage]);
}

const headingAnchors = {
	ariaHidden: true,
	className: 'anchor-heading anchor-heading-link',
	content: '#',
	tabIndex: -1,
};

function CodeFigure({ children }: { children?: React.ReactNode }) {
	return <>{children}</>;
}

function CodeFigcaption() {
	return null;
}

function createHeadingComponent(level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
	function HeadingComponent({
		children,
		className,
		id,
		...props
	}: React.HTMLAttributes<HTMLHeadingElement>) {
		const Tag = level;

		return (
			<Tag id={id} className={`${className ?? ''} block scroll-my-20 lg:scroll-my-4`} {...props}>
				{children}
			</Tag>
		);
	}

	HeadingComponent.displayName = `Heading${level.toUpperCase()}`;

	return HeadingComponent;
}

const trustedIframeHosts = [
	'codesandbox.io',
	'stackblitz.com',
	'www.youtube.com',
	'youtube.com',
	'www.youtube-nocookie.com',
	'youtube-nocookie.com',
	'player.vimeo.com',
];

function isTrustedIframeSrc(src: string | undefined) {
	if (!src || !isSafeHttpUrl(src)) {
		return false;
	}

	try {
		const url = new URL(src);
		return trustedIframeHosts.some(
			(host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
		);
	} catch {
		return false;
	}
}

function MarkdownIframe(props: React.IframeHTMLAttributes<HTMLIFrameElement>) {
	if (!isTrustedIframeSrc(props.src)) {
		return null;
	}

	return <iframe {...props} className="w-full" title="Embedded Content" />;
}

function CodeElement({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) {
	if (className?.includes('language-')) {
		return (
			<code className={className} {...props}>
				{children}
			</code>
		);
	}

	return (
		<InlineCode className={className} {...props}>
			{children}
		</InlineCode>
	);
}

function LinkElement(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
	if (props.className?.includes('anchor-heading')) {
		// eslint-disable-next-line jsx-a11y/anchor-has-content
		return <a {...props} />;
	}

	return <MarkdownLink {...props} />;
}

function TableElement({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
	return (
		<div className="w-full max-w-full overflow-x-auto">
			<table className={['min-w-full', className].filter(Boolean).join(' ')} {...props} />
		</div>
	);
}

function createMarkdownComponents(
	options: MarkdownRenderOptions & { firstImageSrc?: string } = {},
) {
	function MdCommentComponentWithOptions(props: React.ComponentProps<typeof MdCommentComponent>) {
		return <MdCommentComponent {...props} preserveTabPanels={options.preserveTabPanels} />;
	}

	function ImgElement(props: React.ComponentProps<typeof MarkdownImg>) {
		const isFirstImage = options.firstImageSrc !== undefined && props.src === options.firstImageSrc;

		return <MarkdownImg {...props} priority={isFirstImage} />;
	}

	return {
		a: LinkElement,
		code: CodeElement,
		figcaption: CodeFigcaption,
		figure: CodeFigure,
		h1: createHeadingComponent('h1'),
		h2: createHeadingComponent('h2'),
		h3: createHeadingComponent('h3'),
		h4: createHeadingComponent('h4'),
		h5: createHeadingComponent('h5'),
		h6: createHeadingComponent('h6'),
		iframe: MarkdownIframe,
		img: ImgElement,
		'md-comment-component': MdCommentComponentWithOptions,
		'md-framework-panel': MdFrameworkPanel,
		'md-tab-panel': MdTabPanel,
		pre: CodeBlock,
		table: TableElement,
	};
}
