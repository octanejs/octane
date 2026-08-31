import { FRAMEWORK_INTEGRATIONS } from '../content/framework-integrations.ts';
import { ecosystemPackageGuideHref } from '../lib/ecosystem-presentation.ts';

export function FrameworkIntegrationsDirectory() @{
	<div class="framework-integration-directory">
		@for (const integration of FRAMEWORK_INTEGRATIONS; key integration.packageName) {
			<article class="framework-integration-card">
				<header>
					<span class="framework-integration-model">{integration.model as string}</span>
					<h3>{integration.title as string}</h3>
				</header>
				<p>{integration.description as string}</p>
				<a
					class="framework-integration-link"
					href={ecosystemPackageGuideHref(integration.packageName)}
				>
					<code>{integration.packageName as string}</code>
				</a>
			</article>
		}

		<style>
			.framework-integration-directory {
				display: grid;
				grid-template-columns: repeat(3, minmax(0, 1fr));
				gap: 0.85rem;
				margin: 1.5rem 0;
			}
			.framework-integration-card {
				display: flex;
				flex-direction: column;
				align-items: flex-start;
				padding: 1.1rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: var(--surface-subtle);
			}
			.framework-integration-model {
				display: inline-flex;
				padding: 0.15rem 0.45rem;
				border: 1px solid rgba(255, 93, 114, 0.24);
				border-radius: 999px;
				background: rgba(255, 65, 90, 0.08);
				color: var(--danger-text);
				font-size: 0.7rem;
				font-weight: 750;
				letter-spacing: 0.02em;
			}
			.framework-integration-card h3 {
				margin: 0.65rem 0 0;
				font-size: 1.05rem;
			}
			.framework-integration-card p {
				flex: 1;
				margin: 0.65rem 0 0.9rem;
				color: var(--text-secondary);
				font-size: 0.84rem;
				line-height: 1.5;
			}
			.framework-integration-link {
				display: inline-flex;
				max-width: 100%;
				border: 1px solid var(--border);
				border-radius: 0.5rem;
				background: var(--code-bg);
				text-decoration: none;
				transition:
					border-color 0.15s,
					background 0.15s;
			}
			.framework-integration-link:hover {
				border-color: rgba(255, 93, 114, 0.55);
				background: rgba(255, 65, 90, 0.08);
			}
			.framework-integration-card .framework-integration-link code {
				overflow: hidden;
				max-width: 100%;
				padding: 0.35rem 0.5rem;
				border: 0;
				background: transparent;
				color: var(--accent-text);
				font-size: 0.75rem;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			@media (max-width: 850px) {
				.framework-integration-directory {
					grid-template-columns: 1fr;
				}
			}
		</style>
	</div>
}
