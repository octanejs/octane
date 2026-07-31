export function Panel(props: { children?: any }) @{
	<>
		<section class="panel">
			<h3>Panel</h3>
			{props.children}
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
