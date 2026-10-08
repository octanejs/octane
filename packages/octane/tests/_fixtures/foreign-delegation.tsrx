export function App(props) @{
	<div class="outer" onClickCapture={() => props.log('octane-capture')}>
		<button class="octane" onClick={() => props.log('octane-bubble')}>
			{'x'}
		</button>
		<div class="foreign-host" />
	</div>
}
