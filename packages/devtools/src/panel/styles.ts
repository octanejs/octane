// Self-contained Octane-branded stylesheet for the DevTools panel. The panel is
// portaled into the TanStack DevTools host, so the website's `:root` custom
// properties are not reliably in scope — we inject our own tokens + rules once,
// namespaced under `.odt-` to avoid collisions with the host. Palette + fonts
// mirror the Octane website (docs/website/src/routes/__root.tsrx): coral accent
// #ff415a on dark slate, Inter for UI, SF Mono for values.

export const OCTANE_DEVTOOLS_STYLE_ID = 'octane-devtools-styles';

export const OCTANE_DEVTOOLS_CSS = `
.odt-root {
	--odt-bg: #23272f;
	--odt-panel: #2b3138;
	--odt-code: #16181d;
	--odt-text: #f4eee8;
	--odt-body: #d5d9e0;
	--odt-sec: #99a1b3;
	--odt-accent: #ff415a;
	--odt-accent2: #ff5d72;
	--odt-on-accent: #16181d;
	--odt-border: rgba(255, 255, 255, 0.1);
	--odt-border-strong: rgba(255, 255, 255, 0.22);
	--odt-surface: rgba(255, 255, 255, 0.06);
	--odt-subtle: rgba(255, 255, 255, 0.03);
	--odt-inset: rgba(22, 24, 29, 0.55);
	--odt-success: #8ae8ae;
	--odt-warn: #ffc56d;
	--odt-danger: #ff8797;
	--odt-mono: 'SF Mono', SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: var(--odt-bg);
	color: var(--odt-body);
	font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
	font-size: 12px;
	line-height: 1.45;
}
.odt-tabs {
	display: flex;
	flex-wrap: nowrap;
	align-items: center;
	gap: 2px;
	padding: 0 10px;
	background: var(--odt-panel);
	border-bottom: 1px solid var(--odt-border);
	/* Fixed height + flex-basis so the bar can never grow to fill the column
	   (the host's flex context resolves an auto basis unpredictably here). */
	flex: 0 0 42px;
	height: 42px;
	box-sizing: border-box;
}
.odt-tab {
	appearance: none;
	border: 0;
	background: transparent;
	color: var(--odt-sec);
	font: inherit;
	font-weight: 600;
	letter-spacing: 0.01em;
	padding: 8px 13px;
	border-radius: 8px 8px 0 0;
	cursor: pointer;
	position: relative;
	flex: 0 0 auto;
	align-self: center;
	height: auto;
	line-height: 1.3;
	white-space: nowrap;
	transition: color 0.12s ease, background 0.12s ease;
}
.odt-tab:hover {
	color: var(--odt-text);
	background: var(--odt-surface);
}
.odt-tab.odt-tab-active {
	color: var(--odt-text);
}
.odt-tab.odt-tab-active::after {
	content: '';
	position: absolute;
	left: 10px;
	right: 10px;
	bottom: -1px;
	height: 2px;
	border-radius: 2px 2px 0 0;
	background: var(--odt-accent);
	box-shadow: 0 0 10px rgba(255, 65, 90, 0.55);
}
.odt-body {
	flex: 1 1 0;
	min-height: 0;
	overflow: auto;
	padding: 12px 14px;
}
.odt-split {
	display: flex;
	gap: 12px;
	height: 100%;
	min-height: 0;
}
.odt-col {
	flex: 1 1 0;
	min-width: 0;
	overflow: auto;
}
.odt-col-tree {
	flex: 0 0 46%;
	border-right: 1px solid var(--odt-border);
	padding-right: 12px;
}
.odt-h {
	margin: 0 0 8px;
	font-size: 10px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.08em;
	color: var(--odt-sec);
}
.odt-h + .odt-h {
	margin-top: 14px;
}
.odt-empty {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--odt-sec);
	font-style: normal;
	padding: 10px 2px;
}
.odt-empty::before {
	content: '';
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--odt-accent);
	opacity: 0.65;
	flex: 0 0 auto;
}
/* Component tree */
.odt-tree-row {
	appearance: none;
	border: 0;
	width: 100%;
	text-align: left;
	background: transparent;
	color: var(--odt-body);
	font-family: var(--odt-mono);
	font-size: 11.5px;
	padding: 3px 6px;
	border-radius: 6px;
	cursor: pointer;
	display: flex;
	align-items: center;
	gap: 6px;
	transition: background 0.1s ease, color 0.1s ease;
}
.odt-tree-row:hover {
	background: var(--odt-surface);
	color: var(--odt-text);
}
.odt-tree-row.odt-selected {
	background: rgba(255, 65, 90, 0.16);
	color: var(--odt-text);
	box-shadow: inset 2px 0 0 var(--odt-accent);
}
.odt-kind {
	font-size: 9px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	color: var(--odt-sec);
	background: var(--odt-surface);
	border-radius: 4px;
	padding: 1px 5px;
	flex: 0 0 auto;
}
.odt-kind-root {
	color: var(--odt-on-accent);
	background: var(--odt-accent);
}
.odt-child {
	margin-left: 12px;
	border-left: 1px solid var(--odt-border);
	padding-left: 4px;
}
/* Inspector */
.odt-node-name {
	margin: 0 0 10px;
	font-family: var(--odt-mono);
	font-size: 13px;
	font-weight: 600;
	color: var(--odt-text);
}
.odt-badge {
	display: inline-block;
	font-size: 10px;
	font-weight: 600;
	color: var(--odt-sec);
	background: var(--odt-surface);
	border: 1px solid var(--odt-border);
	border-radius: 999px;
	padding: 1px 8px;
	margin-left: 8px;
}
.odt-kv {
	font-family: var(--odt-mono);
	font-size: 11.5px;
	background: var(--odt-inset);
	border: 1px solid var(--odt-border);
	border-radius: 7px;
	padding: 6px 9px;
	margin-bottom: 5px;
	overflow-x: auto;
	white-space: pre;
}
.odt-kv-key {
	color: var(--odt-accent2);
	font-weight: 600;
}
.odt-kv-val {
	color: var(--odt-body);
}
/* Tables (profiler / performance) */
.odt-table {
	width: 100%;
	border-collapse: collapse;
	font-family: var(--odt-mono);
	font-size: 11px;
	margin-bottom: 14px;
}
.odt-table th {
	text-align: left;
	font-weight: 600;
	color: var(--odt-sec);
	border-bottom: 1px solid var(--odt-border-strong);
	padding: 4px 8px;
	position: sticky;
	top: 0;
	background: var(--odt-bg);
}
.odt-table td {
	padding: 3px 8px;
	border-bottom: 1px solid var(--odt-subtle);
	color: var(--odt-body);
}
.odt-table tr:hover td {
	background: var(--odt-surface);
}
.odt-num {
	text-align: right;
	font-variant-numeric: tabular-nums;
	color: var(--odt-text);
}
.odt-name-cell {
	color: var(--odt-text);
	font-weight: 600;
}
.odt-bar {
	display: inline-block;
	height: 6px;
	border-radius: 3px;
	background: linear-gradient(90deg, var(--odt-accent), var(--odt-accent2));
	vertical-align: middle;
}
.odt-commit-row {
	display: flex;
	align-items: center;
	gap: 8px;
	font-family: var(--odt-mono);
	font-size: 11px;
	padding: 2px 0;
	color: var(--odt-body);
}
/* Transitions & Suspense */
.odt-stat {
	font-family: var(--odt-mono);
	font-size: 14px;
	font-weight: 600;
	color: var(--odt-accent2);
	margin-bottom: 14px;
	padding: 8px 10px;
	background: var(--odt-inset);
	border: 1px solid var(--odt-border);
	border-radius: 8px;
}
.odt-boundary {
	display: flex;
	align-items: center;
	gap: 9px;
	padding: 6px 8px;
	border: 1px solid var(--odt-border);
	border-radius: 8px;
	background: var(--odt-subtle);
	margin-bottom: 5px;
	font-family: var(--odt-mono);
	font-size: 11.5px;
	color: var(--odt-text);
}
.odt-state {
	font-size: 9.5px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	border-radius: 999px;
	padding: 2px 8px;
	flex: 0 0 auto;
}
.odt-state-pending {
	color: #3a2c00;
	background: var(--odt-warn);
}
.odt-state-resolved {
	color: #05321a;
	background: var(--odt-success);
}
.odt-state-catch {
	color: #3a0510;
	background: var(--odt-danger);
}
.odt-state-init {
	color: var(--odt-body);
	background: var(--odt-surface);
}
.odt-muted {
	color: var(--odt-sec);
}
`;
