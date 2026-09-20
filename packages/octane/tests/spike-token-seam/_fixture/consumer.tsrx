import { tokens } from './tokens';

export function Badge() @{
	<div>
		<style>
			.badge {
				color: var(--app-colors-primary);
				padding: var(--app-space-md, 4px);
				margin: var(--legacy-page-gutter);
			}
			@media (prefers-contrast: more) {
				.badge {
					border-color: var(--app-colors-surface);
				}
			}
		</style>
		<span class="badge">{tokens.vars.colors.primary}</span>
	</div>
}
