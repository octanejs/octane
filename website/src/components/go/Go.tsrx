// <Go> — a packaged Lynx example, side by side with a live preview of it.
//
// The name and the data layout come from @lynx-js/go-web, the community
// component that does this for Lynx sites: an example is a directory of
// sources plus an `example-metadata.json` naming its bundles, and the site
// mounts the Lynx-for-Web bundle in a `<lynx-view>`. This is that contract in
// Octane, with the site's own chrome — go-web is a React component, and this
// site has no React in it.
//
// The preview costs a runtime download and, for an image-heavy example, a few
// megabytes of assets, so nothing loads until the panel comes into view. The
// Web and Device tabs then both stay mounted: switching to the QR code and
// back should not restart the example.
import { useEffect, useRef, useState } from 'octane';
import { bundleUrl, loadExample, resolveEntry, type LoadedExample } from './example-data.ts';
import { DeviceScan } from './DeviceScan.tsrx';
import { LynxPreview } from './LynxPreview.tsrx';
import type { WebPreviewMode } from './lynx-view/index.ts';
import { findLynxExample } from '../../content/lynx-examples.ts';

// Start fetching a screen before the panel arrives, so scrolling to it usually
// finds it already running.
const PRELOAD_MARGIN = '400px';

// The viewport these examples are authored against. At exactly this width the
// responsive path maps `rpx` 1:1 with the design, so the example renders as
// drawn — and, unlike the fit path, without a CSS transform for a `<list>` to
// measure itself against.
const DESIGN_WIDTH = 375;

// Neither pane is worth showing below these; go-web uses the same thresholds
// for its own split (PREVIEW_H_COLLAPSE / CODE_H_COLLAPSE).
const PREVIEW_MIN = 260;
const CODE_MIN = 200;
const KEYBOARD_STEP = 16;

interface GoProps {
	/** Example id — the folder name under `/lynx-examples`. */
	example: string;
	/** Entry to preview; defaults to the first one in the metadata. */
	entry?: string;
	/** Source file to open on; defaults to the packaged `defaultFile`. */
	file?: string;
	/** Names the panel for assistive technology. */
	label: string;
	/** Viewport handling for the web preview. See LynxPreview. */
	mode?: WebPreviewMode;
}

export function Go(props: GoProps) @{
	const panel = useRef<HTMLDivElement | null>(null);
	const body = useRef<HTMLDivElement | null>(null);
	const [near, setNear] = useState(false);
	const [loaded, setLoaded] = useState<LoadedExample | null>(null);
	const [error, setError] = useState('');
	const [openFile, setOpenFile] = useState('');
	const [tab, setTab] = useState<'web' | 'device'>('web');
	const [previewWidth, setPreviewWidth] = useState(DESIGN_WIDTH);
	const [fullscreen, setFullscreen] = useState(false);
	const [reloadKey, setReloadKey] = useState(0);
	const [canRefresh, setCanRefresh] = useState(false);

	// Everything below — metadata, sources, the Lynx runtime, the example's own
	// assets — waits on this.
	useEffect(() => {
		const element = panel.current;
		if (!element || near) return;
		if (typeof IntersectionObserver === 'undefined') {
			setNear(true);
			return;
		}
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				setNear(true);
				observer.disconnect();
			}
		}, { rootMargin: PRELOAD_MARGIN });
		observer.observe(element);
		return () => observer.disconnect();
	});

	useEffect(() => {
		if (!near) return;
		const controller = new AbortController();
		loadExample(props.example, controller.signal).then(
			(next) => {
				setLoaded(next);
				setOpenFile(props.file ?? next.source.defaultFile);
			},
			(reason: Error) => {
				if (reason.name !== 'AbortError') setError(reason.message);
			},
		);
		return () => controller.abort();
	});

	// Expanded, the panel covers the page, so Escape has to bring it back and the
	// page behind it must not scroll under it.
	useEffect(() => {
		if (!fullscreen) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setFullscreen(false);
		};
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.body.style.overflow = previous;
			document.removeEventListener('keydown', onKeyDown);
		};
	});

	const clampPreview = (width: number): number => {
		const available = body.current?.getBoundingClientRect().width ?? width + CODE_MIN;
		return Math.max(PREVIEW_MIN, Math.min(width, Math.max(PREVIEW_MIN, available - CODE_MIN)));
	};

	// The drag listens on the window rather than capturing the pointer on the
	// separator: the pointer leaves a 10px-wide element immediately, and window
	// listeners keep tracking it without depending on how a delegated event
	// reports its current target.
	const onSeparatorPointerDown = (event: PointerEvent) => {
		event.preventDefault();
		const onMove = (move: PointerEvent) => {
			const bounds = body.current?.getBoundingClientRect();
			if (!bounds) return;
			// The preview is the trailing pane, so its width is whatever sits
			// between the pointer and the panel's right edge.
			setPreviewWidth(clampPreview(bounds.right - move.clientX));
		};
		const onUp = () => {
			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
		};
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	};
	const onSeparatorKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'ArrowLeft') setPreviewWidth(clampPreview(previewWidth + KEYBOARD_STEP));
		else if (event.key === 'ArrowRight') setPreviewWidth(
			clampPreview(previewWidth - KEYBOARD_STEP),
		);
		else if (event.key === 'Home') setPreviewWidth(clampPreview(DESIGN_WIDTH));
		else return;
		event.preventDefault();
	};

	const entry =
		loaded ? resolveEntry(loaded.metadata, props.entry) : undefined;
	const sources = loaded?.source.files ?? [];
	const current = sources.find(({ path }) => path === openFile) ?? sources[0];
	const webBundle = entry?.webFile;
	const nativeBundle = entry?.file;
	const showRefresh = tab === 'web' && canRefresh;
	const autoGesture = findLynxExample(props.example)?.autoGesture;

	<div class={['go', fullscreen && 'is-fullscreen']} ref={panel}>
		<div class="go-body" ref={body} style={'--go-preview-width:' + previewWidth + 'px'}>
			<div class="go-code">
				<div class="go-files" role="tablist" aria-label="Example source files">
					@for (const source of sources; key source.path) {
						<button
							type="button"
							role="tab"
							class={['go-file', source.path === current?.path && 'is-open']}
							aria-selected={source.path === current?.path}
							title={source.path}
							onClick={() => setOpenFile(source.path)}
						>{fileLabel(source.path) as string}</button>
					}
				</div>
				<div class="go-source">
					@if (current) {
						<div class="go-source-code" dangerouslySetInnerHTML={{ __html: current.html }}></div>
					} @else if (error) {
						<p class="go-message go-message-error">
							{'This example could not be loaded. ' + error}
						</p>
					} @else {
						<p class="go-message">Loading the example…</p>
					}
				</div>
			</div>

			{/* A real separator, so the split is adjustable by pointer and by
    keyboard rather than being a decorative grip. */}
			<div
				class="go-separator"
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize the preview"
				aria-valuenow={Math.round(previewWidth)}
				aria-valuemin={PREVIEW_MIN}
				tabIndex={0}
				onPointerDown={onSeparatorPointerDown}
				onKeyDown={onSeparatorKeyDown}
			>
				<span class="go-separator-grip" aria-hidden="true"></span>
			</div>

			<div class="go-preview">
				<div class="go-preview-bar">
					<div class="go-preview-tabs" role="tablist" aria-label="Preview target">
						<button
							type="button"
							role="tab"
							class={['go-tab', tab === 'web' && 'is-active']}
							aria-selected={tab === 'web'}
							onClick={() => setTab('web')}
						>Web</button>
						<button
							type="button"
							role="tab"
							class={['go-tab', tab === 'device' && 'is-active']}
							aria-selected={tab === 'device'}
							onClick={() => setTab('device')}
						>Device</button>
					</div>
					<div class="go-actions">
						@if (showRefresh) {
							<button
								type="button"
								class="go-action"
								title="Reload the example"
								aria-label="Reload the example"
								onClick={() => setReloadKey(reloadKey + 1)}
							>
								<svg viewBox="0 0 16 16" aria-hidden="true">
									<path
										d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3"
										fill="none"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</button>
						}
						<button
							type="button"
							class="go-action"
							title={fullscreen ? 'Exit full screen' : 'Full screen'}
							aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
							aria-pressed={fullscreen}
							onClick={() => setFullscreen(!fullscreen)}
						>
							<svg viewBox="0 0 16 16" aria-hidden="true">
								@if (fullscreen) {
									<path
										d="M6.5 2.5v4h-4M9.5 13.5v-4h4"
										fill="none"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								} @else {
									<path
										d="M2.5 6.5v-4h4M13.5 9.5v4h-4"
										fill="none"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								}
							</svg>
						</button>
					</div>
				</div>
				<div class="go-preview-body">
					{/* Both panes stay mounted: unmounting the web preview to show a
    QR code would restart the example on every tab switch. */}
					<div class="go-pane" hidden={tab !== 'web'}>
						@if (near && webBundle) {
							<LynxPreview
								src={`/lynx-examples/${props.example}/${webBundle}`}
								label={props.label}
								mode={props.mode}
								reloadKey={reloadKey}
								autoGesture={autoGesture}
								onStateChange={(state) => setCanRefresh(state.canRefresh)}
							/>
						} @else if (near && loaded) {
							<p class="go-message">
								This example was not built for the web. Use the Device tab to run it.
							</p>
						}
					</div>
					<div class="go-pane" hidden={tab !== 'device'}>
						@if (near && nativeBundle) {
							<DeviceScan url={bundleUrl(props.example, nativeBundle)} />
						}
					</div>
				</div>
			</div>
		</div>

		<style>
			/* The site's code-panel frame, widened into two panes. */
			.go {
				margin: 1.6rem 0;
				border: 1px solid var(--border);
				border-radius: 1rem;
				overflow: hidden;
				background: var(--code-bg);
				container: go-panel / inline-size;
			}
			/* Expanded, the panel leaves the prose column and takes the window. It
			   stays the same element — only the frame moves — so the preview is not
			   remounted and the example keeps its state. */
			.go.is-fullscreen {
				position: fixed;
				inset: 1rem;
				z-index: 60;
				margin: 0;
				box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
			}
			/* The explicit row matters: an implicit `auto` row sizes to the code
			   pane's content, so the panes would lay out far taller than the frame
			   and only look right because the frame clips them — and the preview
			   would hand that phantom height to the Lynx page as its viewport. */
			.go-body {
				display: grid;
				grid-template-columns: minmax(0, 1fr) auto var(--go-preview-width);
				grid-template-rows: minmax(0, 1fr);
				height: 33.5rem;
			}
			.go.is-fullscreen .go-body {
				height: 100%;
			}
			.go-code {
				display: flex;
				flex-direction: column;
				min-width: 0;
				min-height: 0;
			}
			/* Editor-style file strip. It scrolls horizontally rather than wrapping,
			   so the panel's height does not change with the file count. */
			.go-files {
				display: flex;
				gap: 0.15rem;
				min-height: 2rem;
				padding: 0 0.35rem;
				overflow-x: auto;
				scrollbar-width: none;
				background: var(--surface-subtle);
				border-bottom: 1px solid var(--border);
			}
			.go-files::-webkit-scrollbar {
				display: none;
			}
			.go-file {
				flex: none;
				padding: 0 0.5rem;
				border: 0;
				border-bottom: 2px solid transparent;
				background: transparent;
				color: var(--text-secondary);
				font-family: 'SF Mono', SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
				font-size: 0.72rem;
				white-space: nowrap;
				cursor: pointer;
				transition:
					color 0.15s,
					border-color 0.15s;
			}
			.go-file:hover {
				color: var(--text);
			}
			.go-file.is-open {
				color: var(--text);
				border-bottom-color: var(--accent);
			}
			.go-source {
				min-height: 0;
				flex: 1;
				overflow: auto;
				scrollbar-width: thin;
			}
			/* Shiki brings its own frame; flatten it into the panel the way the
			   docs' CodeBlock does. */
			.go-source-code :global(pre.shiki) {
				margin: 0;
				border: none;
				border-radius: 0;
				padding: 0.85rem 1rem;
				font-size: 0.75rem;
				line-height: 1.6;
			}
			.go-separator {
				width: 10px;
				border-left: 1px solid var(--border);
				border-right: 1px solid var(--border);
				display: grid;
				place-items: center;
				background: var(--surface-subtle);
				cursor: col-resize;
				touch-action: none;
			}
			.go-separator:hover,
			.go-separator:focus-visible {
				background: var(--surface);
				outline: none;
			}
			.go-separator:focus-visible {
				box-shadow: inset 0 0 0 1px var(--accent);
			}
			/* The grip: a short dotted run, the affordance go-web uses for the same
			   handle. */
			.go-separator-grip {
				width: 2px;
				height: 18px;
				background: radial-gradient(circle, var(--text-secondary) 1px, transparent 1px) 0 0 / 2px
					6px repeat-y;
				opacity: 0.7;
			}
			.go-preview {
				display: flex;
				flex-direction: column;
				min-width: 0;
				min-height: 0;
			}
			.go-preview-bar {
				display: flex;
				align-items: center;
				min-height: 2rem;
				padding: 0 0.35rem;
				background: var(--surface-subtle);
				border-bottom: 1px solid var(--border);
			}
			.go-preview-tabs {
				display: flex;
				gap: 0.15rem;
			}
			.go-tab {
				padding: 0 0.6rem;
				border: 0;
				border-bottom: 2px solid transparent;
				background: transparent;
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.75rem;
				font-weight: 600;
				cursor: pointer;
				transition:
					color 0.15s,
					border-color 0.15s;
			}
			.go-tab:hover {
				color: var(--text);
			}
			.go-tab.is-active {
				color: var(--text);
				border-bottom-color: var(--accent);
			}
			.go-actions {
				display: flex;
				align-items: center;
				gap: 0.15rem;
				margin-left: auto;
			}
			.go-action {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 1.6rem;
				height: 1.6rem;
				padding: 0;
				border: 1px solid transparent;
				border-radius: 0.4rem;
				background: transparent;
				color: var(--text-secondary);
				cursor: pointer;
				transition:
					color 0.15s,
					background 0.15s,
					border-color 0.15s;
			}
			.go-action:hover {
				color: var(--text);
				background: var(--surface);
				border-color: var(--border);
			}
			.go-action svg {
				width: 14px;
				height: 14px;
			}
			/* The container both panes measure against. */
			.go-preview-body {
				position: relative;
				container-type: size;
				flex: 1;
				min-height: 0;
			}
			.go-pane {
				position: absolute;
				inset: 0;
			}
			.go-pane[hidden] {
				display: none;
			}
			.go-message {
				display: grid;
				place-content: center;
				height: 100%;
				margin: 0;
				padding: 1.5rem;
				color: var(--text-secondary);
				font-size: 0.82rem;
				line-height: 1.5;
				text-align: center;
			}
			.go-message-error {
				color: var(--danger-text);
			}
			/* Stacked, there is nothing to drag: both panes are full width and the
			   preview leads, because it is the thing worth looking at. */
			@container go-panel (max-width: 720px) {
				.go-body {
					grid-template-columns: minmax(0, 1fr);
					height: auto;
				}
				.go-separator {
					display: none;
				}
				.go-code {
					order: 2;
					border-top: 1px solid var(--border);
				}
				.go-preview {
					order: 1;
				}
				.go-source {
					height: 20rem;
					flex: none;
				}
				.go-preview-body {
					height: 33.5rem;
					flex: none;
				}
				.go.is-fullscreen .go-body {
					height: 100%;
					overflow-y: auto;
				}
			}
		</style>
	</div>
}

/**
 * The shortest label that still identifies a file in the strip. Sources live
 * under `src/`, so the directory adds nothing; anything nested keeps its parent
 * so `pictures/furnituresPictures.ts` does not read as a root file.
 */
function fileLabel(path: string): string {
	const parts = path.split('/');
	if (parts.length <= 1) return path;
	if (parts[0] === 'src') return parts.slice(1).join('/');
	return parts.join('/');
}
