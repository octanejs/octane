export function App(props: { initialName: string }) @{
	<section aria-label="Signup">
		<label>Name</label>
		<input value={props.initialName} />
		<h1 id="greeting">Not implemented</h1>
		<button id="submit-count" type="button">Submitted: 0</button>
	</section>
}
