// The nested scroll-spy shared by longer pages (docs, benchmarks). Its host owns
// the responsive sidebar shell; this component owns the animated section list,
// active indicator, scrolling, and focus handoff. Each section id must exist in
// the document on a target with enough scroll-margin-top to clear the sticky
// header. `resetKey` scopes the highlight to one page identity so a client
// navigation between hosts that share an id cannot briefly light the new list.
import { useEffect, useLayoutEffect, useRef, useState } from 'octane';

export interface TocSection {
	id: string;
	title: string;
	// Heading depth for the tree: 2 for a top-level `<h2>` row (the default),
	// 3 for a nested `<h3>` row.
	level?: 2 | 3;
}

// The scroll-spy's activation line: a section is "current" once its heading has
// crossed this line under the sticky header (~60px) plus a little breathing
// room. Shared by live tracking and the click-settle check below.
const ACTIVATION_LINE = 100;
// How long after the last scroll tick a TOC click is considered settled. Long
// enough to bridge the gap between smooth-scroll frames (and the delay before
// the first one); short enough that live tracking resumes promptly.
const CLICK_SETTLE_MS = 250;

// True when a scrollable page is parked at its very bottom. Guarded on
// scrollability because on a short page that fits the viewport the bottom test
// would be satisfied from the very top.
function isAtPageBottom(): boolean {
	const scrollable = document.documentElement.scrollHeight - window.innerHeight > 1;
	return scrollable &&
		window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
}

export function OnThisPage(props: {
	sections: readonly TocSection[];
	resetKey?: string;
	onNavigate?: () => void | Promise<void>;
}) @{
	const sections = props.sections;
	const resetKey = props.resetKey ?? '';

	// The active section id is stored WITH the reset key that measured it, and
	// only counts for that key: a client navigation to another host page that
	// shares a section id (e.g. #next-steps) must not light the new TOC — or
	// slide the indicator to a same-named row — before the new page's own
	// scroll-spy has run. Deriving (rather than clearing in an effect) keeps the
	// very first render of the new page clean; the setter bails on no-change so
	// the per-frame scroll spy doesn't re-render every scroll step.
	const [active, setActive] = useState({ key: '', id: '' });
	const activeId =
		active.key === resetKey ? active.id : '';
	const setActiveId = (id: string) => setActive(
		(prev) => (prev.key === resetKey && prev.id === id ? prev : { key: resetKey, id }),
	);
	const tocTrack = useRef<HTMLDivElement | null>(null);
	// A TOC click claims its target here so the scroll-spy can hold that row lit
	// through the smooth scroll instead of walking the highlight through every
	// section the animation sweeps past. The lock is held for the WHOLE flight —
	// every locked scroll tick re-arms the settle timer, so a fixed deadline
	// can't expire mid-scroll — and released exactly once, when scrolling has
	// settled. The release then judges the outcome: if the click LANDED (the
	// target sits at the activation line, or the page parked at the bottom with
	// the target still in view — a near-bottom heading that can never reach the
	// line), the clicked row stays lit; the bottom-snap rule must not steal the
	// highlight the reader just chose. Only if the reader went somewhere else
	// mid-flight (an interrupted scroll) does the spy re-measure, resuming live
	// tracking from wherever they actually are.
	const clickLock = useRef<string | null>(null);
	const clickTimer = useRef(0);
	const measureRef = useRef<(() => void) | null>(null);
	const armClickRelease = () => {
		if (clickTimer.current !== 0) clearTimeout(clickTimer.current);
		clickTimer.current = window.setTimeout(() => {
			const id = clickLock.current;
			clickLock.current = null;
			clickTimer.current = 0;
			const heading =
				id !== null ? document.getElementById(id) : null;
			if (heading) {
				const top = heading.getBoundingClientRect().top;
				// scrollIntoView lands the heading just under the sticky header
				// (scroll-margin-top ≈ 88px, line = 100), so a small tolerance on
				// the line covers rounding; the bottom clause accepts any visible
				// resting spot when the page ran out of scroll room.
				const landed =
					top >= -2 && (top <= ACTIVATION_LINE + 4 || isAtPageBottom() && top < window.innerHeight);
				if (landed) return;
			}
			// The reader ended up elsewhere — resume live tracking right away
			// rather than leaving the clicked row lit until the next scroll.
			measureRef.current?.();
		}, CLICK_SETTLE_MS);
	};

	// Scroll-spy: the active section is the last heading whose top has crossed a
	// line just below the sticky header. Reads are coalesced into one rAF so
	// scrolling stays cheap, and on a scrollable page the final section is forced
	// active at the very bottom so a short trailing heading still lights up. There
	// is always exactly one active id, so the highlight never flickers through an
	// empty gap.
	useEffect(() => {
		if (sections.length === 0) return;
		const headings = sections.map((section) => document.getElementById(section.id)).filter(
			(el) => el !== null,
		) as HTMLElement[];
		if (headings.length === 0) return;

		let frame = 0;
		const measure = () => {
			// While a TOC click is in flight, hold the clicked row and only push the
			// settle timer out — ALL release decisions (including whether the click
			// landed) happen once, in the settle callback, where the bottom-snap
			// rule below can no longer steal the highlight mid-judgement.
			if (clickLock.current !== null) {
				armClickRelease();
				return;
			}
			let current = headings[0].id;
			for (const heading of headings) {
				if (heading.getBoundingClientRect().top <= ACTIVATION_LINE) current = heading.id;
				else break;
			}
			// At the very bottom of a scrollable page, force the final section: a
			// short trailing section whose heading can't reach the activation line
			// could otherwise never light up.
			if (isAtPageBottom()) current = headings[headings.length - 1].id;
			setActiveId(current);
		};
		// The rAF wrapper owns the frame bookkeeping — measure() itself must not
		// touch it, because the click-lock fallback also calls measure() directly
		// and must not orphan a pending frame id (cleanup could then no longer
		// cancel it).
		const onScroll = () => {
			if (frame === 0) {
				frame = requestAnimationFrame(() => {
					frame = 0;
					measure();
				});
			}
		};

		measure();
		measureRef.current = measure;
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll, { passive: true });
		return () => {
			measureRef.current = null;
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
			if (frame !== 0) cancelAnimationFrame(frame);
			if (clickTimer.current !== 0) clearTimeout(clickTimer.current);
			clickLock.current = null;
		};
	}, [resetKey]);

	// Slide the accent indicator onto the active row: measure its real position
	// within the track and hand the numbers to CSS, which animates the transform
	// and height. Measuring the rendered link (not an assumed row height) keeps it
	// exact when titles wrap or nest. This is a LAYOUT effect so the numbers land
	// before the paint that reveals the bar (is-active flips in the same commit) —
	// with a passive effect the bar painted once at the default top position and
	// slid from there. On the first reveal of a track the transform/height
	// transitions are suppressed for one placement, so the bar fades in already
	// sitting on the active row instead of animating in from the old value.
	// Geometry can also shift with NO activeId change when a title rewraps, a
	// font swaps, or the responsive sidebar opens. The ResizeObserver therefore
	// watches both the track (overall layout) and link (its own box). resetKey is
	// a dependency so a route change re-targets the new nodes even when the new
	// page's active id is identical.
	useLayoutEffect(() => {
		const track = tocTrack.current;
		if (!track) return;
		if (activeId === '') {
			// Inactive (fresh page before its first measure): the next activation is
			// a first reveal again.
			delete track.dataset.placed;
			return;
		}
		const link = track.querySelector<HTMLElement>('[data-id="' + activeId + '"]');
		if (!link) return;
		const placeVars = () => {
			track.style.setProperty('--indicator-y', link.offsetTop + 'px');
			track.style.setProperty('--indicator-h', link.offsetHeight + 'px');
		};
		const place = () => {
			// A host may temporarily hide the list while its mobile disclosure is
			// closed. Skip zero-sized passes; the observer fires again once the
			// track has measurable rows.
			if (link.offsetHeight === 0) return;
			if (track.dataset.placed === undefined) {
				// First successful placement for this track: keep only the opacity
				// transition so position and size snap (the bar fades in already on
				// its row); the full transition list is restored after a forced style
				// flush so later moves animate again. Marking placed only here — not
				// on a skipped hidden pass — keeps the eventual first reveal stable.
				const indicator = track.querySelector<HTMLElement>('.toc-indicator');
				if (indicator) {
					indicator.style.transitionProperty = 'opacity';
					placeVars();
					void indicator.offsetWidth;
					indicator.style.transitionProperty = '';
				} else {
					placeVars();
				}
				track.dataset.placed = '';
			} else {
				placeVars();
			}
		};
		place();
		// The observer is a browser-only enhancement over the essential place()
		// above — jsdom (the website unit tests) doesn't implement it.
		if (typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(place);
		observer.observe(track);
		observer.observe(link);
		return () => observer.disconnect();
	}, [activeId, resetKey]);

	// Smooth-scroll to a heading, honoring reduced-motion, and move focus there
	// (without a second scroll jump) so keyboard and screen-reader users land in
	// the section. replaceState syncs the URL hash without pushing history or
	// tripping the router.
	const scrollToSection = (event: MouseEvent, id: string) => {
		const heading = document.getElementById(id);
		if (!heading) return;
		event.preventDefault();
		const navigate = () => {
			const reduce =
				typeof window.matchMedia === 'function' &&
					window.matchMedia('(prefers-reduced-motion: reduce)').matches;
			// Claim the target before scrolling so the spy holds it through the
			// smooth animation; the settle timer (re-armed by every scroll tick)
			// then judges the outcome once scrolling stops. This initial arm covers
			// the no-scroll case where the target is already in position.
			clickLock.current = id;
			armClickRelease();
			heading.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
			heading.setAttribute('tabindex', '-1');
			heading.focus({ preventScroll: true });
			history.replaceState(null, '', '#' + id);
			setActiveId(id);
		};
		// A mobile host returns a promise that settles after its height animation,
		// so scrollIntoView measures the collapsed page. Desktop hosts close
		// synchronously and take the immediate path.
		const collapsed = props.onNavigate?.();
		if (collapsed instanceof Promise) void collapsed.then(navigate);
		else navigate();
	};

	<nav class="on-this-page" aria-label="On this page">
		<div class="toc-reveal">
			<div class="toc-reveal-inner">
				<div class={['toc-track', activeId !== '' && 'is-active']} ref={tocTrack}>
					<span class="toc-indicator" aria-hidden="true"></span>
					<ul class="toc-list">
						@for (const section of sections; key section.id) {
							<li class="toc-item" data-level={section.level === 3 ? '3' : '2'}>
								<a
									href={'#' + section.id}
									class="toc-link"
									data-id={section.id}
									aria-current={activeId === section.id ? 'true' : undefined}
									onClick={(event: MouseEvent) => scrollToSection(event, section.id)}
								>
									<span class="toc-link-text">
										{section.title as string}
									</span>
								</a>
							</li>
						}
					</ul>
				</div>
			</div>
		</div>
		<style>
			.on-this-page {
				margin: 0.2rem 0.45rem 0.55rem 0.75rem;
			}
			/* The active page mounts this list under its top-level sidebar row. A
			   one-track grid lets the submenu open to its natural height without
			   measuring or pinning it in JavaScript. */
			.toc-reveal {
				display: grid;
				grid-template-rows: 1fr;
				animation: toc-reveal 0.24s cubic-bezier(0.22, 0.61, 0.36, 1) both;
			}
			.toc-reveal-inner {
				min-height: 0;
				overflow: hidden;
			}
			@keyframes toc-reveal {
				from {
					opacity: 0;
					grid-template-rows: 0fr;
				}
			}
			/* The rail is a timeline: a hairline guide runs its full height, and both
			   the sliding accent indicator and the links sit against it. */
			.toc-track {
				position: relative;
			}
			.toc-track::before {
				content: '';
				position: absolute;
				top: 0.2rem;
				bottom: 0.2rem;
				left: 0;
				width: 1px;
				background: var(--border);
			}
			.toc-indicator {
				position: absolute;
				left: 0;
				top: 0;
				width: 2px;
				height: var(--indicator-h, 1.6rem);
				background: var(--accent);
				transform: translateY(var(--indicator-y, 0));
				opacity: 0;
				transition:
					transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1),
					height 0.32s cubic-bezier(0.22, 0.61, 0.36, 1),
					opacity 0.2s ease;
			}
			/* Shown only once JS has measured a target, so SSR / no-JS shows no stray
			   accent bar pinned at the top. */
			.toc-track.is-active .toc-indicator {
				opacity: 1;
			}
			.toc-list {
				list-style: none;
				margin: 0;
				padding: 0;
			}
			.toc-item {
				margin: 0;
			}
			.toc-link {
				display: block;
				padding: 0.3rem 0 0.3rem 1rem;
				color: var(--text-secondary);
				font-size: 0.8rem;
				line-height: 1.4;
				transition: color 0.18s ease;
			}
			/* Nested (h3) rows indent further from the guide and sit a touch quieter. */
			.toc-item[data-level='3'] .toc-link {
				padding-left: 1.75rem;
				font-size: 0.76rem;
			}
			.toc-link:hover {
				color: var(--text);
				text-decoration: none;
			}
			.toc-link[aria-current='true'] {
				color: var(--text);
			}
			@media (prefers-reduced-motion: reduce) {
				.toc-reveal {
					animation: none;
				}
				.toc-indicator,
				.toc-link {
					transition: none;
				}
			}
		</style>
	</nav>
}
