// The scan toolbar: a floating pill with a live render counter, a
// pause/resume toggle, and the animation-speed cycle. Plain DOM inside a
// closed-over shadow root — deliberately NOT Octane components: upstream
// react-scan renders its UI in Preact rather than React so the tool never
// instruments itself, and the Octane equivalent of that rationale is a
// renderer the profiler cannot see. Shadow DOM keeps app styles out and
// toolbar styles in.
import {
	getOptions,
	setOptions,
	__addRenderSink,
	__onOptionsChanged,
	type OctaneRenderInfo,
} from './core.js';

const STYLES = `
	:host {
		all: initial;
	}
	.bar {
		position: fixed;
		bottom: 16px;
		right: 16px;
		z-index: 2147483647;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 10px;
		border: 1px solid rgba(129, 108, 255, 0.6);
		border-radius: 8px;
		background: rgba(22, 24, 29, 0.95);
		color: #f4eee8;
		font: 11px ui-monospace, Menlo, Consolas, monospace;
	}
	.count {
		min-width: 5.5em;
		font-variant-numeric: tabular-nums;
	}
	button {
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 5px;
		background: transparent;
		color: inherit;
		font: inherit;
		padding: 2px 7px;
		cursor: pointer;
	}
	button:hover {
		border-color: rgba(129, 108, 255, 0.9);
	}
	.bar.paused .count {
		opacity: 0.5;
	}
`;

let host: HTMLElement | null = null;
let bar: HTMLElement | null = null;
let countEl: HTMLElement | null = null;
let toggleEl: HTMLButtonElement | null = null;
let speedEl: HTMLButtonElement | null = null;
let renders = 0;
let detachSink: (() => void) | null = null;
let detachOptions: (() => void) | null = null;

const SPEED_CYCLE = { fast: 'slow', slow: 'off', off: 'fast' } as const;

function syncFromOptions(): void {
	const options = getOptions();
	if (options.showToolbar === false) {
		removeToolbar();
		return;
	}
	if (host === null) attach();
	const paused = options.enabled === false;
	bar!.classList.toggle('paused', paused);
	toggleEl!.textContent = paused ? 'resume' : 'pause';
	speedEl!.textContent = options.animationSpeed ?? 'fast';
}

function onBatch(infos: OctaneRenderInfo[]): void {
	for (const info of infos) if (info.type === 'component-render') renders++;
	if (countEl !== null) countEl.textContent = `${renders} renders`;
}

function attach(): void {
	host = document.createElement('div');
	host.setAttribute('data-octane-scan-toolbar', '');
	const shadow = host.attachShadow({ mode: 'open' });
	const style = document.createElement('style');
	style.textContent = STYLES;
	bar = document.createElement('div');
	bar.className = 'bar';
	countEl = document.createElement('span');
	countEl.className = 'count';
	countEl.textContent = `${renders} renders`;
	toggleEl = document.createElement('button');
	toggleEl.type = 'button';
	toggleEl.setAttribute('data-action', 'toggle');
	toggleEl.addEventListener('click', () => {
		setOptions({ enabled: getOptions().enabled === false });
	});
	speedEl = document.createElement('button');
	speedEl.type = 'button';
	speedEl.setAttribute('data-action', 'speed');
	speedEl.addEventListener('click', () => {
		const current = getOptions().animationSpeed ?? 'fast';
		setOptions({ animationSpeed: SPEED_CYCLE[current] });
	});
	bar.append(countEl, toggleEl, speedEl);
	shadow.append(style, bar);
	document.documentElement.appendChild(host);
}

function removeToolbar(): void {
	host?.remove();
	host = null;
	bar = null;
	countEl = null;
	toggleEl = null;
	speedEl = null;
}

/**
 * Wire the toolbar into the core (idempotent). Attaches immediately unless
 * `showToolbar: false`; stays subscribed either way so flipping the option
 * back on re-attaches with the counter intact.
 */
export function installToolbar(): void {
	if (detachOptions !== null) {
		syncFromOptions();
		return;
	}
	detachSink = __addRenderSink({ batch: onBatch });
	detachOptions = __onOptionsChanged(syncFromOptions);
	syncFromOptions();
}

/** Test/devtools hygiene: remove the toolbar and its subscriptions. */
export function teardownToolbar(): void {
	detachSink?.();
	detachOptions?.();
	detachSink = null;
	detachOptions = null;
	renders = 0;
	removeToolbar();
}
