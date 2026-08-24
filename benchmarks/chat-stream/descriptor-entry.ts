import { createElement, createRoot, flushSync, useState } from 'octane';
import { SCRIPTED_REPLIES, segText } from './octane-tsrx/src/data.js';

type Mode = 'hosts' | 'components' | 'text';
const TITLE = 'Streaming response';
let total = 0;
const sections = SCRIPTED_REPLIES.map((reply, index) => {
	const section = { ...reply, start: total, title: `Part ${index + 1}`, index };
	total += reply.total;
	return section;
});
const container = document.querySelector('#root') as HTMLElement;
let root: ReturnType<typeof createRoot> | null = null;
let updateProgress: (done: number) => void;
let progress = 0;
let currentMode: Mode = 'hosts';
let copied = 0;
let survivors = new Map<string, Element>();
let scalarNode: ChildNode | null = null;

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`descriptor-stream: ${message}`);
}

function CopyButton() {
	const [count, setCount] = useState(0);
	return createElement(
		'button',
		{ 'data-stable': 'copy', onClick: () => setCount(count + 1) },
		`Copy (${count})`,
	);
}

// This is the projection stage of a Markdown renderer, not a Markdown parser:
// every arrival produces fresh descriptors for the currently visible document.
// The source blocks/tokens and settled segment-string cache are chat-stream's.
function Document({ mode }: { mode: Mode }) {
	const [done, setDone] = useState(0);
	const [copyCount, setCopyCount] = useState(0);
	updateProgress = setDone;
	const children = [];
	let text = TITLE;
	if (mode !== 'text') {
		children.push(createElement('h1', { key: 'heading', 'data-stable': 'heading' }, TITLE));
	}
	for (const section of sections) {
		const localDone = done - section.start;
		if (localDone <= 0) break;
		const blocks = [];
		text += section.title;
		for (const segment of section.segments) {
			if (localDone <= segment.start) break;
			const content = segText(segment, localDone);
			if (mode === 'text') {
				text += content;
				continue;
			}
			const props = { key: segment.id, 'data-stable': `segment-${segment.id}` };
			blocks.push(
				segment.type === 'code'
					? createElement(
							'pre',
							props,
							createElement('code', { 'data-stable': `code-${segment.id}` }, content),
						)
					: createElement('p', props, content),
			);
		}
		if (mode !== 'text') {
			children.push(
				createElement(
					'section',
					{ key: section.index, 'data-stable': `section-${section.index}` },
					createElement('h2', { 'data-stable': `title-${section.index}` }, section.title),
					createElement('div', { 'data-stable': `body-${section.index}` }, blocks),
				),
			);
		}
	}
	if (mode === 'text') return text + 'Copy (0)';
	children.push(
		mode === 'components'
			? createElement(CopyButton, { key: 'copy' })
			: createElement(
					'button',
					{
						key: 'copy',
						'data-stable': 'copy',
						onClick: () => setCopyCount(copyCount + 1),
					},
					`Copy (${copyCount})`,
				),
	);
	return createElement('article', { 'data-stable': 'document' }, children);
}

// Independent content oracle: join the authored token arrays directly rather
// than using the renderer's segText helper or its descriptor projection.
function expectedText(done: number, copyCount: number): string {
	let expected = TITLE;
	for (const section of sections) {
		if (done <= section.start) break;
		expected += section.title;
		for (const segment of section.segments) {
			const count = Math.max(
				0,
				Math.min(segment.tokens.length, done - section.start - segment.start),
			);
			expected += segment.tokens.slice(0, count).join('');
		}
	}
	return expected + `Copy (${copyCount})`;
}

function verify(): void {
	assert(
		container.textContent === expectedText(progress, copied),
		`incorrect text at token ${progress}`,
	);
	if (currentMode === 'text') {
		assert(
			scalarNode !== null && scalarNode.parentNode === container,
			'the scalar stream replaced its text node',
		);
	} else {
		const next = new Map<string, Element>();
		for (const node of container.querySelectorAll('[data-stable]')) {
			const key = node.getAttribute('data-stable')!;
			assert(!next.has(key), `duplicate document node ${key}`);
			if (survivors.has(key)) assert(survivors.get(key) === node, `replaced surviving ${key}`);
			next.set(key, node);
		}
		for (const key of survivors.keys()) assert(next.has(key), `removed surviving ${key}`);
		survivors = next;
	}
	const composer = document.querySelector('#composer') as HTMLTextAreaElement;
	assert(composer.value === 'a draft kept while the response streams', 'changed the composer');
}

function advance(batch: number): void {
	progress = Math.min(total, progress + batch);
	flushSync(() => updateProgress(progress));
}

function prepare(mode: Mode, batch: number): void {
	root?.unmount();
	assert(container.childNodes.length === 0, 'teardown left rendered content');
	currentMode = mode;
	progress = 0;
	copied = 0;
	survivors = new Map();
	root = createRoot(container);
	root.render(Document, { mode });
	// Mount and the first token batch are not sustained-stream work. Capturing
	// those first live nodes lets every timed sample protect survivor identity.
	advance(batch);
	scalarNode = Array.from(container.childNodes).find((node) => node.nodeType === 3) ?? null;
	verify();
}

function semanticPass(mode: Mode, batch: number) {
	prepare(mode, batch);
	let chunks = 0;
	while (progress < total) {
		advance(batch);
		chunks++;
		if (chunks === 1 && mode !== 'text') {
			const button = container.querySelector('button') as HTMLButtonElement;
			flushSync(() => button.click());
			copied = 1;
		}
		verify();
	}
	const result = {
		tokens: total,
		chunks,
		text: container.textContent,
		blocks: sections.reduce((count, section) => count + section.segments.length, 0),
	};
	root!.unmount();
	root = null;
	assert(container.childNodes.length === 0, 'final teardown left rendered content');
	return result;
}

function sample(mode: Mode, batch: number) {
	prepare(mode, batch);
	(window as Window & { gc?: () => void }).gc?.();
	let chunks = 0;
	const start = performance.now();
	while (progress < total) {
		advance(batch);
		chunks++;
	}
	const ms = performance.now() - start;
	// No DOM queries, content comparisons, or identity bookkeeping are timed.
	verify();
	return { ms, chunks };
}

(window as any).__descriptorStream = { semanticPass, sample };
