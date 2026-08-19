// The sponsor acknowledgement closes the homepage without interrupting its
// product narrative. The supplied lockup says what the relationship is, while
// the copy gives it enough context to remain clear outside the image.
import blacksmithOnDarkUrl from '../../../assets/blacksmith-ci-on-dark.svg';
import blacksmithOnLightUrl from '../../../assets/blacksmith-ci-on-light.svg';

export function Sponsor() @{
	<section class="sponsor" aria-labelledby="sponsor-heading">
		<div class="sponsor-inner">
			<div class="sponsor-copy">
				<p class="sponsor-kicker">Infrastructure sponsor</p>
				<h2 id="sponsor-heading" class="sponsor-title">
					Faster CI for a faster framework.
				</h2>
				<p class="sponsor-lead">
					{'Blacksmith supports Octane with high-performance CI for GitHub Actions. ' +
						'We’re grateful to the Blacksmith team for supporting open source.'}
				</p>
			</div>

			<a
				class="sponsor-lockup"
				href="https://blacksmith.sh"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="Visit Blacksmith, Octane’s infrastructure sponsor"
			>
				<img
					class="sponsor-logo sponsor-logo-on-dark"
					src={blacksmithOnDarkUrl}
					width={440}
					height={120}
					loading="lazy"
					decoding="async"
					alt="CI powered by Blacksmith"
				/>
				<img
					class="sponsor-logo sponsor-logo-on-light"
					src={blacksmithOnLightUrl}
					width={440}
					height={120}
					loading="lazy"
					decoding="async"
					alt="CI powered by Blacksmith"
				/>
			</a>
		</div>

		<style>
			.sponsor {
				border-top: 1px solid var(--border);
				padding: 4rem 0 0;
				margin-top: 2rem;
			}
			.sponsor-inner {
				max-width: 64rem;
				margin: 0 auto;
				display: grid;
				grid-template-columns: minmax(0, 1fr) minmax(18rem, 20rem);
				gap: 4rem;
				align-items: center;
			}
			.sponsor-kicker {
				margin: 0 0 0.65rem;
				color: var(--accent);
				font-size: 0.8rem;
				font-weight: 700;
				letter-spacing: 0.12em;
				text-transform: uppercase;
			}
			.sponsor-title {
				margin: 0;
				font-size: 2rem;
				line-height: 1.15;
				letter-spacing: -0.025em;
			}
			.sponsor-lead {
				max-width: 33rem;
				margin: 1rem 0 0;
				color: var(--text-secondary);
				font-size: 1rem;
				line-height: 1.6;
			}
			.sponsor-lockup {
				display: block;
				width: 100%;
				max-width: 20rem;
				justify-self: end;
				background: transparent;
				transition: transform 0.15s ease;
			}
			.sponsor-lockup:hover {
				transform: translateY(-2px);
				text-decoration: none;
			}
			.sponsor-lockup:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: 3px;
			}
			.sponsor-logo {
				display: block;
				width: 100%;
				height: auto;
			}
			.sponsor-logo-on-light {
				display: none;
			}
			:global(:root[data-theme='light']) .sponsor-logo-on-dark {
				display: none;
			}
			:global(:root[data-theme='light']) .sponsor-logo-on-light {
				display: block;
			}
			@media (max-width: 800px) {
				.sponsor-inner {
					max-width: 36rem;
					grid-template-columns: 1fr;
					gap: 2rem;
					margin: 0;
				}
				.sponsor-lockup {
					justify-self: start;
				}
			}
			@media (max-width: 560px) {
				.sponsor {
					padding-top: 3rem;
				}
				.sponsor-title {
					font-size: 1.75rem;
				}
			}
		</style>
	</section>
}
