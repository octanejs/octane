export function PreferenceField(props: { onChange: (value: string) => void }) @{
	<button type="button" onClick={() => props.onChange('compact')}>
		Choose compact
	</button>
}

export function App() @{
	<main>
		<h1>Native event settings</h1>
	</main>
}
