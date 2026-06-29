import { use, useState } from 'octane';

function RefHost(props) @{
	<>
		<span ref={props.objRef} class="a">{'A'}</span>
		<span ref={props.cbRef} class="b">{'B'}</span>
	</>
}
function Async(props) @{
	const v = use(props.promise);
	<span class="async">
		{v as string}
	</span>
}
export function App(props) @{
	const [show, setShow] = useState(false);
	props.bind(() => setShow(true));
	@try {
		<>
			<RefHost objRef={props.objRef} cbRef={props.cbRef} />
			@if (show) {
				<Async promise={props.promise} />
			}
		</>
	} @pending {
		<span class="fb">{'F'}</span>
	}
}
