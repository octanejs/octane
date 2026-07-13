export function RootCatch(props: { error: unknown; reset: () => void }) @{
	<button class="root-catch" onClick={props.reset}>
		{'Fixture failed: ' + String(props.error)}
	</button>
}
