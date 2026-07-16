import { use } from 'octane';

function RenderProbe(props) @{
	<i class="render-probe" data-value={props.value}>{'probe'}</i>
}

// A parent can replace a pending promise with an already-ready one. The hidden
// primary reveals during that parent update, but its preserved refs still belong
// to the commit phase after every later sibling has rendered.
export function SupersededRefOrder(props) @{
	<>
		@try {
			const value = use(props.promise);
			<span class="superseded-value" ref={props.cbRef}>
				{value as string}
			</span>
		} @pending {
			<span class="superseded-fallback">{'loading'}</span>
		}
		<RenderProbe value={props.sentinel} />
	</>
}
