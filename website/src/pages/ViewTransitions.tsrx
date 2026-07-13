// /view-transitions — a live demo of octane's <ViewTransition> boundary
// (docs/view-transitions.md): enter/exit on a toggled card, a shared-element
// "hero" morph between two layouts, and addTransitionType driving direction-
// aware classes. Everything animates only in browsers with
// document.startViewTransition (Chromium/Safari); elsewhere the UI still
// works, it just commits instantly — the same progressive-enhancement story
// as the API itself. The e2e suite drives this route in a real browser, so
// the demo doubles as live coverage for the wrapped-commit path.
import { useState, ViewTransition, startTransition, addTransitionType } from 'octane';

const PANELS = ['Overview', 'Details', 'Reviews'];
const CARD_ENTER = { 'card-toggle': 'vt-pop-in', default: 'none' };
const CARD_EXIT = { 'card-toggle': 'vt-pop-out', default: 'none' };
const HERO_SHARE = { 'hero-move': 'auto', default: 'none' };

export function ViewTransitionsDemo() @{
	const [showCard, setShowCard] = useState(true);
	const [heroRight, setHeroRight] = useState(false);
	const [panel, setPanel] = useState(0);

	<div class="vtdemo">
		<h1>View Transitions</h1>
		<p class="vtdemo-sub">
			{'React’s experimental '}
			<code>{'<ViewTransition>'}</code>
			{' API on octane — powered by the browser’s native View Transitions. '}
			{'See '}
			<a
				href="https://github.com/octanejs/octane/blob/main/docs/view-transitions.md"
			>{'docs/view-transitions.md'}</a>
			{'.'}
		</p>

		<section class="vtdemo-block">
			<h2>{'Enter / exit'}</h2>
			<button
				class="vtdemo-btn"
				id="vt-toggle-card"
				onClick={() => startTransition(() => {
					addTransitionType('card-toggle');
					setShowCard(!showCard);
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
			<h2>{'Shared element'}</h2>
			<button
				class="vtdemo-btn"
				id="vt-toggle-hero"
				onClick={() => startTransition(() => {
					addTransitionType('hero-move');
					setHeroRight(!heroRight);
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

		<section class="vtdemo-block">
			<h2>{'Transition types'}</h2>
			<div class="vtdemo-tabs">
				@for (const name of PANELS; key name) {
					<button
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
					<div class="vtdemo-panel">{PANELS[panel]}</div>
				</ViewTransition>
			</div>
		</section>

		<style>
			.vtdemo {
				max-width: 860px;
				margin: 0 auto;
				padding: 3rem 1.5rem 5rem;
			}
			.vtdemo-sub {
				color: #99a1b3;
				margin: 0 0 2.5rem;
			}
			.vtdemo-block {
				margin-bottom: 3rem;
			}
			.vtdemo-block h2 {
				font-size: 1.1rem;
				margin: 0 0 0.75rem;
			}
			.vtdemo-btn {
				background: #ff415a;
				color: #f4eee8;
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
				background: #23272f;
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
				background: #23272f;
				color: #99a1b3;
				border: 1px solid #343a46;
				border-radius: 8px;
				padding: 0.4rem 0.9rem;
				cursor: pointer;
			}
			.vtdemo-tab.active {
				color: #f4eee8;
				border-color: #ff415a;
			}
			.vtdemo-panel {
				background: #23272f;
				border: 1px solid #343a46;
				border-radius: 12px;
				padding: 2rem;
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
	</div>
}
