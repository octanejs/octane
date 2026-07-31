import type { ComponentBody } from 'octane';
import { expectTypeOf } from 'vitest';
import {
	Streamdown,
	type StreamdownProps,
	type StreamdownTranslations,
} from '@octanejs/streamdown';
import { code, createCodePlugin, type CodeHighlighterPlugin } from '@octanejs/streamdown/code';
import { cjk, type CjkPlugin } from '@octanejs/streamdown/cjk';
import { math, type MathPlugin } from '@octanejs/streamdown/math';
import { createMermaidPlugin, mermaid, type DiagramPlugin } from '@octanejs/streamdown/mermaid';

const checkPublicTypes = () => {
	type ParagraphComponent = Exclude<
		NonNullable<StreamdownProps['components']>['p'],
		string | undefined
	>;
	const paragraph = (() => undefined) as ParagraphComponent;
	const translations: Partial<StreamdownTranslations> = {
		copyCode: 'Copy source',
	};
	const props: StreamdownProps = {
		children: '# Typed',
		mode: 'streaming',
		dir: 'auto',
		components: { p: paragraph },
		plugins: { cjk, code, math, mermaid },
		controls: {
			table: { copy: true, download: false, fullscreen: true },
			code: { copy: true, download: true },
			mermaid: { copy: true, download: true, fullscreen: true, panZoom: true },
		},
		allowedTags: { mention: ['user_id'] },
		literalTagContent: ['mention'],
		translations,
		linkSafety: {
			enabled: true,
			onLinkCheck: async (url) => url.startsWith('https://'),
		},
		onAnimationStart: () => {},
		onAnimationEnd: () => {},
	};

	expectTypeOf(Streamdown).toMatchTypeOf<ComponentBody<StreamdownProps>>();
	void props;
	expectTypeOf(createCodePlugin()).toEqualTypeOf<CodeHighlighterPlugin>();
	expectTypeOf(cjk).toEqualTypeOf<CjkPlugin>();
	expectTypeOf(math).toEqualTypeOf<MathPlugin>();
	expectTypeOf(createMermaidPlugin()).toEqualTypeOf<DiagramPlugin>();

	// @ts-expect-error Streamdown accepts only its two documented rendering modes.
	const invalidMode: StreamdownProps = { mode: 'incremental' };
	// @ts-expect-error Markdown children are source text, not an arbitrary renderable.
	const invalidChildren: StreamdownProps = { children: 42 };
	// @ts-expect-error Animation lifecycle callbacks do not receive an event payload.
	const invalidAnimationCallback: StreamdownProps = { onAnimationStart: (_event: Event) => {} };
	// @ts-expect-error The code slot requires the official highlighter contract.
	const invalidPlugin: StreamdownProps = { plugins: { code: math } };
	void invalidMode;
	void invalidChildren;
	void invalidAnimationCallback;
	void invalidPlugin;
};

void checkPublicTypes;
