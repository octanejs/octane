export function Panel(props: { children?: any; footerNote?: any }) @{
	<>
		<section class="panel" data-testid="panel">
			<h3>Panel</h3>
			<div data-testid="panel-children">{props.children}</div>
			@if (props.footerNote) {
				<footer data-testid="panel-footer">{props.footerNote}</footer>
			}
		</section>
		<style>
			.panel {
				border: 1px dashed #64748b;
				padding: 1rem;
				border-radius: 0.5rem;
			}
		</style>
	</>
}
