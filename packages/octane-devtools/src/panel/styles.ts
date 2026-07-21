/**
 * Shadow-root-scoped stylesheet for the devtools panel. The panel renders
 * inside an open shadow root, so these class names cannot collide with the
 * host page; `:host { all: initial }` keeps page styles from bleeding in
 * through inheritance.
 */

const UI_FONT = "-apple-system, system-ui, 'Segoe UI', Roboto, sans-serif";
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const PANEL_CSS: string = `
:host {
	all: initial;
}

/* ── Floating trigger ─────────────────────────────────────────────────── */

.trigger {
	position: fixed;
	z-index: 2147483645;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 12px;
	border: 1px solid #2c2c38;
	border-radius: 999px;
	background: #16161d;
	color: #ddd;
	font-family: ${UI_FONT};
	font-size: 12px;
	font-weight: 600;
	line-height: 1;
	cursor: pointer;
	box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
	touch-action: none;
	user-select: none;
	-webkit-user-select: none;
}
.logo {
	display: block;
	flex: 0 0 auto;
}
.trigger:hover {
	border-color: #7c5cff;
	color: #fff;
}
.pos-bottom-right {
	right: 16px;
	bottom: 16px;
}
.pos-bottom-left {
	left: 16px;
	bottom: 16px;
}
.pos-top-right {
	right: 16px;
	top: 16px;
}
.pos-top-left {
	left: 16px;
	top: 16px;
}
.trigger.is-open.pos-bottom-right,
.trigger.is-open.pos-bottom-left {
	bottom: calc(45vh + 12px);
}

/* ── Dock chrome (a bottom drawer) ────────────────────────────────────── */

.dock {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	height: 45vh;
	z-index: 2147483644;
	display: flex;
	flex-direction: column;
	background: #111116;
	color: #ddd;
	border-top: 1px solid #26262f;
	box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.5);
	font-family: ${UI_FONT};
	font-size: 12px;
	line-height: 1.4;
}
.dock.closing {
	pointer-events: none;
}

/* Auto-hide: the unpinned dock collapses to a thin accent strip on its edge. */
.dock.collapsed {
	background: #7c5cff;
	cursor: pointer;
	overflow: hidden;
	box-shadow: none;
}
.dock.collapsed > .dock-bar,
.dock.collapsed > .dock-body,
.dock.collapsed > .resize-handle {
	display: none;
}

/* Height-resize handle along the drawer's top edge. */
.resize-handle {
	position: absolute;
	z-index: 3;
	top: -3px;
	left: 0;
	right: 0;
	height: 7px;
	cursor: ns-resize;
	background: transparent;
}
.resize-handle:hover {
	background: rgba(124, 92, 255, 0.45);
}

/* ── Motion (skipped entirely under prefers-reduced-motion) ───────────── */

@keyframes dock-slide-in {
	from {
		transform: translateY(100%);
		opacity: 0;
	}
	to {
		transform: translateY(0);
		opacity: 1;
	}
}
@keyframes dock-slide-out {
	from {
		transform: translateY(0);
		opacity: 1;
	}
	to {
		transform: translateY(100%);
		opacity: 0;
	}
}
@media (prefers-reduced-motion: no-preference) {
	.dock {
		animation: dock-slide-in 0.2s ease-out;
		transition: height 0.2s ease-out;
	}
	.dock.closing {
		animation: dock-slide-out 0.2s ease-out forwards;
	}
	.trigger {
		transition:
			left 0.15s ease-out,
			top 0.15s ease-out;
	}
}

.dock-bar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 12px;
	row-gap: 0;
	padding: 2px 10px;
	min-height: 34px;
	flex: 0 0 auto;
	background: #16161d;
	border-bottom: 1px solid #26262f;
}
.dock-title {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	font-weight: 700;
	color: #fff;
	white-space: nowrap;
}
.dock-controls {
	display: flex;
	align-items: center;
	gap: 2px;
}
.tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 2px;
	flex: 1 1 auto;
}
.tab {
	padding: 5px 10px;
	background: transparent;
	border: none;
	border-radius: 6px;
	color: #9a9aa7;
	cursor: pointer;
	font-family: inherit;
	font-size: 12px;
}
.tab:hover {
	color: #ddd;
	background: #1d1d26;
}
.tab.active {
	color: #fff;
	background: #232332;
	box-shadow: inset 0 0 0 1px rgba(124, 92, 255, 0.4);
}
.icon-btn {
	border: none;
	background: transparent;
	color: #9a9aa7;
	cursor: pointer;
	font-family: inherit;
	font-size: 13px;
	padding: 4px 6px;
	border-radius: 4px;
}
.icon-btn:hover {
	color: #fff;
	background: #232332;
}
.icon-btn.active {
	color: #fff;
	background: #232332;
	box-shadow: inset 0 0 0 1px rgba(124, 92, 255, 0.4);
}
.pin-btn svg {
	display: block;
}
.pin-btn.active {
	color: #a78bff;
}
.dock-body {
	flex: 1 1 auto;
	min-height: 0;
	display: flex;
}
.pane {
	flex: 1 1 auto;
	min-width: 0;
	min-height: 0;
	display: flex;
}
.column {
	flex-direction: column;
}

/* ── Buttons / toggles / toolbars ─────────────────────────────────────── */

.btn {
	padding: 4px 10px;
	background: #1d1d26;
	color: #ddd;
	border: 1px solid #2c2c38;
	border-radius: 6px;
	cursor: pointer;
	font-family: inherit;
	font-size: 11px;
	white-space: nowrap;
}
.btn:hover {
	border-color: #3d3d4d;
	color: #fff;
}
.btn.accent {
	background: #7c5cff;
	border-color: #7c5cff;
	color: #fff;
	font-weight: 600;
}
.btn.accent:hover {
	background: #8d70ff;
}
.toggle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	color: #c8c8d4;
	cursor: pointer;
	user-select: none;
	font-size: 11px;
}
.toggle input {
	accent-color: #7c5cff;
	margin: 0;
}
.toolbar {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 8px 10px;
	flex: 0 0 auto;
	flex-wrap: wrap;
	border-bottom: 1px solid #1f1f29;
}

/* ── Components: tree pane ────────────────────────────────────────────── */

.tree-pane {
	flex: 0 0 46%;
	max-width: 46%;
	display: flex;
	flex-direction: column;
	min-height: 0;
	border-right: 1px solid #26262f;
}
.tree-toolbar {
	display: flex;
	align-items: center;
	gap: 6px;
	margin: 8px;
	flex: 0 0 auto;
}
.picker-btn {
	font-size: 15px;
	line-height: 1;
	padding: 3px 7px;
}
.picker-btn.active {
	color: #a78bff;
}
.filter {
	flex: 1 1 auto;
	min-width: 0;
	margin: 0;
	padding: 5px 8px;
	background: #0c0c10;
	border: 1px solid #2c2c38;
	border-radius: 6px;
	color: #ddd;
	font-family: inherit;
	font-size: 12px;
	outline: none;
}
.filter:focus {
	border-color: #7c5cff;
}
.filter::placeholder {
	color: #5d5d6b;
}
.tree-scroll {
	flex: 1 1 auto;
	overflow: auto;
	padding: 0 4px 8px;
}
.tree-row {
	display: flex;
	align-items: center;
	gap: 6px;
	/* Fixed row height — the virtualized scroller windows rows by this size
	   (ROW_HEIGHT_PX in panel.tsrx must match). */
	height: 22px;
	box-sizing: border-box;
	padding: 2px 8px;
	border-radius: 4px;
	cursor: pointer;
	white-space: nowrap;
	line-height: 18px;
}
.tree-row:hover {
	background: #1b1b24;
}
.tree-row.selected {
	background: #262240;
	box-shadow: inset 0 0 0 1px rgba(124, 92, 255, 0.55);
}
.tree-row.picker-hover {
	background: rgba(124, 92, 255, 0.18);
	box-shadow: inset 0 0 0 1px rgba(124, 92, 255, 0.7);
}
.caret {
	flex: 0 0 14px;
	width: 14px;
	border: none;
	background: transparent;
	color: #767685;
	cursor: pointer;
	font-size: 10px;
	padding: 0;
	text-align: center;
}
.caret:hover {
	color: #fff;
}
.caret-spacer {
	flex: 0 0 14px;
	width: 14px;
}
.tree-label {
	font-family: ${MONO_FONT};
	font-size: 12px;
	color: #e6e6ef;
}
.tree-row.type-root .tree-label {
	color: #9a9aa7;
	font-style: italic;
}
.tree-row.type-control-flow .tree-label {
	color: #7fb8ff;
}
.tree-row.type-portal .tree-label {
	color: #66d9c2;
}
.tree-row.type-list-item .tree-label {
	color: #c9b8ff;
}

/* ── Badges ───────────────────────────────────────────────────────────── */

.badge {
	font-family: ${MONO_FONT};
	font-size: 10px;
	padding: 1px 5px;
	border-radius: 3px;
	background: #232330;
	color: #8f8fa3;
	border: 1px solid #2e2e3c;
	white-space: nowrap;
}
.badge-key {
	color: #c9b8ff;
}
.badge-pending {
	color: #ffd479;
	border-color: #4d3f1e;
	background: #2a2415;
}
.badge-inactive {
	color: #8899aa;
	font-style: italic;
}
.kind-commit {
	color: #8ab4ff;
}
.kind-effect {
	color: #79e0b8;
}
.kind-hmr {
	color: #ffd479;
}
.kind-root-added,
.kind-root-removed {
	color: #ff9db1;
}

/* ── Components: inspector pane ───────────────────────────────────────── */

.inspector {
	flex: 1 1 auto;
	min-width: 0;
	overflow: auto;
	padding: 10px 12px;
}
.inspector-head {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 6px;
}
.inspector-title {
	font-family: ${MONO_FONT};
	font-size: 13px;
	font-weight: 700;
	color: #fff;
}
.section {
	margin: 10px 0 0;
	padding-top: 8px;
	border-top: 1px solid #1f1f29;
}
.section-title {
	font-size: 10px;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #767685;
	margin-bottom: 6px;
	font-weight: 700;
}
.row {
	display: flex;
	align-items: center;
	gap: 8px;
	margin: 4px 0;
	flex-wrap: wrap;
}
.source {
	font-family: ${MONO_FONT};
	font-size: 11px;
	color: #8ab4ff;
	word-break: break-all;
	cursor: pointer;
}
.source:hover {
	text-decoration: underline;
}
.dim {
	color: #767685;
}
.preview {
	font-family: ${MONO_FONT};
	font-size: 11px;
	color: #c8c8d4;
	background: #0c0c10;
	border: 1px solid #22222c;
	border-radius: 6px;
	padding: 6px 8px;
	overflow-x: auto;
	white-space: pre;
}
.raw summary {
	cursor: pointer;
	margin-top: 4px;
	font-size: 11px;
	color: #767685;
}
.pre {
	font-family: ${MONO_FONT};
	font-size: 11px;
	color: #a8c7fa;
	background: #0c0c10;
	border: 1px solid #22222c;
	border-radius: 6px;
	padding: 8px;
	margin: 6px 0 0;
	max-height: 180px;
	overflow: auto;
}
.hook-row {
	display: flex;
	align-items: baseline;
	gap: 8px;
	padding: 3px 0;
	flex-wrap: wrap;
}
.hook-order {
	flex: 0 0 16px;
	text-align: right;
	color: #5d5d6b;
	font-family: ${MONO_FONT};
	font-size: 10px;
}
.hook-name {
	font-family: ${MONO_FONT};
	font-size: 11px;
	color: #79e0b8;
}
.hook-value {
	font-family: ${MONO_FONT};
	font-size: 11px;
	color: #c8c8d4;
}
.issue {
	width: 100%;
	min-height: 52px;
	resize: vertical;
	background: #0c0c10;
	border: 1px solid #2c2c38;
	border-radius: 6px;
	color: #ddd;
	font-family: inherit;
	font-size: 12px;
	padding: 6px 8px;
	box-sizing: border-box;
	outline: none;
}
.issue:focus {
	border-color: #7c5cff;
}
.issue::placeholder {
	color: #5d5d6b;
}

/* ── Performance table ────────────────────────────────────────────────── */

.table-wrap {
	flex: 1 1 auto;
	overflow: auto;
}
.table {
	border-collapse: collapse;
	width: 100%;
	font-size: 11px;
}
.table th {
	position: sticky;
	top: 0;
	background: #16161d;
	text-align: left;
	padding: 5px 10px;
	color: #767685;
	font-weight: 600;
	border-bottom: 1px solid #26262f;
	white-space: nowrap;
}
.table td {
	padding: 4px 10px;
	border-bottom: 1px solid #1a1a22;
	font-family: ${MONO_FONT};
	color: #c8c8d4;
	white-space: nowrap;
}
.table td.file {
	color: #767685;
	max-width: 260px;
	overflow: hidden;
	text-overflow: ellipsis;
}
.table th.num,
.table td.num {
	text-align: right;
}

/* ── Timeline ─────────────────────────────────────────────────────────── */

.list {
	flex: 1 1 auto;
	overflow: auto;
	padding: 6px 10px;
}
.event-row {
	display: flex;
	align-items: baseline;
	gap: 8px;
	padding: 2px 0;
	font-family: ${MONO_FONT};
	font-size: 11px;
}
.event-text {
	color: #c8c8d4;
	white-space: nowrap;
}

/* ── Settings / empty states ──────────────────────────────────────────── */

.settings {
	overflow: auto;
	padding: 4px 14px 14px;
	display: block;
}
.empty,
.empty-state {
	color: #767685;
	padding: 16px;
}
.empty-state {
	max-width: 520px;
	line-height: 1.5;
}
.hint {
	color: #767685;
	font-size: 11px;
	line-height: 1.5;
	max-width: 520px;
	margin: 8px 0 0;
}
`;
