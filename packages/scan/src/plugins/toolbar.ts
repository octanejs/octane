// Toolbar plugin — the widget. Plain shadow-DOM (never Octane components, so the
// tool never scans itself). It consumes only public services: options (power
// switch, showToolbar), interactions (History + Ranked/Overview/Prompts), fps
// (meter), and selection (inspect button ↔ inspect state). It knows nothing of
// the registry, pipeline, or source. Collapsed it's a bar; the bell expands it
// into react-scan's interaction inspector. The widget drags and snaps to any
// corner.
import { definePlugin, type Plugin, type PluginContext } from '../plugin.js';
import {
	BELL_ICON,
	CLEAR_ICON,
	CLOSE_ICON,
	FOCUS_ICON,
	INSPECT_ICON,
	KEYBOARD_ICON,
	POINTER_ICON,
	VOLUME_OFF_ICON,
	VOLUME_ON_ICON,
} from './icons.js';
import { severityOf, type InteractionRecord, type Severity } from '../services/interactions.js';

const SEVERITY_BG: Record<Severity, string> = {
	low: 'rgba(34, 197, 94, 0.5)',
	'needs-improvement': '#b77116',
	high: '#b94040',
};

type Tab = 'ranked' | 'overview' | 'prompts';
type PromptTab = 'fix' | 'explanation' | 'data';
type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

const SAFE_AREA = 24;

const STYLES = `
	:host { all: initial; }
	@keyframes octane-scan-fade-in { from { opacity: 0; } to { opacity: 1; } }
	.widget {
		position: fixed; top: 0; left: 0; z-index: 2147483647; display: flex; flex-direction: column;
		width: max-content; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); border-radius: 8px;
		background: #000; color: #fff; font: 13px monospace; overflow: hidden; cursor: move;
		user-select: none; will-change: transform; opacity: 0;
		animation: octane-scan-fade-in 300ms ease-out 300ms forwards;
		transition: transform 250ms cubic-bezier(0, 0, 0.2, 1), width 250ms cubic-bezier(0, 0, 0.2, 1), height 250ms cubic-bezier(0, 0, 0.2, 1);
	}
	.widget.dragging { transition: none; }
	.widget.open { width: 600px; height: 420px; }
	.panel { display: none; flex: 1; flex-direction: column; overflow: hidden; background: #0a0a0a; }
	.widget.open .panel { display: flex; }
	.panel-header { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 12px 0 16px; border-bottom: 1px solid #27272a; font-size: 13px; }
	.panel-header .verb { color: #5a5a5a; }
	.panel-header .comp { font-weight: 600; }
	.severity { padding: 1px 5px; border-radius: 3px; font-size: 10px; font-weight: 600; color: #fff; white-space: nowrap; }
	.panel-header .close { margin-left: auto; display: flex; border: 0; background: transparent; color: #6f6f78; cursor: pointer; font-size: 18px; padding: 4px; }
	.panel-header .close:hover { color: #fff; }
	.panel-body { display: flex; flex: 1; overflow: hidden; }
	.history { display: flex; flex-direction: column; min-width: 200px; width: 200px; border-right: 1px solid #27272a; overflow-y: auto; }
	.history-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 4px 6px 12px; color: #65656d; font-size: 13px; }
	.history-head button { display: flex; border: 0; background: transparent; color: #65656d; cursor: pointer; font-size: 16px; padding: 6px; border-radius: 9999px; }
	.history-head button:hover { background: #18181b; }
	.history-list { display: flex; flex-direction: column; gap: 4px; padding: 0 4px 8px; }
	.history-empty { padding: 16px 0; text-align: center; color: #71717a; font-size: 13px; }
	.history-row { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border: 0; border-radius: 3px; background: transparent; color: #fff; cursor: pointer; text-align: left; font: inherit; }
	.history-row:hover, .history-row[data-active='true'] { background: #18181b; }
	.history-row .marker { display: flex; color: #a1a1aa; font-size: 14px; }
	.history-name { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.history-time { margin-left: auto; padding: 2px 5px; border-radius: 3px; font-size: 10px; font-weight: 600; color: #fff; white-space: nowrap; }
	.details { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
	.tabs { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
	.tab-group { display: flex; gap: 4px; padding: 4px; border-radius: 4px; background: #18181b; }
	.tab { border: 0; border-radius: 3px; background: transparent; color: #6e6e77; cursor: pointer; font: inherit; font-size: 12px; padding: 4px 10px; }
	.tab[data-active='true'] { background: #7521c8; color: #fff; }
	.alerts { margin-left: auto; display: flex; align-items: center; gap: 6px; border: 0; background: transparent; color: #6e6e77; cursor: pointer; font: inherit; font-size: 12px; }
	.alerts svg { font-size: 16px; }
	.alerts[data-active='true'] { color: #8e61e3; }
	.tab-content { flex: 1; overflow-y: auto; padding: 4px 16px 16px; }
	.empty-title { color: #fff; font-size: 13px; margin-bottom: 4px; }
	.empty-sub { color: #a1a1aa; font-size: 13px; }
	.rank-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 12px; }
	.rank-name { width: 34%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.rank-track { flex: 1; height: 16px; border-radius: 3px; background: #18181b; overflow: hidden; }
	.rank-fill { height: 100%; background: #412162; }
	.rank-ms { min-width: 52px; text-align: right; color: #7346a0; }
	.stat { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #18181b; font-size: 13px; }
	.stat .k { color: #a1a1aa; }
	.prompt-text { width: 100%; height: 180px; box-sizing: border-box; resize: none; border: 1px solid #27272a; border-radius: 4px; background: #0a0a0a; color: #d4d4d8; font: 12px monospace; padding: 8px; }
	.prompt-copy { margin-top: 8px; border: 0; border-radius: 4px; background: #18181b; color: #6e6e77; cursor: pointer; font: inherit; font-size: 12px; padding: 6px 12px; }
	.prompt-copy:hover { color: #fff; }
	.prompt-tabs { display: flex; gap: 4px; padding: 4px; border-radius: 4px 4px 0 0; background: #18181b; }
	.prompt-tab { border: 0; border-radius: 3px; background: transparent; color: #6e6e77; cursor: pointer; font: inherit; font-size: 12px; padding: 4px 12px; }
	.prompt-tab[data-active='true'] { background: #7521c8; color: #fff; }
	.prompt-card { border: 1px solid #27272a; border-radius: 4px; overflow: hidden; }
	.bar { display: flex; align-items: stretch; height: 36px; }
	.button { position: relative; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; color: #999; cursor: pointer; padding: 0 10px; font-size: 16px; }
	.button:hover { background: rgba(255, 255, 255, 0.1); }
	.button:active { background: rgba(255, 255, 255, 0.15); }
	.button[data-active='true'] { color: #8e61e3; }
	.button svg { display: block; }
	.bell-badge { position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 9999px; background: rgba(239, 68, 68, 0.9); }
	.toggle { position: relative; display: inline-flex; align-self: center; width: 40px; height: 24px; margin: 0 10px; cursor: pointer; }
	.toggle-track { position: absolute; inset: 4px; border-radius: 9999px; background: #404040; transition: background-color 300ms ease-out; }
	.toggle-knob { position: absolute; top: 50%; left: 0; transform: translateY(-50%); width: 16px; height: 16px; border-radius: 9999px; background: #fff; border: 2px solid #404040; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); transition: all 300ms ease-out; }
	.toggle[data-checked='true'] .toggle-track { background: #5f3f9a; }
	.toggle[data-checked='true'] .toggle-knob { transform: translate(100%, -50%); left: auto; border-color: #5f3f9a; }
	.fps { display: flex; align-items: center; gap: 4px; align-self: center; width: 72px; height: 24px; margin-right: 10px; padding: 0 8px; border-radius: 6px; background: #141414; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); font: 600 13px monospace; }
	.fps-value { flex: 1; text-align: center; transition: color 200ms ease-in-out; }
	.fps-label { color: rgba(255, 255, 255, 0.3); font-size: 11px; font-weight: 500; }
`;

export function toolbarPlugin(): Plugin {
	let ctx: PluginContext;
	let host: HTMLElement | null = null;
	let widgetEl: HTMLElement | null = null;
	let inspectEl: HTMLButtonElement | null = null;
	let bellEl: HTMLButtonElement | null = null;
	let toggleEl: HTMLElement | null = null;
	let fpsValueEl: HTMLElement | null = null;
	let panelEl: HTMLElement | null = null;
	let fpsTimer: ReturnType<typeof setInterval> | null = null;

	let notificationsOpen = false;
	let selectedId: number | null = null;
	let activeTab: Tab = 'ranked';
	let promptTab: PromptTab = 'fix';
	let audioEnabled = false;
	let audioContext: AudioContext | null = null;
	let seenHighSeverity = 0;
	let corner: Corner = 'bottom-right';

	const inspecting = (): boolean => ctx.selection.get().mode !== 'off';

	function selectedRecord(): InteractionRecord | null {
		const all = ctx.interactions.all();
		if (all.length === 0) return null;
		if (selectedId !== null) {
			const match = all.find((record) => record.id === selectedId);
			if (match !== undefined) return match;
		}
		return all[all.length - 1];
	}

	function severityBadge(className: string, ms: number, suffix: string): HTMLElement {
		const badge = document.createElement('div');
		badge.className = className;
		badge.style.background = SEVERITY_BG[severityOf(ms)];
		badge.textContent = `${ms.toFixed(0)}ms${suffix}`;
		return badge;
	}

	function renderHeader(record: InteractionRecord | null): HTMLElement {
		const header = document.createElement('div');
		header.className = 'panel-header';
		if (record !== null) {
			const verb = document.createElement('span');
			verb.className = 'verb';
			verb.textContent = record.type === 'click' ? 'Clicked' : 'Typed in';
			const comp = document.createElement('span');
			comp.className = 'comp';
			comp.textContent = record.componentName;
			header.append(
				verb,
				comp,
				severityBadge('severity', record.processingTime, ' processing time'),
			);
		} else {
			const verb = document.createElement('span');
			verb.className = 'verb';
			verb.textContent = 'Interactions';
			header.append(verb);
		}
		const close = document.createElement('button');
		close.className = 'close';
		close.title = 'Close';
		close.innerHTML = CLOSE_ICON;
		close.addEventListener('click', () => setNotificationsOpen(false));
		header.append(close);
		return header;
	}

	function renderHistory(
		records: InteractionRecord[],
		current: InteractionRecord | null,
	): HTMLElement {
		const column = document.createElement('div');
		column.className = 'history';
		const head = document.createElement('div');
		head.className = 'history-head';
		const title = document.createElement('span');
		title.textContent = 'History';
		const clear = document.createElement('button');
		clear.title = 'Clear all events';
		clear.innerHTML = CLEAR_ICON;
		clear.addEventListener('click', () => {
			selectedId = null;
			ctx.interactions.clear();
		});
		head.append(title, clear);
		const list = document.createElement('div');
		list.className = 'history-list';
		if (records.length === 0) {
			const empty = document.createElement('div');
			empty.className = 'history-empty';
			empty.textContent = 'No Events';
			list.append(empty);
		} else {
			for (const record of [...records].reverse()) {
				const row = document.createElement('button');
				row.className = 'history-row';
				row.setAttribute('data-active', String(current !== null && record.id === current.id));
				const marker = document.createElement('span');
				marker.className = 'marker';
				marker.innerHTML = record.type === 'click' ? POINTER_ICON : KEYBOARD_ICON;
				const name = document.createElement('span');
				name.className = 'history-name';
				name.textContent = record.componentName;
				row.append(marker, name, severityBadge('history-time', record.processingTime, ''));
				row.addEventListener('click', () => {
					selectedId = record.id;
					renderPanel();
				});
				list.append(row);
			}
		}
		column.append(head, list);
		return column;
	}

	function emptyState(title: string, sub: string): HTMLElement {
		const wrap = document.createElement('div');
		const t = document.createElement('div');
		t.className = 'empty-title';
		t.textContent = title;
		const s = document.createElement('div');
		s.className = 'empty-sub';
		s.textContent = sub;
		wrap.append(t, s);
		return wrap;
	}

	function renderRanked(record: InteractionRecord | null): HTMLElement {
		const content = document.createElement('div');
		if (record === null || record.renders.length === 0) {
			content.append(
				emptyState('No renders collected', 'There were no renders during this period'),
			);
			return content;
		}
		const max = Math.max(...record.renders.map((entry) => entry.selfTime), 0.0001);
		for (const entry of record.renders) {
			const row = document.createElement('div');
			row.className = 'rank-row';
			const name = document.createElement('span');
			name.className = 'rank-name';
			name.textContent = entry.renderCount > 1 ? `${entry.name} ×${entry.renderCount}` : entry.name;
			const track = document.createElement('div');
			track.className = 'rank-track';
			const fill = document.createElement('div');
			fill.className = 'rank-fill';
			fill.style.width = `${Math.max(2, (entry.selfTime / max) * 100)}%`;
			track.append(fill);
			const ms = document.createElement('span');
			ms.className = 'rank-ms';
			ms.textContent = `${entry.selfTime.toFixed(1)}ms`;
			row.append(name, track, ms);
			content.append(row);
		}
		return content;
	}

	function renderOverview(record: InteractionRecord | null): HTMLElement {
		const content = document.createElement('div');
		if (record === null) {
			content.append(emptyState('No data available', 'No data was collected during this period'));
			return content;
		}
		const renderTime = record.renders.reduce((sum, entry) => sum + entry.selfTime, 0);
		const renderCount = record.renders.reduce((sum, entry) => sum + entry.renderCount, 0);
		const rows: Array<[string, string]> = [
			['Processing time', `${record.processingTime.toFixed(1)}ms`],
			['Render time', `${renderTime.toFixed(1)}ms`],
			['Components rendered', String(record.renders.length)],
			['Total renders', String(renderCount)],
		];
		for (const [key, value] of rows) {
			const stat = document.createElement('div');
			stat.className = 'stat';
			const k = document.createElement('span');
			k.className = 'k';
			k.textContent = key;
			const v = document.createElement('span');
			v.textContent = value;
			stat.append(k, v);
			content.append(stat);
		}
		return content;
	}

	function formatReactData(record: InteractionRecord): string {
		let text = '';
		for (const entry of record.renders.slice(0, 30)) {
			text += `Component Name:${entry.name}\n`;
			text += `Rendered: ${entry.renderCount} times\n`;
			text += `Sum of self times for ${entry.name} is ${entry.selfTime.toFixed(0)}ms\n\n`;
		}
		return text;
	}

	function fixPrompt(record: InteractionRecord): string {
		const renderTime = record.renders.reduce((sum, entry) => sum + entry.selfTime, 0);
		return `You will attempt to implement a performance improvement to a user interaction in an Octane app. You will be provided with data about the interaction, and the slow down.

Your should split your goals into 2 parts:
- identifying the problem
- fixing the problem
	- it is okay to implement a fix even if you aren't 100% sure the fix solves the performance problem. When you aren't sure, you should tell the user to try repeating the interaction, and feeding the data in the scan notifications Prompts tab.

The interaction was a ${record.type} on the component named ${record.componentName}. This component has the following ancestors ${record.componentPath.join('>')}. This is the path from the component, to the root.

The interaction took ${record.processingTime.toFixed(0)}ms from interaction start to when a new frame was presented to the user, of which ${renderTime.toFixed(0)}ms was Octane component render time.

We also have lower level information about components, such as their render time.

${formatReactData(record)}
You may notice components have many renders. This normally implies most of the components could be memoized to avoid computation. The flow should be:
- find the most expensive components
- see what's causing them to render
- memoize the component so it no longer unnecessarily re-renders`;
	}

	function explanationPrompt(record: InteractionRecord): string {
		const renderTime = record.renders.reduce((sum, entry) => sum + entry.selfTime, 0);
		return `Your goal will be to help me find the source of a performance problem in an Octane app. I collected a dataset about this specific performance problem.

There was a ${record.type} on a component named ${record.componentName}. This means, roughly, the component that handled the ${record.type} event was named ${record.componentName}.

The interaction took ${record.processingTime.toFixed(0)}ms from interaction start to frame presentation, of which ${renderTime.toFixed(0)}ms was Octane component render time.

We also have lower level information about components, such as their render time.

${formatReactData(record)}
If it's not possible to explain the root problem from this data, please ask me for more data explicitly, and what we would need to know to find the source of the performance problem.`;
	}

	function dataPrompt(record: InteractionRecord): string {
		const renderTime = record.renders.reduce((sum, entry) => sum + entry.selfTime, 0);
		return `I will provide you with performance data about an interaction in an Octane App:
### High level
- interaction: ${record.type} on ${record.componentName}
- total processing time: ${record.processingTime.toFixed(0)}ms
- Octane component render time: ${renderTime.toFixed(0)}ms

### Low level
${formatReactData(record)}`;
	}

	function promptFor(tab: PromptTab, record: InteractionRecord): string {
		if (tab === 'fix') return fixPrompt(record);
		if (tab === 'explanation') return explanationPrompt(record);
		return dataPrompt(record);
	}

	function renderPrompts(record: InteractionRecord | null): HTMLElement {
		const content = document.createElement('div');
		if (record === null || record.renders.length === 0) {
			content.append(emptyState('No data available', 'No data was collected during this period'));
			return content;
		}
		const card = document.createElement('div');
		card.className = 'prompt-card';
		const tabs = document.createElement('div');
		tabs.className = 'prompt-tabs';
		const text = document.createElement('textarea');
		text.className = 'prompt-text';
		text.readOnly = true;
		text.value = promptFor(promptTab, record);
		for (const [tab, label] of [
			['fix', 'Fix'],
			['explanation', 'Explanation'],
			['data', 'Data'],
		] as Array<[PromptTab, string]>) {
			const button = document.createElement('button');
			button.className = 'prompt-tab';
			button.setAttribute('data-prompt-tab', tab);
			button.setAttribute('data-active', String(promptTab === tab));
			button.textContent = label;
			button.addEventListener('click', () => {
				promptTab = tab;
				text.value = promptFor(tab, record);
				for (const sibling of tabs.querySelectorAll('.prompt-tab'))
					sibling.setAttribute(
						'data-active',
						String(sibling.getAttribute('data-prompt-tab') === tab),
					);
			});
			tabs.append(button);
		}
		card.append(tabs, text);
		const copy = document.createElement('button');
		copy.className = 'prompt-copy';
		copy.textContent = 'Copy Prompt';
		copy.addEventListener('click', () => {
			void navigator.clipboard?.writeText(text.value).catch(() => {});
			copy.textContent = 'Copied!';
			setTimeout(() => {
				copy.textContent = 'Copy Prompt';
			}, 1000);
		});
		content.append(card, copy);
		return content;
	}

	function renderDetails(record: InteractionRecord | null): HTMLElement {
		const details = document.createElement('div');
		details.className = 'details';
		const tabs = document.createElement('div');
		tabs.className = 'tabs';
		const group = document.createElement('div');
		group.className = 'tab-group';
		for (const [tab, label] of [
			['ranked', 'Ranked'],
			['overview', 'Overview'],
			['prompts', 'Prompts'],
		] as Array<[Tab, string]>) {
			const button = document.createElement('button');
			button.className = 'tab';
			button.setAttribute('data-tab', tab);
			button.setAttribute('data-active', String(activeTab === tab));
			button.textContent = label;
			button.addEventListener('click', () => {
				activeTab = tab;
				renderPanel();
			});
			group.append(button);
		}
		const alerts = document.createElement('button');
		alerts.className = 'alerts';
		alerts.setAttribute('data-active', String(audioEnabled));
		alerts.title = 'Play a chime when a slowdown is recorded';
		const alertsLabel = document.createElement('span');
		alertsLabel.textContent = 'Alerts';
		const alertsIcon = document.createElement('span');
		alertsIcon.innerHTML = audioEnabled ? VOLUME_ON_ICON : VOLUME_OFF_ICON;
		alerts.append(alertsLabel, alertsIcon);
		alerts.addEventListener('click', () => {
			audioEnabled = !audioEnabled;
			if (audioEnabled) {
				enableAudio();
				playChime();
			}
			renderPanel();
		});
		tabs.append(group, alerts);
		const tabContent = document.createElement('div');
		tabContent.className = 'tab-content';
		tabContent.append(
			activeTab === 'ranked'
				? renderRanked(record)
				: activeTab === 'overview'
					? renderOverview(record)
					: renderPrompts(record),
		);
		details.append(tabs, tabContent);
		return details;
	}

	function renderPanel(): void {
		if (panelEl === null) return;
		const record = selectedRecord();
		panelEl.replaceChildren();
		const body = document.createElement('div');
		body.className = 'panel-body';
		body.append(renderHistory(ctx.interactions.all(), record), renderDetails(record));
		panelEl.append(renderHeader(record), body);
	}

	function enableAudio(): void {
		if (typeof AudioContext === 'undefined') return;
		try {
			if (audioContext === null) audioContext = new AudioContext();
			if (audioContext.state === 'suspended') void audioContext.resume();
		} catch {
			/* audio is a nicety */
		}
	}

	function playChime(): void {
		if (!audioEnabled || audioContext === null) return;
		try {
			const oscillator = audioContext.createOscillator();
			const gain = audioContext.createGain();
			oscillator.frequency.value = 660;
			gain.gain.value = 0.05;
			oscillator.connect(gain);
			gain.connect(audioContext.destination);
			oscillator.start();
			oscillator.stop(audioContext.currentTime + 0.1);
		} catch {
			/* audio is a nicety */
		}
	}

	function highSeverityCount(): number {
		return ctx.interactions.all().filter((record) => severityOf(record.processingTime) === 'high')
			.length;
	}

	function updateBellBadge(): void {
		if (bellEl === null) return;
		const unseen = highSeverityCount() > seenHighSeverity && !notificationsOpen;
		const existing = bellEl.querySelector('.bell-badge');
		if (unseen && existing === null) {
			const badge = document.createElement('span');
			badge.className = 'bell-badge';
			bellEl.append(badge);
		} else if (!unseen && existing !== null) existing.remove();
	}

	function onInteractionsChanged(): void {
		playChime();
		if (!notificationsOpen) updateBellBadge();
		if (notificationsOpen) {
			seenHighSeverity = highSeverityCount();
			renderPanel();
		}
	}

	function setNotificationsOpen(next: boolean): void {
		notificationsOpen = next;
		widgetEl?.classList.toggle('open', next);
		bellEl?.setAttribute('data-active', String(next));
		if (next) {
			seenHighSeverity = highSeverityCount();
			updateBellBadge();
			renderPanel();
		}
		applyPosition(true);
	}

	function positionForCorner(target: Corner): { x: number; y: number } {
		const width = widgetEl?.offsetWidth ?? 0;
		const height = widgetEl?.offsetHeight ?? 0;
		const right = window.innerWidth - width - SAFE_AREA;
		const bottom = window.innerHeight - height - SAFE_AREA;
		switch (target) {
			case 'top-left':
				return { x: SAFE_AREA, y: SAFE_AREA };
			case 'top-right':
				return { x: right, y: SAFE_AREA };
			case 'bottom-left':
				return { x: SAFE_AREA, y: bottom };
			default:
				return { x: right, y: bottom };
		}
	}

	function applyPosition(animate: boolean): void {
		if (widgetEl === null) return;
		const { x, y } = positionForCorner(corner);
		if (!animate) widgetEl.classList.add('dragging');
		widgetEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
		if (!animate) requestAnimationFrame(() => widgetEl?.classList.remove('dragging'));
	}

	function getBestCorner(
		mx: number,
		my: number,
		ix: number,
		iy: number,
		threshold: number,
	): Corner {
		const dx = mx - ix;
		const dy = my - iy;
		const cx = window.innerWidth / 2;
		const cy = window.innerHeight / 2;
		if (dx > threshold || dx < -threshold) {
			const isBottom = my > cy;
			return dx > threshold
				? isBottom
					? 'bottom-right'
					: 'top-right'
				: isBottom
					? 'bottom-left'
					: 'top-left';
		}
		if (dy > threshold || dy < -threshold) {
			const isRight = mx > cx;
			return dy > threshold
				? isRight
					? 'bottom-right'
					: 'bottom-left'
				: isRight
					? 'top-right'
					: 'top-left';
		}
		return mx > cx
			? my > cy
				? 'bottom-right'
				: 'top-right'
			: my > cy
				? 'bottom-left'
				: 'top-left';
	}

	function persistCorner(): void {
		try {
			localStorage.setItem('octane-scan-corner', corner);
		} catch {
			/* best effort */
		}
	}
	function restoreCorner(): void {
		try {
			const saved = localStorage.getItem('octane-scan-corner');
			if (
				saved === 'top-left' ||
				saved === 'top-right' ||
				saved === 'bottom-left' ||
				saved === 'bottom-right'
			)
				corner = saved;
		} catch {
			/* keep default */
		}
	}

	function onDragStart(event: PointerEvent): void {
		const target = event.target;
		if (
			!(target instanceof Element) ||
			target.closest('button, input, textarea, select, a, .toggle, [role="switch"]') !== null
		)
			return;
		event.preventDefault();
		const startX = event.clientX;
		const startY = event.clientY;
		const base = positionForCorner(corner);
		let lastX = startX;
		let lastY = startY;
		let moved = false;
		const move = (moveEvent: PointerEvent): void => {
			lastX = moveEvent.clientX;
			lastY = moveEvent.clientY;
			moved = true;
			if (widgetEl === null) return;
			widgetEl.classList.add('dragging');
			widgetEl.style.transform = `translate3d(${base.x + (lastX - startX)}px, ${base.y + (lastY - startY)}px, 0)`;
		};
		const end = (): void => {
			document.removeEventListener('pointermove', move);
			document.removeEventListener('pointerup', end);
			widgetEl?.classList.remove('dragging');
			if (!moved || Math.hypot(lastX - startX, lastY - startY) < 60) {
				applyPosition(true);
				return;
			}
			corner = getBestCorner(lastX, lastY, startX, startY, 40);
			persistCorner();
			applyPosition(true);
		};
		document.addEventListener('pointermove', move);
		document.addEventListener('pointerup', end);
	}

	function onResize(): void {
		applyPosition(false);
	}

	function updateFPS(): void {
		if (fpsValueEl === null) return;
		const value = ctx.fps.value();
		fpsValueEl.textContent = String(value);
		fpsValueEl.style.color = ctx.fps.color(value);
	}

	function syncInspect(): void {
		if (inspectEl === null) return;
		inspectEl.setAttribute('data-active', String(inspecting()));
		inspectEl.innerHTML = inspecting() ? FOCUS_ICON : INSPECT_ICON;
	}

	function syncFromOptions(): void {
		const options = ctx.options.get();
		if (options.showToolbar === false) {
			removeToolbar();
			return;
		}
		if (host === null) attach();
		toggleEl!.setAttribute('data-checked', String(options.enabled !== false));
		syncInspect();
	}

	function attach(): void {
		host = document.createElement('div');
		host.setAttribute('data-octane-scan-toolbar', '');
		const shadow = host.attachShadow({ mode: 'open' });
		const style = document.createElement('style');
		style.textContent = STYLES;
		widgetEl = document.createElement('div');
		widgetEl.className = 'widget';
		panelEl = document.createElement('div');
		panelEl.className = 'panel';
		const bar = document.createElement('div');
		bar.className = 'bar';

		inspectEl = document.createElement('button');
		inspectEl.type = 'button';
		inspectEl.className = 'button';
		inspectEl.title = 'Inspect element';
		inspectEl.setAttribute('data-action', 'inspect');
		inspectEl.setAttribute('data-active', String(inspecting()));
		inspectEl.innerHTML = inspecting() ? FOCUS_ICON : INSPECT_ICON;
		inspectEl.addEventListener('click', () => ctx.selection.toggle());

		bellEl = document.createElement('button');
		bellEl.type = 'button';
		bellEl.className = 'button';
		bellEl.title = 'Notifications';
		bellEl.setAttribute('data-action', 'notifications');
		bellEl.setAttribute('data-active', String(notificationsOpen));
		bellEl.innerHTML = BELL_ICON;
		bellEl.addEventListener('click', () => setNotificationsOpen(!notificationsOpen));

		toggleEl = document.createElement('div');
		toggleEl.className = 'toggle';
		toggleEl.title = 'Outline Re-renders';
		toggleEl.setAttribute('role', 'switch');
		toggleEl.setAttribute('data-action', 'toggle');
		const track = document.createElement('div');
		track.className = 'toggle-track';
		const knob = document.createElement('div');
		knob.className = 'toggle-knob';
		toggleEl.append(track, knob);
		toggleEl.addEventListener('click', () =>
			ctx.options.set({ enabled: ctx.options.get().enabled === false }),
		);

		const fps = document.createElement('div');
		fps.className = 'fps';
		fpsValueEl = document.createElement('div');
		fpsValueEl.className = 'fps-value';
		const fpsLabel = document.createElement('span');
		fpsLabel.className = 'fps-label';
		fpsLabel.textContent = 'FPS';
		fps.append(fpsValueEl, fpsLabel);

		bar.append(inspectEl, bellEl, toggleEl, fps);
		widgetEl.append(panelEl, bar);
		widgetEl.addEventListener('pointerdown', onDragStart);
		shadow.append(style, widgetEl);
		document.documentElement.appendChild(host);
		restoreCorner();
		applyPosition(false);
		if (typeof window !== 'undefined')
			window.addEventListener('resize', onResize, { passive: true });
		updateBellBadge();
		updateFPS();
		if (fpsTimer === null && typeof setInterval !== 'undefined')
			fpsTimer = setInterval(updateFPS, 200);
	}

	function removeToolbar(): void {
		if (fpsTimer !== null) {
			clearInterval(fpsTimer);
			fpsTimer = null;
		}
		if (typeof window !== 'undefined') window.removeEventListener('resize', onResize);
		host?.remove();
		host = null;
		widgetEl = null;
		inspectEl = null;
		bellEl = null;
		toggleEl = null;
		fpsValueEl = null;
		panelEl = null;
	}

	return definePlugin({
		name: 'toolbar',
		setup(context) {
			ctx = context;
			if (typeof document === 'undefined') return;
			const detachOptions = context.onOptions(syncFromOptions);
			const detachInteractions = context.onInteraction(onInteractionsChanged);
			const detachSelection = context.onSelection(syncInspect);
			syncFromOptions();
			return () => {
				detachOptions();
				detachInteractions();
				detachSelection();
				removeToolbar();
			};
		},
	});
}
