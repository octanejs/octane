export function App() @{
	<section class="panel">
		<style>
			.title {
				font-weight: 600;
			}
			.toolbar {
				display: flex;
				gap: 8px;
			}
			.toolbar .hint {
				margin-left: auto;
			}
			.close {
				border: 0;
				background: none;
			}
		</style>
		<h2 class="title">Settings</h2>
		<div class="toolbar">
			<button type="button">Save</button>
			<button type="button">Cancel</button>
			<button type="button" class="close">Dismiss</button>
			<span class="hint">Changes apply instantly</span>
		</div>
	</section>
}
