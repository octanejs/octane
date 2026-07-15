// The "proven" stat strip: three numbers that back the claims above.
import { Link } from '@octanejs/tanstack-router';

export function Proven() @{
	<section class="proven">
		<div class="proven-stat">
			<span class="proven-number">7,000+</span>
			<span class="proven-label">
				{'test executions across the runtime, compiler, SSR and bindings, including ' +
						'compiler-mode reruns; the core suite has 2,200+ distinct cases. '}
				<a
				href="https://github.com/octanejs/octane/blob/main/docs/react-parity-coverage.md"
						target="_blank"
						rel="noreferrer"
					>React-derived coverage is tracked case by case</a>
			</span>
		</div>
		<div class="proven-stat">
			<span class="proven-number">0</span>
			<span class="proven-label">
				rules of hooks — put them behind conditions or after an early return
			</span>
		</div>
		<div class="proven-stat">
			<span class="proven-number">25</span>
			<span class="proven-label">
				{'ecosystem ports — Zustand, TanStack Query & Router, Radix, Lucide, '}
				<Link to="/docs/bindings">Recharts and more</Link>
			</span>
		</div>

		<style>
			/* A three-up stat strip. It shares the card language of the feature grid
			   above — panel fill, a faint accent wash, hairline border — but stays
			   flatter and quieter so the numbers, not the frames, carry it. */
			.proven {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 1rem;
				margin-top: 1.5rem;
				padding: 0 0 3rem;
			}
			@media (max-width: 900px) {
				.proven {
					grid-template-columns: 1fr;
				}
			}
			.proven-stat {
				position: relative;
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
				padding: 1rem;
				background: linear-gradient(160deg, rgba(255, 65, 90, 0.05), transparent 55%), var(--panel);
				border: 1px solid var(--border);
				border-radius: 1rem;
				overflow: hidden;
			}
			/* A short accent rule sits above each number as a shared eyebrow. */
			.proven-stat::before {
				content: '';
				width: 2rem;
				height: 2px;
				border-radius: 2px;
				background: var(--accent);
				opacity: 0.7;
			}
			.proven-number {
				font-size: 2.75rem;
				line-height: 1;
				font-weight: 800;
				letter-spacing: -0.03em;
				color: var(--accent);
				font-variant-numeric: tabular-nums;
			}
			.proven-label {
				color: var(--text-secondary);
				font-size: 0.925rem;
				line-height: 1.55;
				max-width: 24rem;
			}
			.proven-label a {
				color: var(--text);
				text-decoration: underline;
				text-decoration-color: var(--border);
				text-underline-offset: 0.15em;
				transition: text-decoration-color 0.15s ease;
			}
			.proven-label a:hover {
				text-decoration-color: var(--accent);
			}
		</style>
	</section>
}
