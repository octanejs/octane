import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import {
	$createParagraphNode,
	$createTextNode,
	$getNodeByKey,
	$getRoot,
	$isTextNode,
	PASTE_COMMAND,
	PASTE_TAG,
	type LexicalEditor,
	type NodeKey,
} from 'lexical';
import { createPortal } from 'octane';
import {
	AutoEmbedOption,
	type EmbedConfig,
	type EmbedMatchResult,
	URL_MATCHER,
} from '@octanejs/lexical/LexicalAutoEmbedPlugin';
import { createLinkMatcherWithRegExp } from '@octanejs/lexical/LexicalAutoLinkPlugin';
import type { MenuRenderFn } from '@octanejs/lexical';
import { mount, flushEffects, nextPaint } from '../_helpers';
import { AutoEmbedEditor, AutoEmbedMenuBody } from '../_fixtures/auto-embed-editor.tsrx';

type MountResult = ReturnType<typeof mount>;

// Ported from @lexical/react/src/__tests__/unit/LexicalAutoEmbedPlugin.test.tsx (0.51.0).
// All nine upstream cases are ported. jsdom implements neither ClipboardEvent,
// DataTransfer nor DragEvent; upstream's vitest.setup.mts stubs them, so this
// file installs equivalent stubs, each named after the real constructor
// because Lexical's objectKlassEquals compares constructor names.
// lexical/src/__tests__/utils' $assertNodeType is not shipped in the npm
// package, so the one use is inlined.

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const SHORT_YOUTUBE_URL = 'youtu.be/jNQXAC9IVRw';
const MATCHERS = [
	createLinkMatcherWithRegExp(URL_MATCHER),
	// A scheme-less matcher, broader than URL_MATCHER, as an app might add.
	createLinkMatcherWithRegExp(/youtu\.be\/[\w-]+/),
];

const menuRenderFn: MenuRenderFn<AutoEmbedOption> = (anchorElementRef, { options }) =>
	anchorElementRef.current && options.length
		? createPortal(AutoEmbedMenuBody as any, anchorElementRef.current, { options })
		: null;

const getMenuOptions = (_config: EmbedConfig, embedFn: () => void) => [
	new AutoEmbedOption('Embed', { onSelect: embedFn }),
];

function named<T extends Function>(name: string, klass: T): T {
	return Object.defineProperty(klass, 'name', { value: name });
}

class DataTransferStub {
	_data = new Map<string, string>();
	get types(): readonly string[] {
		return [...this._data.keys()];
	}
	get files(): File[] {
		return [];
	}
	getData(type: string): string {
		return this._data.get(type.toLowerCase()) || '';
	}
	setData(type: string, value: string): void {
		this._data.set(type.toLowerCase(), value);
	}
	clearData(): void {
		this._data.clear();
	}
	setDragImage(): void {}
}

class ClipboardEventStub extends Event {
	clipboardData: DataTransferStub | null;
	constructor(type: string, options?: EventInit & { clipboardData?: DataTransferStub | null }) {
		super(type, options);
		this.clipboardData = (options && options.clipboardData) || null;
	}
}

class DragEventStub extends MouseEvent {
	dataTransfer: DataTransferStub | null = null;
}

class ResizeObserverMock {
	// LexicalMenu only constructs ResizeObserver and calls observe/unobserve/disconnect.
	constructor(_callback: unknown) {}
	observe() {}
	unobserve() {}
	disconnect() {}
}

function createPasteEvent(data: Record<string, string>): ClipboardEvent {
	const clipboardData = new (globalThis as any).DataTransfer();
	for (const [type, value] of Object.entries(data)) {
		clipboardData.setData(type, value);
	}
	return new (globalThis as any).ClipboardEvent('paste', { clipboardData });
}

async function settle() {
	for (let i = 0; i < 6; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
		flushEffects();
	}
}

describe('LexicalAutoEmbedPlugin', () => {
	let mounted: MountResult;
	let editor: LexicalEditor;
	let onError: Mock<(error: Error) => void>;
	let parseUrl: Mock<(url: string) => EmbedMatchResult | null>;

	beforeEach(async () => {
		vi.stubGlobal('ResizeObserver', ResizeObserverMock);
		vi.stubGlobal('DataTransfer', named('DataTransfer', DataTransferStub));
		vi.stubGlobal('ClipboardEvent', named('ClipboardEvent', ClipboardEventStub));
		if (typeof (globalThis as any).DragEvent !== 'function') {
			vi.stubGlobal('DragEvent', named('DragEvent', DragEventStub));
		}

		onError = vi.fn((error: Error) => {
			throw error;
		});
		parseUrl = vi.fn((url: string) => {
			const match = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/.exec(url);
			return match ? { id: match[1], url } : null;
		});
		const embedConfig: EmbedConfig = {
			insertNode: vi.fn(),
			parseUrl,
			type: 'youtube-video',
		};
		const editorRef: { current: LexicalEditor | null } = { current: null };

		mounted = mount(AutoEmbedEditor as any, {
			editorRef,
			embedConfigs: [embedConfig],
			getMenuOptions,
			matchers: MATCHERS,
			menuRenderFn,
			onError,
		});
		await settle();
		editor = editorRef.current!;
		expect(editor).not.toBeNull();
	});

	afterEach(() => {
		mounted.unmount();
		vi.unstubAllGlobals();
	});

	async function pasteEvent(
		event: ClipboardEvent,
		$select: () => void = () => void $getRoot().selectEnd(),
	): Promise<void> {
		editor.update(
			() => {
				$select();
				editor.dispatchCommand(PASTE_COMMAND, event);
			},
			{ discrete: true },
		);
		// Let the async parseUrl check and the menu positioning settle.
		await settle();
	}

	function paste(data: Record<string, string>, $select?: () => void): Promise<void> {
		return pasteEvent(createPasteEvent(data), $select);
	}

	function getMenu(): Element | null {
		return document.querySelector('[data-testid="auto-embed-menu"]');
	}

	it('offers to embed a bare URL pasted as plain text', async () => {
		await paste({ 'text/plain': YOUTUBE_URL });

		expect(parseUrl).toHaveBeenCalledWith(YOUTUBE_URL);
		expect(getMenu()).not.toBeNull();
	});

	it('does not offer to embed a pasted sentence that contains a URL', async () => {
		await paste({
			'text/html': `<p>Look at this <a href="${YOUTUBE_URL}">${YOUTUBE_URL}</a> please</p>`,
			'text/plain': `Look at this ${YOUTUBE_URL} please`,
		});

		expect(parseUrl).not.toHaveBeenCalled();
		expect(getMenu()).toBeNull();
	});

	it('does not offer to embed a pasted plain text sentence that contains a URL', async () => {
		await paste({ 'text/plain': `Look at this ${YOUTUBE_URL} please` });

		expect(parseUrl).not.toHaveBeenCalled();
		expect(getMenu()).toBeNull();
	});

	it('offers to embed a copied link whose text is its URL', async () => {
		await paste({
			'text/html': `<a href="${YOUTUBE_URL}">${YOUTUBE_URL}</a>`,
			'text/plain': YOUTUBE_URL,
		});

		expect(parseUrl).toHaveBeenCalledWith(YOUTUBE_URL);
		expect(getMenu()).not.toBeNull();
	});

	it('does not offer to embed a copied link with a label', async () => {
		await paste({
			'text/html': `<a href="${YOUTUBE_URL}">first video</a>`,
			'text/plain': 'first video',
		});

		expect(parseUrl).not.toHaveBeenCalled();
		expect(getMenu()).toBeNull();
	});

	it('offers to embed a bare address that only a custom matcher links', async () => {
		await paste({ 'text/plain': SHORT_YOUTUBE_URL });

		expect(parseUrl).toHaveBeenCalledWith(SHORT_YOUTUBE_URL);
		expect(getMenu()).not.toBeNull();
	});

	it('still offers to embed a bare URL pasted after typed text', async () => {
		editor.update(() => {
			const paragraph = $createParagraphNode().append($createTextNode('Check this out: '));
			$getRoot().clear().append(paragraph);
		});
		await settle();

		await paste({ 'text/plain': YOUTUBE_URL });

		expect(parseUrl).toHaveBeenCalledWith(YOUTUBE_URL);
		expect(getMenu()).not.toBeNull();
		editor.read(() => {
			expect($getRoot().getTextContent()).toBe(`Check this out: ${YOUTUBE_URL}`);
		});
	});

	it('offers to embed a bare URL pasted into formatted text', async () => {
		let middleKey!: NodeKey;
		editor.update(() => {
			const middle = $createTextNode(' and ');
			middleKey = middle.getKey();
			const paragraph = $createParagraphNode().append(
				$createTextNode('Read '),
				$createTextNode('this').toggleFormat('bold'),
				middle,
				$createTextNode('that').toggleFormat('italic'),
				$createTextNode(' now'),
			);
			$getRoot().clear().append(paragraph);
		});
		await settle();

		let pasteDirtyLeaves = 0;
		const removeUpdateListener = editor.registerUpdateListener(({ dirtyLeaves, tags }) => {
			if (tags.has(PASTE_TAG)) {
				pasteDirtyLeaves = dirtyLeaves.size;
			}
		});
		try {
			// Paste over the word between the bold and italic runs.
			await paste({ 'text/plain': YOUTUBE_URL }, () => {
				const middle = $getNodeByKey(middleKey);
				if (!$isTextNode(middle)) {
					throw new Error('expected the middle text node');
				}
				middle.select(1, 4);
			});
		} finally {
			removeUpdateListener();
		}

		// The formatted siblings and the split text nodes are all dirty, so a
		// dirty leaf count cannot tell this paste apart from pasted prose.
		expect(pasteDirtyLeaves).toBeGreaterThan(3);
		expect(parseUrl).toHaveBeenCalledTimes(1);
		expect(parseUrl).toHaveBeenCalledWith(YOUTUBE_URL);
		expect(getMenu()).not.toBeNull();
		editor.read(() => {
			expect($getRoot().getTextContent()).toBe(`Read this ${YOUTUBE_URL} that now`);
		});
	});

	it('does not throw when the clipboard reports no plain text', async () => {
		await pasteEvent(createPasteEvent({ 'text/html': 'replaced' }));

		expect(onError).not.toHaveBeenCalled();
		expect(parseUrl).not.toHaveBeenCalled();
		expect(getMenu()).toBeNull();
		editor.read(() => {
			expect($getRoot().getTextContent()).toBe('replaced');
		});
	});
});
