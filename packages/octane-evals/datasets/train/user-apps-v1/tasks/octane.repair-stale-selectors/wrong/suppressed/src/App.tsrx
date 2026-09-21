export function App() @{
	// octane-ignore
	<section class="panel">
		<style>
			.title {
				font-weight: 600;
			}
			.actions {
				display: flex;
				gap: 8px;
			}
			.actions .hint {
				margin-left: auto;
			}
			.close {
				border: 0;
				background: none;
			}
		</style>
		<h2 class="title">Settings</h2>
		<div class="actions">
			<button type="button">Save</button>
			<button type="button">Cancel</button>
			<span class="hint">Changes apply instantly</span>
		</div>
	</section>
}
