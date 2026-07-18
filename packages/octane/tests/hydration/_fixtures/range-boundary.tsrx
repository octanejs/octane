import { createElement, createPortal, HYDRATION_RANGE_BOUNDARY } from 'octane';

function HydrationOwner(props) {
	return props.children;
}

HydrationOwner[HYDRATION_RANGE_BOUNDARY] = 'owner';

function BoundaryHost(props) {
	return createElement(HydrationOwner, {}, props.children);
}

function Passthrough(props) @{
	<>
		{props.children}
	</>
}

function PortalBridge(props) {
	return createPortal(props.children, props.target);
}

function Interactive() @{
	const [count, setCount] = useState(0);
	<button
		id="range-boundary-counter"
		onClick={() => setCount(count + 1)}
	>{`count ${count}`}</button>
}

export function ServerSelection() @{
	<BoundaryHost>
		<Interactive />
	</BoundaryHost>
}

export function BoundaryClient(props) @{
	<Passthrough>
		<PortalBridge target={props.portalTarget}>
			<span id="range-boundary-portal">portal</span>
		</PortalBridge>
		@try {
			@if (props.enabled) {
				<BoundaryHost>
					<Interactive />
				</BoundaryHost>
			}
		} @catch (error) {
			<p>{String(error)}</p>
		}
	</Passthrough>
}

BoundaryClient[HYDRATION_RANGE_BOUNDARY] = 'passthrough';
