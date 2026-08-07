// The two phones inside the home page's Lynx section.
//
// This module is the child of Lynx.tsrx's <Hydrate> boundary, so the compiler
// splits it — with the <Go> preview machinery behind it — into a chunk that
// only loads as the section approaches the viewport. The Lynx runtime and an
// example's assets are megabytes; the home page should not pay for them until
// a reader is actually going to look.
//
// Each card fetches only `example-metadata.json`, not the highlighted sources
// the docs' <Go> panel also pulls: there is no code on this page.
import { useEffect, useState } from 'octane';
import { Link, useLocation } from '@octanejs/tanstack-router';
import { LynxPreview } from '../../../components/go/LynxPreview.tsrx';
import {
	loadExampleMetadata,
	resolveEntry,
	exampleRoot,
} from '../../../components/go/example-data.ts';
import { LYNX_EXAMPLES, type LynxExample } from '../../../content/lynx-examples.ts';

interface CardProps {
	id: string;
	title: string;
	summary: string;
	active: boolean;
	autoGesture?: LynxExample['autoGesture'];
}

function ShowcaseCard(props: CardProps) @{
	const [bundle, setBundle] = useState('');

	useEffect(() => {
		// Route updates may wake a dormant hydration boundary before it unmounts.
		// Do not start this route's large preview resources once navigation begins.
		if (!props.active) return;
		const controller = new AbortController();
		loadExampleMetadata(props.id, controller.signal).then(
			(metadata) => {
				if (controller.signal.aborted) return;
				const entry = resolveEntry(metadata);
				if (entry?.webFile) setBundle(`${exampleRoot(props.id)}/${entry.webFile}`);
			},
			() => {
				// A missing example leaves the phone empty rather than breaking the
				// page around it. The docs panel is where a reader gets told why.
			},
		);
		return () => controller.abort();
	});

	<Link to="/docs/$slug" params={{ slug: 'lynx' }} class="lynx-card" hash={props.id}>
		<div class="lynx-device">
			<div class="lynx-screen">
				@if (props.active && bundle) {
					<LynxPreview
						src={bundle}
						label={props.title + ' running on Lynx for Web'}
						autoGesture={props.autoGesture}
					/>
				}
			</div>
		</div>
		<h3 class="lynx-card-title">{props.title as string}</h3>
		<p class="lynx-card-summary">{props.summary as string}</p>
		<span class="lynx-card-cta">View the demo and code →</span>
	</Link>
}

export function LynxShowcase() @{
	const pathname = useLocation({ select: (location) => location.pathname });

	<div class="lynx-cards">
		@for (const example of LYNX_EXAMPLES; key example.id) {
			<ShowcaseCard
				id={example.id}
				title={example.title}
				summary={example.summary}
				active={pathname === '/'}
				autoGesture={example.autoGesture}
			/>
		}

		<style>
			/* Two cards, each no wider than its phone plus a readable measure, so
			   the caption's left edge lines up with the device above it. */
			.lynx-cards {
				display: grid;
				gap: 2.5rem;
				grid-template-columns: minmax(0, 1fr);
				justify-items: center;
			}
			@media (min-width: 560px) {
				.lynx-cards {
					grid-template-columns: repeat(2, minmax(0, 1fr));
					gap: 1.5rem;
					align-items: start;
				}
			}
			/* The Link renders its own <a>, so a scoped class selector never lands
			   on it — reach it through :global, the same way the other sections
			   style their links. */
			/* 375px is the viewport these examples are authored for, and the
			   preview's responsive path maps `rpx` 1:1 at exactly that width — so
			   the phone shows the example as drawn rather than a re-based
			   approximation of it. Narrower screens re-base, which is the honest
			   trade for fitting. */
			.lynx-cards :global(a.lynx-card) {
				display: block;
				/* The bezel is border-box, so add its padding and hairline back: the
				   *screen* has to be 375px for `rpx` to map 1:1, not the card. */
				width: min(calc(375px + 1rem + 2px), 100%);
				color: inherit;
			}
			.lynx-cards :global(a.lynx-card:hover) {
				color: inherit;
			}
			/* A restrained bezel: enough to read as a device without pretending to
			   be a photograph of one. */
			.lynx-cards :global(.lynx-device) {
				width: 100%;
				padding: 0.5rem;
				border: 1px solid var(--border);
				border-radius: 1.75rem;
				background: var(--panel);
				box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
				transition: transform 0.25s ease;
			}
			.lynx-cards :global(a.lynx-card:hover .lynx-device) {
				transform: translateY(-4px);
			}
			/* Before the example mounts this is an empty screen, so it takes the
			   theme's inset fill rather than the preview's own dark backdrop — a
			   black slab on a light page reads as a broken image. LynxPreview
			   paints over it once it has something to show. Keep the 375px design
			   width, but use three quarters of the authored 812px screen height so
			   the home-page demos do not dominate the section. */
			.lynx-cards :global(.lynx-screen) {
				aspect-ratio: 375 / 609;
				border-radius: 1.3rem;
				overflow: hidden;
				background: var(--surface-inset);
			}
			.lynx-cards :global(.lynx-card-title) {
				margin: 1.5rem 0 0;
				font-size: 1.15rem;
				letter-spacing: -0.015em;
				color: var(--text);
			}
			.lynx-cards :global(.lynx-card-summary) {
				margin: 0.5rem 0 0;
				color: var(--text-secondary);
				font-size: 0.95rem;
				line-height: 1.6;
			}
			.lynx-cards :global(.lynx-card-cta) {
				display: inline-block;
				margin-top: 0.75rem;
				color: var(--accent-text);
				font-size: 0.9rem;
				font-weight: 600;
			}
			.lynx-cards :global(a.lynx-card:hover .lynx-card-cta) {
				text-decoration: underline;
				text-underline-offset: 0.16em;
			}
			@media (prefers-reduced-motion: reduce) {
				.lynx-cards :global(.lynx-device) {
					transition: none;
				}
				.lynx-cards :global(a.lynx-card:hover .lynx-device) {
					transform: none;
				}
			}
		</style>
	</div>
}
