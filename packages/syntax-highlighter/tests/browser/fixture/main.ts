import { createRoot, flushSync } from 'octane';
import SyntaxHighlighter, {
	LightAsync,
	createElement as createOctaneSyntaxElement,
} from '../../../src/index.js';
import React from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { flushSync as flushReactSync } from 'react-dom';
import ReactSyntaxHighlighter, {
	LightAsync as ReactLightAsync,
	createElement as createReactSyntaxElement,
} from 'react-syntax-highlighter';

const syncContainer = document.querySelector('#octane-sync')!;
const asyncContainer = document.querySelector('#octane-async')!;
const reactSyncContainer = document.querySelector('#react-sync')!;
const reactAsyncContainer = document.querySelector('#react-async')!;
const syncRoot = createRoot(syncContainer);
const asyncRoot = createRoot(asyncContainer);
const reactSyncRoot = createReactRoot(reactSyncContainer);
const reactAsyncRoot = createReactRoot(reactAsyncContainer);

const initialProps = {
	language: 'javascript',
	children: 'const answer = 42;\nanswer += 1;',
	PreTag: 'section',
	CodeTag: 'samp',
	showLineNumbers: true,
	showInlineLineNumbers: true,
	wrapLines: true,
	wrapLongLines: true,
	useInlineStyles: false,
	lineProps: (line: number) => ({ 'data-line': String(line) }),
	customStyle: { width: '160px', overflowX: 'auto' },
	'data-testid': 'sync-highlighter',
};

const octaneRenderer = ({ rows, stylesheet, useInlineStyles }: any) =>
	rows.map((node: any, index: number) =>
		createOctaneSyntaxElement({ node, stylesheet, useInlineStyles, key: `row-${index}` }),
	);
const reactRenderer = ({ rows, stylesheet, useInlineStyles }: any) =>
	rows.map((node: any, index: number) =>
		createReactSyntaxElement({ node, stylesheet, useInlineStyles, key: `row-${index}` }),
	);

flushSync(() => syncRoot.render(SyntaxHighlighter, { ...initialProps, renderer: octaneRenderer }));
flushSync(() =>
	asyncRoot.render(LightAsync, {
		language: 'javascript',
		children: 'const asyncValue = true;',
		'data-testid': 'async-highlighter',
	}),
);
flushReactSync(() =>
	reactSyncRoot.render(
		React.createElement(ReactSyntaxHighlighter, { ...initialProps, renderer: reactRenderer }),
	),
);
flushReactSync(() =>
	reactAsyncRoot.render(
		React.createElement(ReactLightAsync, {
			language: 'javascript',
			children: 'const asyncValue = true;',
			'data-testid': 'async-highlighter',
		}),
	),
);

function selectKeyword(container: Element): string {
	const token = container.querySelector('.hljs-keyword');
	if (!token) throw new Error('missing keyword token');
	const range = document.createRange();
	range.selectNodeContents(token);
	const selection = getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
	return selection?.toString() ?? '';
}

function snapshotContainer(container: Element) {
	const host = container.querySelector('[data-testid="sync-highlighter"]')!;
	const code = host.querySelector('samp')!;
	const lines = [...code.querySelectorAll('[data-line]')];
	const lineNumber = code.querySelector('.react-syntax-highlighter-line-number')!;
	return {
		hostTag: host.tagName,
		codeTag: code.tagName,
		text: code.textContent,
		whiteSpace: getComputedStyle(code).whiteSpace,
		lineDisplays: lines.map((line) => getComputedStyle(line).display),
		lineNumberMinWidth: getComputedStyle(lineNumber).minWidth,
		selected: selectKeyword(container),
	};
}

function snapshot() {
	return {
		octane: snapshotContainer(syncContainer),
		react: snapshotContainer(reactSyncContainer),
	};
}

window.__syntaxHighlighterBrowser = {
	snapshot,
	update() {
		flushSync(() =>
			syncRoot.render(SyntaxHighlighter, {
				...initialProps,
				renderer: octaneRenderer,
				language: 'json',
				children: '{"answer":43}',
			}),
		);
		flushReactSync(() =>
			reactSyncRoot.render(
				React.createElement(ReactSyntaxHighlighter, {
					...initialProps,
					renderer: reactRenderer,
					language: 'json',
					children: '{"answer":43}',
				}),
			),
		);
		const updated = (container: Element) => ({
			text: container.querySelector('samp')?.textContent,
			attribute: container.querySelector('.hljs-attr')?.textContent,
		});
		return {
			octane: updated(syncContainer),
			react: updated(reactSyncContainer),
		};
	},
	async asyncSnapshot() {
		await Promise.all([LightAsync.preload(), ReactLightAsync.preload()]);
		for (let attempt = 0; attempt < 50; attempt++) {
			const octaneKeyword = asyncContainer.querySelector('.hljs-keyword');
			const reactKeyword = reactAsyncContainer.querySelector('.hljs-keyword');
			if (octaneKeyword && reactKeyword) {
				const observed = (container: Element, keyword: Element) => ({
					keyword: keyword.textContent,
					text: container.querySelector('code')?.textContent,
				});
				return {
					octane: observed(asyncContainer, octaneKeyword),
					react: observed(reactAsyncContainer, reactKeyword),
				};
			}
			await new Promise((resolve) => requestAnimationFrame(resolve));
		}
		throw new Error('async language did not settle');
	},
	unmount() {
		syncRoot.unmount();
		asyncRoot.unmount();
		reactSyncRoot.unmount();
		reactAsyncRoot.unmount();
	},
};

declare global {
	interface Window {
		__syntaxHighlighterBrowser: {
			snapshot(): { octane: Record<string, unknown>; react: Record<string, unknown> };
			update(): { octane: Record<string, unknown>; react: Record<string, unknown> };
			asyncSnapshot(): Promise<{
				octane: Record<string, unknown>;
				react: Record<string, unknown>;
			}>;
			unmount(): void;
		};
	}
}
