import { isValidElement, useState } from 'octane';
import type { OctaneNode, Root } from 'octane';

function Toast(props: { label: string }) @{
	<output>{props.label}</output>
}

export function RenderIntoRoot(props: { root: Root; label: string }) @{
	<button onClick={() => props.root.render(<Toast label={props.label} />)}>{'open'}</button>
}

export function InlineIntrinsic() @{
	const [shown, setShown] = useState<OctaneNode>(null);
	<div>
		<button onClick={() => setShown(<b>{'bold'}</b>)}>{'open'}</button>
		{shown}
	</div>
}

// A handler-only local is installed where the DOM consumes it, not in setup.
export function LocalHandler() @{
	const [shown, setShown] = useState<OctaneNode>(null);
	const open = () => setShown(<Toast label="local" />);
	<div>
		<button onClick={open}>{'open'}</button>
		{shown}
	</div>
}

// Statement-bodied handlers with few captures can move to module scope.
export function BlockHandler(props: { label: string }) @{
	const [shown, setShown] = useState<OctaneNode>(null);
	const label = props.label;
	<div>
		<button
			onClick={(event) => {
				event.preventDefault();
				setShown(<Toast label={label} />);
			}}
		>
			{'open'}
		</button>
		{shown}
	</div>
}

export function BlockHandlerDirective(props: { label: string }) @{
	const [shown, setShown] = useState<OctaneNode>(null);
	const label = props.label;
	<div>
		<button
			onClick={(event) => {
				event.preventDefault();
				setShown(
					<p>
						@if (label) {
							<Toast label={label} />
						}
					</p>,
				);
			}}
		>
			{'open'}
		</button>
		{shown}
	</div>
}

export function AttributeValue() @{
	<p title={isValidElement(<Toast label="x" />) ? 'element' : 'value'}>{'text'}</p>
}
