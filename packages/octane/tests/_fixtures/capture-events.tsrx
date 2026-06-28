export function App(props) @{
	<div
		class="outer"
		onClickCapture={() => props.log('outer-capture')}
		onClick={() => props.log('outer-bubble')}
	>
		<button
			class="inner"
			onClickCapture={() => props.log('inner-capture')}
			onClick={() => props.log('inner-bubble')}
		>{'x'}</button>
	</div>
}
