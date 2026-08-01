export function Greeting(props: { name: string }) @{
	<>
		<p class="greeting" data-testid="greeting">{'Hello, ' + props.name}</p>
		<style>
			.greeting {
				color: #0f766e;
				font-weight: 600;
			}
		</style>
	</>
}
