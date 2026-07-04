import { use, useState, createElement, Fragment } from 'octane';

// Value-position pure-host descriptor (the de-opt path): the ref lives in the
// descriptor's props and is stamped on the built node via DEOPT_DESC.
function DeoptHost(props) {
	return createElement('span', { ref: props.dRef, class: 'd' }, 'D');
}

function RefHost(props) @{
	<>
		<span ref={props.objRef} class="a">{'A'}</span>
		<span ref={props.cbRef} class="b">{'B'}</span>
		<span {...props.sp} class="s">{'S'}</span>
		<Fragment ref={props.fRef}>
			<span class="f1">{'F1'}</span>
		</Fragment>
		<DeoptHost dRef={props.dRef} />
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
			<RefHost
				objRef={props.objRef}
				cbRef={props.cbRef}
				sp={props.sp}
				fRef={props.fRef}
				dRef={props.dRef}
			/>
			@if (show) {
				<Async promise={props.promise} />
			}
		</>
	} @pending {
		<span class="fb">{'F'}</span>
	}
}
