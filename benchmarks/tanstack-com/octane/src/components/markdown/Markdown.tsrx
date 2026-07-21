import { useMemo } from 'octane';
import { InlineCode, MarkdownImg } from '~/ui';
import { findFirstImageSrc, parseSiteMarkdown, type MarkdownDocument } from '~/utils/markdown';
import { isSafeHttpUrl } from '~/utils/url-boundary';
import { CodeBlock } from './CodeBlock.tsrx';
import { MarkdownLink } from './MarkdownLink.tsrx';
import { MdCommentComponent, MdFrameworkPanel, MdTabPanel } from './MdComponents.tsrx';
// Local octane transcription of `@tanstack/markdown/react` (that module is
// hard-wired to React's createElement).
import { renderMarkdown } from './renderMarkdown';

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
	const parsed = useMemo(() => document ?? parseSiteMarkdown(content ?? ''), [content, document]);

	return useMemo(() => {
		const firstImageSrc =
			eagerFirstImage ? findFirstImageSrc(parsed) : undefined;

		return renderMarkdown(parsed, {
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

function CodeFigure({ children }: { children?: any }) {
	return <>
		{children}
	</>;
}

function CodeFigcaption() {
	return null;
}

function createHeadingComponent(level: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
	function HeadingComponent({ children, className, id, ...props }: Record<string, any>) {
		const Tag = level;

		return <Tag
			id={id}
			class={`${className ?? ''} block scroll-my-20 lg:scroll-my-4`}
			{...props}
		>{children}</Tag>;
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

function MarkdownIframe(props: Record<string, any>) {
	if (!isTrustedIframeSrc(props.src)) {
		return null;
	}

	return <iframe {...props} class="w-full" title="Embedded Content" />;
}

function CodeElement({ children, className, ...props }: Record<string, any>) {
	if (className?.includes('language-')) {
		return <code class={className} {...props}>{children}</code>;
	}

	return <InlineCode className={className} {...props}>{children}</InlineCode>;
}

function LinkElement(props: Record<string, any>) {
	if (props.className?.includes('anchor-heading')) {
		return <a {...props} />;
	}

	return <MarkdownLink {...props} />;
}

function TableElement({ className, ...props }: Record<string, any>) {
	return <div class="w-full max-w-full overflow-x-auto">
		<table class={['min-w-full', className].filter(Boolean).join(' ')} {...props} />
	</div>;
}

function createMarkdownComponents(
	options: MarkdownRenderOptions & { firstImageSrc?: string } = {},
) {
	function MdCommentComponentWithOptions(props: Record<string, any>) {
		return <MdCommentComponent {...props} preserveTabPanels={options.preserveTabPanels} />;
	}

	function ImgElement(props: Record<string, any>) {
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
