// A toast-shaped portal makes both halves of the contract visible: its DOM is
// mounted in a sibling target, while delegated events follow the logical
// Octane tree back through the component that created it.
import { createPortal, useLayoutEffect, useRef, useState } from 'octane';

interface SavedToastProps {
	target: HTMLElement;
	onDismiss: () => void;
}

function ToastBody(props: { onDismiss: () => void }) @{
	<aside class="portal-demo-toast" role="status">
		<div>
			<strong>{'Project saved'}</strong>
			<span>{'Your changes are live.'}</span>
		</div>
		<button type="button" onClick={props.onDismiss}>
			Dismiss
		</button>
	</aside>
}

function SavedToast(props: SavedToastProps) {
	return createPortal(ToastBody, props.target, { onDismiss: props.onDismiss });
}

export function PortalEventDemo() @{
	const portalTargetRef = useRef<HTMLDivElement | null>(null);
	const [targetReady, setTargetReady] = useState(false);
	const [showToast, setShowToast] = useState(false);
	const [parentClicks, setParentClicks] = useState(0);
	const portalTarget = portalTargetRef.current;

	useLayoutEffect(() => setTargetReady(true), []);

	<section class="portal-demo" data-demo="portal" aria-label="Portal event bubbling example">
		<div class="portal-demo-grid">
			<div class="portal-demo-source">
				<span class="portal-demo-label">Logical source</span>
				<button type="button" onClick={() => setShowToast(true)} disabled={showToast}>
					{showToast ? 'Toast is showing' : 'Show saved toast'}
				</button>
				<div class="portal-demo-parent" onClick={() => setParentClicks((count) => count + 1)}>
					<span>{'Event parent'}</span>
					@if (targetReady && portalTarget !== null && showToast) {
						<SavedToast target={portalTarget} onDismiss={() => setShowToast(false)} />
					}
				</div>
			</div>

			<div class="portal-demo-target">
				<span class="portal-demo-label">Separate DOM target</span>
				<div class="portal-demo-layer" ref={portalTargetRef} />
			</div>
		</div>

		<p class="portal-demo-result" aria-live="polite">
			{'Clicks observed by the logical parent: ' + parentClicks}
		</p>

		<style>
			.portal-demo {
				margin: 1.4rem 0 1.75rem;
				padding: 1rem;
				border: 1px solid var(--border);
				border-radius: 1rem;
				background: var(--panel);
			}
			.portal-demo-grid {
				display: grid;
				grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
				gap: 0.85rem;
			}
			.portal-demo-source,
			.portal-demo-target {
				min-height: 9rem;
				padding: 0.9rem;
				border: 1px solid var(--border);
				border-radius: 0.8rem;
				background: var(--surface-inset);
			}
			.portal-demo-label {
				display: block;
				margin-bottom: 0.8rem;
				color: var(--text-secondary);
				font-size: 0.75rem;
				font-weight: 750;
				letter-spacing: 0.04em;
				text-transform: uppercase;
			}
			.portal-demo-source > button,
			:global(.portal-demo-toast button) {
				border: 1px solid transparent;
				border-radius: 999px;
				background: var(--accent);
				color: var(--on-accent);
				font: inherit;
				font-size: 0.82rem;
				font-weight: 700;
				padding: 0.45rem 0.8rem;
				cursor: pointer;
			}
			.portal-demo-source > button:disabled {
				opacity: 0.55;
				cursor: default;
			}
			.portal-demo-parent {
				margin-top: 0.85rem;
				padding: 0.55rem 0.7rem;
				border: 1px dashed var(--border);
				border-radius: 0.6rem;
				color: var(--text-secondary);
				font-size: 0.8rem;
			}
			.portal-demo-layer {
				min-height: 5.5rem;
			}
			/* Portal content lives outside this component's scoped DOM subtree. */
			:global(.portal-demo-toast) {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.8rem;
				padding: 0.8rem;
				border: 1px solid rgba(99, 211, 145, 0.35);
				border-radius: 0.75rem;
				background: rgba(33, 105, 65, 0.2);
				box-shadow: 0 0.8rem 2rem rgba(0, 0, 0, 0.22);
			}
			:global(.portal-demo-toast div) {
				display: grid;
				gap: 0.15rem;
			}
			:global(.portal-demo-toast strong) {
				color: var(--text);
				font-size: 0.88rem;
			}
			:global(.portal-demo-toast span) {
				color: var(--text-secondary);
				font-size: 0.75rem;
			}
			:global(.portal-demo-toast button) {
				background: transparent;
				border-color: var(--border);
				padding: 0.35rem 0.65rem;
			}
			.portal-demo-result {
				margin: 0.85rem 0 0;
				color: var(--text-secondary);
				font-size: 0.8rem;
			}
			@media (max-width: 620px) {
				.portal-demo-grid {
					grid-template-columns: 1fr;
				}
			}
		</style>
	</section>
}
