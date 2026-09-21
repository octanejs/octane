export function App() @{
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
		</style>
		<h2 class="title">Settings</h2>
		<div class="actions">
			<button type="button">Save</button>
			<button type="button">Cancel</button>
			<span class="hint">Changes apply instantly</span>
		</div>
	</section>
}
