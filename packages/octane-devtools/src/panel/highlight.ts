/**
 * Plain-DOM highlight overlay for the component tree's hover inspection.
 *
 * Deliberately not an Octane component: highlighting must never schedule
 * renders (each panel commit fires a bridge `commit` event), so the boxes are
 * imperative DOM appended to `document.body`, outside the panel's shadow root.
 */

const OVERLAY_ATTRIBUTE = 'data-octane-devtools-highlight';
const BOX_FILL = 'rgba(88, 132, 255, 0.18)';
const BOX_BORDER = '1px solid rgba(88, 132, 255, 0.85)';

let overlay: HTMLElement | null = null;

function ensureOverlay(): HTMLElement | null {
	if (typeof document === 'undefined' || document.body === null) return null;
	if (overlay !== null && overlay.isConnected) return overlay;
	const host = document.createElement('div');
	host.setAttribute(OVERLAY_ATTRIBUTE, '');
	host.style.position = 'fixed';
	host.style.inset = '0';
	host.style.pointerEvents = 'none';
	host.style.zIndex = '2147483646';
	document.body.appendChild(host);
	overlay = host;
	return host;
}

/** Viewport rect for an element or (via a measuring Range) a text node. */
function rectFor(node: Node): DOMRect | null {
	if (node.nodeType === 1) {
		const element = node as Element;
		if (typeof element.getBoundingClientRect !== 'function') return null;
		return element.getBoundingClientRect();
	}
	if (node.nodeType === 3 && typeof document.createRange === 'function') {
		try {
			const range = document.createRange();
			range.selectNodeContents(node);
			return range.getBoundingClientRect();
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Draw outline boxes over the given DOM nodes (replacing any previous
 * highlight). The first box carries a small chip with the component label.
 */
export function highlightNodes(nodes: Node[], label?: string): void {
	const host = ensureOverlay();
	if (host === null) return;
	host.textContent = '';
	let labeled = false;
	for (const node of nodes) {
		const rect = rectFor(node);
		if (rect === null || (rect.width === 0 && rect.height === 0)) continue;
		const box = document.createElement('div');
		box.style.position = 'absolute';
		box.style.left = `${rect.left}px`;
		box.style.top = `${rect.top}px`;
		box.style.width = `${rect.width}px`;
		box.style.height = `${rect.height}px`;
		box.style.boxSizing = 'border-box';
		box.style.background = BOX_FILL;
		box.style.border = BOX_BORDER;
		box.style.borderRadius = '2px';
		host.appendChild(box);
		if (!labeled && label !== undefined && label !== '') {
			labeled = true;
			const chip = document.createElement('div');
			chip.textContent = label;
			chip.style.position = 'absolute';
			chip.style.left = `${Math.max(4, rect.left)}px`;
			chip.style.top = `${rect.top >= 24 ? rect.top - 21 : rect.bottom + 4}px`;
			chip.style.font = '11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
			chip.style.padding = '2px 6px';
			chip.style.borderRadius = '3px';
			chip.style.background = '#1b2340';
			chip.style.color = '#9db1ff';
			chip.style.border = '1px solid rgba(88, 132, 255, 0.6)';
			chip.style.whiteSpace = 'nowrap';
			host.appendChild(chip);
		}
	}
}

/** Remove every highlight box (the lazily created container is retained). */
export function clearHighlight(): void {
	if (overlay !== null) overlay.textContent = '';
}
