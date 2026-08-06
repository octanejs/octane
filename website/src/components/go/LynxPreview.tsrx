// The Octane binding over ./lynx-view.
//
// Everything about actually running a Lynx bundle — creating the element,
// ordering `browserConfig` before `url`, the fit/responsive viewport decision,
// and working out whether the page has painted — lives in ./lynx-view, which is
// an adaptation of @lynx-js/go-web's own logic and has no framework in it (see
// ./lynx-view/UPSTREAM.md). This file is only a host element, an effect, and
// the site's loading and error treatment.
import { useEffect, useRef, useState } from 'octane';
import { loadLynxRuntime } from './lynx-runtime.ts';
import {
	mountLynxView,
	type AutoGestureOptions,
	type LynxViewHandle,
	type LynxViewState,
	type WebPreviewMode,
} from './lynx-view/index.ts';

interface LynxPreviewProps {
	/** Absolute or root-relative URL of the `.web.bundle` to mount. */
	src: string;
	/** Names the preview for assistive technology. */
	label: string;
	/**
 * How the example fills the panel. `responsive` (the default) re-bases
 * `rpx`/`vw`/`vh` onto the panel so the example lays itself out for it; `fit`
 * keeps the authored phone viewport and scales it with a CSS transform, which
 * a `<list>` cannot survive (see ./lynx-view/controller.ts); `auto` picks per
 * container size.
 */
	mode?: WebPreviewMode;
	/**
 * Increment to soft-refresh: the page is rebuilt from the bundle already in
 * memory, without remounting the element or going back to the network.
 */
	reloadKey?: number;
	/** Demonstrate the example with simulated touches once it has painted. */
	autoGesture?: AutoGestureOptions;
	onStateChange?: (state: LynxViewState) => void;
}

// go-web's stage vocabulary, in this site's voice.
const STAGE_LABELS = {
	runtime: 'Starting the Lynx runtime',
	downloading: 'Downloading the bundle',
	rendering: 'Rendering',
	rendered: '',
};

export function LynxPreview(props: LynxPreviewProps) @{
	const host = useRef<HTMLDivElement | null>(null);
	const view = useRef<LynxViewHandle | null>(null);
	const appliedReloadKey = useRef(props.reloadKey ?? 0);
	// The mount effect must not depend on the callback's identity: a parent
	// passing an inline arrow would otherwise tear the whole preview down and
	// re-download the bundle on every render it triggers. go-web keeps its
	// equivalent in a ref for the same reason.
	const report = useRef<LynxPreviewProps['onStateChange']>(props.onStateChange);
	report.current = props.onStateChange;
	const [state, setState] = useState<LynxViewState>({
		ready: false,
		rendered: false,
		stage: 'runtime',
		error: null,
		canRefresh: false,
	});

	useEffect(() => {
		const container = host.current;
		if (!container) return;
		const mounted = mountLynxView(container, {
			url: props.src,
			loadRuntime: loadLynxRuntime,
			webPreviewMode: props.mode,
			autoGesture: props.autoGesture,
			onStateChange: (next) => {
				setState(next);
				report.current?.(next);
			},
		});
		view.current = mounted;
		return () => {
			view.current = null;
			mounted.dispose();
		};
	});

	// A separate effect so a refresh does not tear the element down and
	// re-download: the mount above owns the bundle, this only asks it to rebuild.
	useEffect(() => {
		const key = props.reloadKey ?? 0;
		if (key === appliedReloadKey.current) return;
		appliedReloadKey.current = key;
		view.current?.reload();
	});

	<div class="lynx-preview" data-rendered={state.rendered}>
		<div class="lynx-preview-host" ref={host} role="figure" aria-label={props.label}></div>

		@if (state.error) {
			<div class="lynx-preview-overlay" role="status">
				<p class="lynx-preview-error">{'The preview could not start. ' + state.error}</p>
			</div>
		} @else if (!state.rendered) {
			<div class="lynx-preview-overlay" role="status">
				<div class="lynx-preview-dots" aria-hidden="true">
					<span></span>
					<span></span>
					<span></span>
				</div>
				<p class="lynx-preview-stage">{STAGE_LABELS[state.stage] + '…'}</p>
			</div>
		}

		<style>
			.lynx-preview {
				position: relative;
				width: 100%;
				height: 100%;
				background: var(--code-bg);
			}
			/* The controller measures this element, so it needs a definite size of
			   its own and owns everything below it. */
			.lynx-preview-host {
				width: 100%;
				height: 100%;
				opacity: 0;
				transition: opacity 0.2s ease;
			}
			/* Hold the preview back until the page paints, so a reader never sees
			   the runtime assembling itself. */
			.lynx-preview[data-rendered='true'] .lynx-preview-host {
				opacity: 1;
			}
			.lynx-preview-overlay {
				position: absolute;
				inset: 0;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 0.75rem;
				padding: 1.5rem;
				text-align: center;
			}
			/* go-web shows three bouncing dots while a preview loads; same motion,
			   this site's ink. */
			.lynx-preview-dots {
				display: flex;
				gap: 0.375rem;
			}
			.lynx-preview-dots span {
				width: 6px;
				height: 6px;
				border-radius: 50%;
				background: var(--text-secondary);
				animation: lynx-preview-bounce 1.2s ease-in-out infinite;
			}
			.lynx-preview-dots span:nth-child(2) {
				animation-delay: 0.15s;
			}
			.lynx-preview-dots span:nth-child(3) {
				animation-delay: 0.3s;
			}
			@keyframes lynx-preview-bounce {
				0%,
				80%,
				100% {
					opacity: 0.3;
					transform: scale(0.8);
				}
				40% {
					opacity: 1;
					transform: scale(1.2);
				}
			}
			.lynx-preview-stage {
				margin: 0;
				color: var(--text-secondary);
				font-size: 0.75rem;
				letter-spacing: 0.02em;
			}
			.lynx-preview-error {
				margin: 0;
				max-width: 22rem;
				color: var(--danger-text);
				font-size: 0.8rem;
				line-height: 1.5;
			}
			@media (prefers-reduced-motion: reduce) {
				.lynx-preview-host {
					transition: none;
				}
				.lynx-preview-dots span {
					animation: none;
					opacity: 0.6;
				}
			}
		</style>
	</div>
}
