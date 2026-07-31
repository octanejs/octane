import { createElement, type OctaneNode, useState } from 'octane';
import {
	Streamdown,
	type ExtraProps,
	type LinkSafetyModalProps,
	type CustomRendererProps,
} from '@octanejs/streamdown';
import type { Octane } from 'octane/jsx-runtime';

type HeadingProps = Octane.JSX.IntrinsicElements['h1'] & ExtraProps;
type InlineCodeProps = Octane.JSX.IntrinsicElements['code'] & ExtraProps;

function CustomHeading({ node, children, ...props }: HeadingProps) {
	return <h2 {...props} data-hast-node={node?.tagName} data-testid="custom-heading">{children}</h2>;
}

function CustomInlineCode({ node, children, ...props }: InlineCodeProps) {
	return <mark
		{...props}
		data-hast-node={node?.tagName}
		data-testid="custom-inline-code"
	>{children}</mark>;
}

function DemoRenderer({ code, isIncomplete, language, meta }: CustomRendererProps) {
	return <article
		data-incomplete={isIncomplete}
		data-language={language}
		data-meta={meta}
		data-testid="custom-renderer"
	>{code}</article>;
}

const customComponents = {
	h1: CustomHeading,
	inlineCode: CustomInlineCode,
};
const customRendererPlugins = {
	renderers: [
		{ component: DemoRenderer, language: 'demo' },
	],
};

export function HastComponentsParity({ content }: { content: string }) {
	return <Streamdown
		components={customComponents}
		controls={false}
		mode="static"
		plugins={customRendererPlugins}
	>{content}</Streamdown>;
}

export function FilteringParity({ content }: { content: string }) {
	return <Streamdown
		controls={false}
		disallowedElements={['em']}
		linkSafety={{ enabled: false }}
		mode="static"
		unwrapDisallowed
		urlTransform={(url) => `https://safe.invalid/?target=${encodeURIComponent(url)}`}
	>{content}</Streamdown>;
}

export function ControlsParity({ content }: { content: string }) {
	return <Streamdown
		controls={{
			code: { copy: true, download: true },
			table: { copy: true, download: true, fullscreen: true },
		}}
		linkSafety={{ enabled: false }}
		lineNumbers
		mode="static"
	>{content}</Streamdown>;
}

type Mode = 'static' | 'streaming';
type DocumentState = {
	content: string;
	mode: Mode;
};

export function ModeTransitionsParity({ content }: { content: string }) {
	const [document, setDocument] = useState<DocumentState>({
		content,
		mode: 'streaming',
	});

	return <section>
		<button
			id="to-static"
			onClick={() => setDocument({ content: '# Static\n\nComplete.', mode: 'static' })}
			type="button"
		>static</button>
		<button
			id="to-streaming"
			onClick={() => setDocument({ content: '# Streaming\n\nFirst block.', mode: 'streaming' })}
			type="button"
		>streaming</button>
		<button
			id="append-stream"
			onClick={() => setDocument(
				(current) => ({
					...current,
					content: `${current.content}\n\n## Appended\n\nSecond block.`,
				}),
			)}
			type="button"
		>append</button>
		<button
			id="shrink-stream"
			onClick={() => setDocument({ content: '# Short', mode: 'streaming' })}
			type="button"
		>shrink</button>
		<Streamdown
			controls={false}
			isAnimating={document.mode === 'streaming'}
			mode={document.mode}
		>{document.content}</Streamdown>
	</section>;
}

function SafetyModal({ isOpen, onClose, url }: LinkSafetyModalProps) {
	if (!isOpen) {
		return null;
	}
	return <aside data-testid="safety-modal">
		<output>{url}</output>
		<button id="close-safety-modal" onClick={onClose} type="button">close</button>
	</aside>;
}

const linkSafety = {
	enabled: true,
	renderModal: (props: LinkSafetyModalProps): OctaneNode => createElement(SafetyModal, props),
};

export function LinkSafetyParity({ content }: { content: string }) {
	return <Streamdown controls={false} linkSafety={linkSafety} mode="static">{content}</Streamdown>;
}

export function AnimationLifecycleParity() {
	const [isAnimating, setIsAnimating] = useState(false);
	const [starts, setStarts] = useState(0);
	const [ends, setEnds] = useState(0);

	return <section>
		<button id="start-animation" onClick={() => setIsAnimating(true)} type="button">start</button>
		<button id="stop-animation" onClick={() => setIsAnimating(false)} type="button">stop</button>
		<output data-testid="animation-events">{`${starts}:${ends}`}</output>
		<Streamdown
			controls={false}
			isAnimating={isAnimating}
			onAnimationEnd={() => setEnds((value) => value + 1)}
			onAnimationStart={() => setStarts((value) => value + 1)}
		>Animated content.</Streamdown>
	</section>;
}
