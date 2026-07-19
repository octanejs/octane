// Inspector plugin — click-to-inspect. It owns the pointer/keyboard listeners
// and the on-screen overlay + panel, but the STATE lives in the selection
// service: this plugin drives `selection.hoverAt/lockAt/setActive` and renders
// from selection changes. So the toolbar's inspect button, a keyboard shortcut,
// and this plugin all move the same selection without knowing about each other.
// It reads identity/causes from the resolved instance and counts from the
// report service — never from the source or pipeline directly.
import { definePlugin, type Plugin, type PluginContext } from '../plugin.js';
import type { Selection } from '../services/selection.js';
import type { ComponentInstance } from '../services/registry.js';

const OVERLAY_STYLES = `
	:host { all: initial; }
	.box {
		position: fixed; z-index: 2147483646; pointer-events: none;
		border: 1px dashed rgba(142, 97, 227, 0.9);
		background: rgba(173, 97, 230, 0.1); display: none;
	}
	.box.locked { border-style: solid; }
	.label {
		position: absolute; left: 0; top: -22px; padding: 2px 6px; border-radius: 3px;
		background: rgba(37, 37, 38, 0.85); color: #fff;
		font: 12px system-ui, -apple-system, sans-serif; white-space: nowrap;
	}
`;

const PANEL_STYLES = `
	:host { all: initial; }
	.panel {
		position: fixed; bottom: 72px; right: 24px; z-index: 2147483647; max-width: 340px;
		padding: 12px 14px; border: 1px solid #222; border-radius: 8px; background: #0a0a0a;
		color: #fff; font: 13px monospace; line-height: 1.5; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}
	.name { font-weight: 700; font-size: 14px; color: #8e61e3; }
	.file { color: #888; font-size: 11px; word-break: break-all; }
	.row { margin-top: 6px; color: #ccc; }
	.why { margin-top: 8px; color: #888; }
	.cause { margin-top: 2px; color: #8e61e3; }
	.hint { margin-top: 8px; color: #666; font-size: 11px; }
`;

const SCAN_UI =
	'[data-octane-scan-toolbar], [data-octane-scan-inspector], [data-octane-scan-overlay]';

export function inspectorPlugin(): Plugin {
	let overlayHost: HTMLElement | null = null;
	let overlayBox: HTMLElement | null = null;
	let overlayLabel: HTMLElement | null = null;
	let panelHost: HTMLElement | null = null;
	let listening = false;
	let lastMoveAt = 0;

	function ensureOverlay(): void {
		if (overlayHost !== null) return;
		overlayHost = document.createElement('div');
		overlayHost.setAttribute('data-octane-scan-overlay', '');
		const shadow = overlayHost.attachShadow({ mode: 'open' });
		const style = document.createElement('style');
		style.textContent = OVERLAY_STYLES;
		overlayBox = document.createElement('div');
		overlayBox.className = 'box';
		overlayLabel = document.createElement('div');
		overlayLabel.className = 'label';
		overlayBox.append(overlayLabel);
		shadow.append(style, overlayBox);
		document.documentElement.appendChild(overlayHost);
	}

	function drawBox(instance: ComponentInstance, kind: 'hover' | 'locked'): void {
		ensureOverlay();
		const rect = instance.rect();
		if (rect === null || overlayBox === null || overlayLabel === null) {
			hideBox();
			return;
		}
		overlayBox.classList.toggle('locked', kind === 'locked');
		overlayBox.style.display = 'block';
		overlayBox.style.left = `${rect.left}px`;
		overlayBox.style.top = `${rect.top}px`;
		overlayBox.style.width = `${rect.width}px`;
		overlayBox.style.height = `${rect.height}px`;
		overlayLabel.textContent = instance.component.name;
	}

	function hideBox(): void {
		if (overlayBox !== null) overlayBox.style.display = 'none';
	}

	function teardownOverlay(): void {
		overlayHost?.remove();
		overlayHost = null;
		overlayBox = null;
		overlayLabel = null;
	}

	function hidePanel(): void {
		panelHost?.remove();
		panelHost = null;
	}

	function showPanel(instance: ComponentInstance, context: PluginContext): void {
		hidePanel();
		panelHost = document.createElement('div');
		panelHost.setAttribute('data-octane-scan-inspector', '');
		const shadow = panelHost.attachShadow({ mode: 'open' });
		const style = document.createElement('style');
		style.textContent = PANEL_STYLES;
		const panel = document.createElement('div');
		panel.className = 'panel';

		const report = context.report.get(instance.component.id);
		const name = document.createElement('div');
		name.className = 'name';
		name.textContent = instance.component.name;
		const file = document.createElement('div');
		file.className = 'file';
		file.textContent =
			instance.component.line > 0
				? `${instance.component.file}:${instance.component.line}`
				: instance.component.file;
		const stats = document.createElement('div');
		stats.className = 'row';
		stats.textContent =
			report === undefined
				? 'no renders recorded'
				: `${report.renders} renders · ${report.bailouts} bailouts · ${report.totalSelfTime.toFixed(1)}ms self`;
		const why = document.createElement('div');
		why.className = 'why';
		why.textContent = `Why did ${instance.component.name} render?`;
		// The schedule causes the profiler recorded — which hook scheduled the
		// render, with source — richer than react-scan's prop-diff guessing.
		const causes = document.createElement('div');
		causes.className = 'cause';
		causes.textContent =
			'last render: ' +
			(instance.causes.length === 0
				? '—'
				: instance.causes
						.map((cause) =>
							cause.hook !== undefined ? `${cause.type} (${cause.hook})` : cause.type,
						)
						.join(', '));
		const hint = document.createElement('div');
		hint.className = 'hint';
		hint.textContent = 'esc to exit · click another component to inspect it';
		panel.append(name, file, stats, why, causes, hint);
		shadow.append(style, panel);
		document.documentElement.appendChild(panelHost);
	}

	function isScanUI(element: Element | null): boolean {
		return element !== null && element.closest(SCAN_UI) !== null;
	}

	function makeHandlers(context: PluginContext) {
		const onMove = (event: MouseEvent): void => {
			const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
			if (nowMs - lastMoveAt < 32) return;
			lastMoveAt = nowMs;
			const element = document.elementFromPoint(event.clientX, event.clientY);
			context.selection.hoverAt(element !== null && !isScanUI(element) ? element : null);
		};
		const onClick = (event: MouseEvent): void => {
			const target = event.target;
			if (!(target instanceof Element) || isScanUI(target)) return;
			event.preventDefault();
			event.stopPropagation();
			context.selection.lockAt(target);
		};
		const onKeydown = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') context.selection.setActive(false);
		};
		return { onMove, onClick, onKeydown };
	}

	return definePlugin({
		name: 'inspector',
		setup(context) {
			if (typeof document === 'undefined') return;
			const { onMove, onClick, onKeydown } = makeHandlers(context);

			function startListening(): void {
				if (listening) return;
				listening = true;
				ensureOverlay();
				document.addEventListener('mousemove', onMove, true);
				document.addEventListener('click', onClick, true);
				document.addEventListener('keydown', onKeydown, true);
			}
			function stopListening(): void {
				if (!listening) return;
				listening = false;
				document.removeEventListener('mousemove', onMove, true);
				document.removeEventListener('click', onClick, true);
				document.removeEventListener('keydown', onKeydown, true);
				hidePanel();
				teardownOverlay();
			}

			const detach = context.onSelection((selection: Selection) => {
				if (selection.mode === 'off') {
					stopListening();
					return;
				}
				startListening();
				if (selection.instance === null) {
					hideBox();
					return;
				}
				if (selection.mode === 'locked') {
					drawBox(selection.instance, 'locked');
					showPanel(selection.instance, context);
				} else {
					hidePanel();
					drawBox(selection.instance, 'hover');
				}
			});

			return () => {
				detach();
				stopListening();
			};
		},
	});
}
