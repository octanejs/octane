export const palette = <style>
	.card {
		color: navy;
	}
</style>;

export const spacing = <style>
	.card {
		padding: 12px;
	}
</style>;

export const theme = <style apply={[palette, spacing]}>
	.card {
		border: 1px solid navy;
	}
	.badge {
		font-size: 12px;
	}
</style>;

export function Card(props: { id: string; children?: unknown }) @{
	<>
		<style apply={theme} />
		<article id={props.id} class="card">{props.children}</article>
	</>
}

export function App() @{
	<main id="app">
		<Card id="first">First card</Card>
		<Card id="second">Second card</Card>
		<span id="badge" class={[theme.$class, 'badge']}>Themed</span>
	</main>
}
