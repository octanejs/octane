import { attachBehaviorRoot } from '../../../src/index.js';

type BehaviorRoot = ReturnType<typeof attachBehaviorRoot>;
type BehaviorRegistration = ReturnType<BehaviorRoot['registerBehavior']>;
type StreamChunk = { html?: string; owner?: 'outer' | 'nested'; text?: string };
type InteractionRecord = {
	id: string;
	nativeDispatches: number;
	original: boolean;
	owner: string | null;
	trusted: boolean;
	type: string;
};

const shell = document.querySelector('#behavior-shell') as HTMLElement;
const external = shell.querySelector('#external-range') as HTMLElement;
const nested = shell.querySelector('#nested-range') as HTMLElement;
const article = shell.querySelector('#streamed-text') as HTMLElement;
const initialWidget = shell.querySelector('#initial-widget') as HTMLButtonElement;
const form = shell.querySelector('#repeated-form') as HTMLFormElement;
const svgGroup = shell.querySelector('#external-svg-group')!;
const mathRow = shell.querySelector('#external-math-row')!;

const originalEvents = new Map<string, Event>();
const nativeDispatches = new Map<string, number>();
const adoptions: string[] = [];
const cleanups: string[] = [];
const interactions: InteractionRecord[] = [];

let root: BehaviorRoot | undefined;
let resolvePending: (() => void) | undefined;
let abortController: AbortController | undefined;
let nativeSubmissions = 0;
let trustedSubmissions = 0;
let hashChanges = 0;
let streamCanceled = false;

function observeOriginalEvents(container: HTMLElement): void {
	container.ownerDocument.addEventListener(
		'click',
		(event) => {
			const target = event.target as Element | null;
			if (target === null || !container.contains(target)) return;
			originalEvents.set(target.id, event);
			nativeDispatches.set(target.id, (nativeDispatches.get(target.id) ?? 0) + 1);
		},
		true,
	);
}

observeOriginalEvents(shell);
form.addEventListener('submit', (event) => {
	event.preventDefault();
	nativeSubmissions++;
	if (event.isTrusted) trustedSubmissions++;
});
window.addEventListener('hashchange', () => hashChanges++);

function registerActions(
	owner: string,
	target: string,
	options: { id?: string; ready?: Promise<void> } = {},
): BehaviorRegistration {
	return root!.registerBehavior({
		id: options.id ?? `${owner}:${target}`,
		target,
		owner,
		events: ['click'],
		...(options.ready === undefined ? {} : { ready: options.ready }),
		adopt(element) {
			adoptions.push(element.id);
			return () => cleanups.push(element.id);
		},
		handleEvent(event, element, context) {
			interactions.push({
				id: element.id,
				nativeDispatches: nativeDispatches.get(element.id) ?? 0,
				original: originalEvents.get(element.id) === event,
				owner: typeof context.range?.owner === 'string' ? context.range.owner : null,
				trusted: event.isTrusted,
				type: event.type,
			});
		},
	});
}

function deferred(): Promise<void> {
	return new Promise<void>((resolve) => {
		resolvePending = resolve;
	});
}

async function mountStreaming(): Promise<void> {
	const patched = document.createElement('strong');
	patched.id = 'patched-before-attachment';
	patched.textContent = 'Patched before attachment';
	external.insertBefore(patched, article);

	root = attachBehaviorRoot(shell);
	root.registerExternalRange(external, { owner: 'stream' });
	root.registerExternalRange(nested, { owner: 'nested' });
	registerActions('stream', '[data-stream-action]', { id: 'stream-actions' });
	registerActions('nested', '[data-stream-action]', { id: 'nested-actions' });
	await root.ready;
}

async function mountChangingSelectors(): Promise<void> {
	root = attachBehaviorRoot(shell);
	root.registerExternalRange(external, { owner: 'stream' });
	root.registerExternalRange(nested, { owner: 'nested' });
	registerActions('stream', '#initial-widget[data-enhanced-action]', {
		id: 'attribute-actions',
	});
	registerActions('stream', '#annotation-link.interactive-annotation', {
		id: 'class-actions',
	});
	registerActions('nested', '#nested-range[data-live] #nested-widget', {
		id: 'ancestor-actions',
	});
	await root.ready;
}

async function appendStreamedMarkup(chunks: StreamChunk[]): Promise<void> {
	const stream = new ReadableStream<StreamChunk>({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(chunk);
			controller.close();
		},
	});
	const reader = stream.getReader();
	for (;;) {
		const result = await reader.read();
		if (result.done) break;
		const chunk = result.value;
		if (chunk.text !== undefined) article.textContent = chunk.text;
		if (chunk.html !== undefined) {
			const template = document.createElement('template');
			template.innerHTML = chunk.html;
			if (chunk.owner === 'nested') nested.appendChild(template.content);
			else external.insertBefore(template.content, nested);
		}
	}
}

function mountPendingInteractions(): void {
	root = attachBehaviorRoot(shell);
	root.registerExternalRange(external, { owner: 'stream' });
	registerActions('stream', '[data-pending-action]', {
		id: 'pending-actions',
		ready: deferred(),
	});
}

function mountPendingRange(): void {
	root = attachBehaviorRoot(shell);
	root.registerExternalRange(external, { owner: 'stream', ready: deferred() });
	registerActions('stream', '[data-stream-action]', { id: 'pending-range-actions' });
}

function mountAbortedInteractions(): void {
	abortController = new AbortController();
	const reader = new ReadableStream<StreamChunk>({
		start(controller) {
			controller.enqueue({ text: 'Streamed before cancellation' });
		},
		cancel() {
			streamCanceled = true;
		},
	}).getReader();
	void reader.read().then((result) => {
		if (!result.done && !abortController!.signal.aborted) {
			article.textContent = result.value.text ?? '';
		}
	});
	abortController.signal.addEventListener('abort', () => void reader.cancel(), { once: true });
	root = attachBehaviorRoot(shell, { signal: abortController.signal });
	root.registerExternalRange(external, { owner: 'stream' });
	registerActions('stream', '#initial-widget', { id: 'active-action' });
	registerActions('stream', '#annotation-link', {
		id: 'aborted-action',
		ready: deferred(),
	});
	void root.ready.catch(() => {});
}

function conflict(): string | null {
	try {
		root!.registerExternalRange(nested, { owner: 'replacement' });
		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

async function handoffNestedOwner(): Promise<void> {
	root!.registerExternalRange(nested, { owner: 'replacement', replace: true });
	registerActions('replacement', '[data-stream-action]', { id: 'replacement-actions' });
	await root!.ready;
}

async function replaceDocumentRoot(): Promise<void> {
	root!.dispose({ preserveDOM: true });

	const frame = document.createElement('iframe');
	frame.id = 'replacement-document';
	const loaded = new Promise<void>((resolve) => {
		frame.addEventListener('load', () => resolve(), { once: true });
	});
	frame.srcdoc =
		'<main id="replacement-shell"><section id="replacement-range">' +
		'<button id="replacement-widget" type="button" data-stream-action>' +
		'Replacement widget</button></section></main>';
	document.body.appendChild(frame);
	await loaded;

	const replacementShell = frame.contentDocument!.querySelector(
		'#replacement-shell',
	) as HTMLElement;
	observeOriginalEvents(replacementShell);
	root = attachBehaviorRoot(replacementShell);
	root.registerExternalRange(replacementShell.querySelector('#replacement-range') as HTMLElement, {
		owner: 'replacement-document',
	});
	registerActions('replacement-document', '[data-stream-action]', {
		id: 'replacement-document-action',
	});
	await root.ready;
}

function state() {
	const frame = document.querySelector('#replacement-document') as HTMLIFrameElement | null;
	return {
		adoptions: adoptions.slice(),
		cleanups: cleanups.slice(),
		documentScoped:
			frame?.contentDocument === undefined || frame?.contentDocument === null
				? null
				: root?.container.ownerDocument === frame.contentDocument &&
					root.container.ownerDocument !== shell.ownerDocument,
		hash: location.hash,
		hashChanges,
		identity: {
			article: shell.querySelector('#streamed-text') === article,
			external: shell.querySelector('#external-range') === external,
			initialWidget: shell.querySelector('#initial-widget') === initialWidget,
			mathRow: shell.querySelector('#external-math-row') === mathRow,
			nested: shell.querySelector('#nested-range') === nested,
			shell: document.querySelector('#behavior-shell') === shell,
			svgGroup: shell.querySelector('#external-svg-group') === svgGroup,
		},
		interactions: interactions.map((interaction) => ({ ...interaction })),
		nativeDispatches: Object.fromEntries(nativeDispatches),
		nativeSubmissions,
		namespaces: {
			math: mathRow.namespaceURI,
			svg: svgGroup.namespaceURI,
		},
		patchedBeforeAttachment: external.querySelector('#patched-before-attachment') !== null,
		protectedAttributes: {
			range: external.getAttribute('data-protected'),
			shell: shell.getAttribute('data-protected'),
		},
		streamCanceled,
		text: article.textContent,
		trustedSubmissions,
	};
}

const harness = {
	abort() {
		abortController!.abort();
		abortController!.abort();
		root!.dispose({ preserveDOM: true });
	},
	appendStreamedMarkup,
	conflict,
	dispose() {
		root?.dispose({ preserveDOM: true });
	},
	handoffNestedOwner,
	mountAbortedInteractions,
	mountChangingSelectors,
	mountPendingInteractions,
	mountPendingRange,
	mountStreaming,
	replaceDocumentRoot,
	resolvePending() {
		resolvePending!();
	},
	state,
};

window.__behaviorRootBrowser = harness;

declare global {
	interface Window {
		__behaviorRootBrowser: typeof harness;
	}
}
