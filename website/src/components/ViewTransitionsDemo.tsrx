// Embedded Core APIs demo for Octane's <ViewTransition> boundary: enter/exit
// classes, a shared element, and addTransitionType-driven navigation. Browsers
// without document.startViewTransition commit each state update immediately.
import { useState, ViewTransition, startTransition, addTransitionType } from 'octane';

const PANELS = ['Overview', 'Details', 'Reviews'];
const CARD_ENTER = { 'card-toggle': 'vt-pop-in', default: 'none' };
const CARD_EXIT = { 'card-toggle': 'vt-pop-out', default: 'none' };
const HERO_SHARE = { 'hero-move': 'auto', default: 'none' };

export function ViewTransitionsDemo() @{
	const [showCard, setShowCard] = useState(true);
	const [heroRight, setHeroRight] = useState(false);
	const [panel, setPanel] = useState(0);

	<section
		class="vtdemo"
		data-demo="view-transitions"
		aria-label="Interactive View Transition examples"
	>
		<div class="vtdemo-grid">
			<section class="vtdemo-block">
				<h4>{'Enter and exit'}</h4>
				<button
					type="button"
					class="vtdemo-btn"
					id="vt-toggle-card"
					onClick={() => startTransition(() => {
						addTransitionType('card-toggle');
						setShowCard((current) => !current);
					})}
				>
					{showCard ? 'Remove card' : 'Add card'}
				</button>
				<div class="vtdemo-stage">
					@if (showCard) {
						<ViewTransition enter={CARD_ENTER} exit={CARD_EXIT} default="none">
							<div class="vtdemo-card">{'I animate in and out'}</div>
						</ViewTransition>
					}
				</div>
			</section>

			<section class="vtdemo-block">
				<h4>{'Shared element'}</h4>
				<button
					type="button"
					class="vtdemo-btn"
					id="vt-toggle-hero"
					aria-pressed={heroRight}
					onClick={() => startTransition(() => {
						addTransitionType('hero-move');
						setHeroRight((current) => !current);
					})}
				>{'Move hero'}</button>
				<div class="vtdemo-stage vtdemo-split">
					@if (heroRight) {
						<>
							<div class="vtdemo-slot" />
							<ViewTransition name="vt-demo-hero" share={HERO_SHARE} default="none">
								<div class="vtdemo-hero vtdemo-hero-big">{'hero'}</div>
							</ViewTransition>
						</>
					} @else {
						<>
							<ViewTransition name="vt-demo-hero" share={HERO_SHARE} default="none">
								<div class="vtdemo-hero">{'hero'}</div>
							</ViewTransition>
							<div class="vtdemo-slot" />
						</>
					}
				</div>
			</section>

			<section class="vtdemo-block vtdemo-block-wide">
				<h4>{'Transition types'}</h4>
				<div class="vtdemo-tabs" role="tablist" aria-label="Example sections">
					@for (const name of PANELS; key name) {
						<button
							type="button"
							role="tab"
							aria-selected={panel === PANELS.indexOf(name)}
							aria-controls="vt-demo-panel"
							class={panel === PANELS.indexOf(name) ? 'vtdemo-tab active' : 'vtdemo-tab'}
							onClick={() => {
								const next = PANELS.indexOf(name);
								if (next === panel) return;
								startTransition(() => {
									addTransitionType(next > panel ? 'nav-forward' : 'nav-back');
									setPanel(next);
								});
							}}
						>{name}</button>
					}
				</div>
				<div class="vtdemo-stage">
					<ViewTransition
						update={{ 'nav-forward': 'vt-slide-fwd', 'nav-back': 'vt-slide-back', default: 'none' }}
						default="none"
					>
						<div class="vtdemo-panel" id="vt-demo-panel" role="tabpanel">{PANELS[panel]}</div>
					</ViewTransition>
				</div>
			</section>
		</div>

		<style>
			.vtdemo {
				margin: 1.4rem 0 1.75rem;
				padding: 1rem;
				border: 1px solid var(--border);
				border-radius: 1rem;
				background:
					radial-gradient(circle at 95% 0%, rgba(255, 65, 90, 0.12), transparent 32%), var(--panel);
			}
			.vtdemo-grid {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.85rem;
			}
			.vtdemo-block {
				min-width: 0;
				padding: 1rem;
				border: 1px solid var(--border);
				border-radius: 0.8rem;
				background: rgba(15, 17, 22, 0.3);
			}
			.vtdemo-block-wide {
				grid-column: 1 / -1;
			}
			.vtdemo-block h4 {
				font-size: 0.95rem;
				margin: 0 0 0.75rem;
			}
			.vtdemo-btn {
				background: #ff415a;
				color: var(--on-accent);
				font-weight: 600;
				border: none;
				padding: 0.5rem 1.1rem;
				border-radius: 9999px;
				cursor: pointer;
			}
			.vtdemo-btn:hover {
				background: #ff5d72;
			}
			.vtdemo-stage {
				margin-top: 1rem;
				min-height: 96px;
			}
			.vtdemo-card {
				display: inline-block;
				background: var(--bg);
				border: 1px solid #343a46;
				border-radius: 12px;
				padding: 1.5rem 2rem;
			}
			.vtdemo-split {
				display: flex;
				gap: 1rem;
				align-items: flex-start;
			}
			.vtdemo-slot {
				flex: 1;
			}
			.vtdemo-hero {
				width: 96px;
				height: 96px;
				border-radius: 16px;
				background: linear-gradient(135deg, #ff415a, #c98500);
				display: flex;
				align-items: center;
				justify-content: center;
				font-weight: 700;
			}
			.vtdemo-hero-big {
				width: 160px;
				height: 96px;
				border-radius: 24px;
			}
			.vtdemo-tabs {
				display: flex;
				gap: 0.5rem;
			}
			.vtdemo-tab {
				background: var(--bg);
				color: var(--text-secondary);
				border: 1px solid #343a46;
				border-radius: 8px;
				padding: 0.4rem 0.9rem;
				cursor: pointer;
			}
			.vtdemo-tab.active {
				color: var(--text);
				border-color: #ff415a;
			}
			.vtdemo-panel {
				background: var(--bg);
				border: 1px solid #343a46;
				border-radius: 12px;
				padding: 1.5rem;
			}
			@media (max-width: 620px) {
				.vtdemo-grid {
					grid-template-columns: 1fr;
				}
				.vtdemo-block-wide {
					grid-column: auto;
				}
				.vtdemo-tabs {
					flex-wrap: wrap;
				}
			}

			/* The browser's transition pseudo-tree lives at the document root, so
			 * these selectors must escape TSRX's component scoping. Keep the page
			 * itself still while the named demo elements animate independently. */
			:global(::view-transition-old(root)),
			:global(::view-transition-new(root)) {
				animation: none;
			}
			:global(::view-transition-group(vt-demo-hero)) {
				animation-duration: 520ms;
				animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
			}
			:global(::view-transition-old(.vt-pop-out)),
			:global(::view-transition-new(.vt-pop-in)),
			:global(::view-transition-old(.vt-slide-fwd)),
			:global(::view-transition-new(.vt-slide-fwd)),
			:global(::view-transition-old(.vt-slide-back)),
			:global(::view-transition-new(.vt-slide-back)) {
				mix-blend-mode: normal;
			}
			:global(::view-transition-old(.vt-pop-out)) {
				transform-origin: center;
				animation: vt-pop-out 280ms cubic-bezier(0.4, 0, 1, 1) both;
			}
			:global(::view-transition-new(.vt-pop-in)) {
				transform-origin: center;
				animation: vt-pop-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
			}
			:global(::view-transition-old(.vt-slide-fwd)) {
				animation: vt-slide-out-left 320ms cubic-bezier(0.4, 0, 0.2, 1) both;
			}
			:global(::view-transition-new(.vt-slide-fwd)) {
				animation: vt-slide-in-right 320ms cubic-bezier(0.4, 0, 0.2, 1) both;
			}
			:global(::view-transition-old(.vt-slide-back)) {
				animation: vt-slide-out-right 320ms cubic-bezier(0.4, 0, 0.2, 1) both;
			}
			:global(::view-transition-new(.vt-slide-back)) {
				animation: vt-slide-in-left 320ms cubic-bezier(0.4, 0, 0.2, 1) both;
			}
			@keyframes vt-pop-in {
				from {
					opacity: 0;
					transform: translateY(14px) scale(0.78);
				}
			}
			@keyframes vt-pop-out {
				to {
					opacity: 0;
					transform: translateY(-10px) scale(0.82);
				}
			}
			@keyframes vt-slide-out-left {
				to {
					opacity: 0;
					transform: translateX(-18%);
				}
			}
			@keyframes vt-slide-in-right {
				from {
					opacity: 0;
					transform: translateX(18%);
				}
			}
			@keyframes vt-slide-out-right {
				to {
					opacity: 0;
					transform: translateX(18%);
				}
			}
			@keyframes vt-slide-in-left {
				from {
					opacity: 0;
					transform: translateX(-18%);
				}
			}
			@media (prefers-reduced-motion: reduce) {
				:global(::view-transition-group(vt-demo-hero)),
				:global(::view-transition-old(.vt-pop-out)),
				:global(::view-transition-new(.vt-pop-in)),
				:global(::view-transition-old(.vt-slide-fwd)),
				:global(::view-transition-new(.vt-slide-fwd)),
				:global(::view-transition-old(.vt-slide-back)),
				:global(::view-transition-new(.vt-slide-back)) {
					animation-duration: 1ms;
				}
			}
		</style>
	</section>
}
