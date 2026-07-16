import { createElement } from 'octane';

export function DirectDangerChild(props) @{
	<div id="direct-danger" dangerouslySetInnerHTML={props.danger}>{props.child}</div>
}

export function SpreadDangerChild(props) @{
	<div id="spread-danger" {...props.spread}>{props.child}</div>
}

export function DirectThenSpreadDangerChild(props) @{
	<div
		id="direct-then-spread-danger"
		dangerouslySetInnerHTML={props.direct}
		{...props.spread}
	>{props.child}</div>
}

export function SpreadThenDirectDangerChild(props) @{
	<div
		id="spread-then-direct-danger"
		{...props.spread}
		dangerouslySetInnerHTML={props.direct}
	>{props.child}</div>
}

export function SpreadChildrenDanger(props) @{
	<div
		id="spread-children-danger"
		{...props.first}
		{...props.second}
		dangerouslySetInnerHTML={props.danger}
	/>
}

export function SpreadThenDirectChildrenDanger(props) @{
	<div
		id="spread-direct-children-danger"
		{...props.spread}
		children={props.child}
		dangerouslySetInnerHTML={props.danger}
	/>
}

export function VoidSpreadContent(props) @{
	<input id="void-spread-content" {...props.spread} />
}

export function VoidSpreadThenDirectChildren(props) @{
	<input id="void-spread-direct-children" {...props.spread} children={props.child} />
}

export function DirectDangerStaticChild(props) @{
	<div id="direct-static-danger" dangerouslySetInnerHTML={props.danger}>static child</div>
}

export function SpreadDangerStaticChild(props) @{
	<div id="spread-static-danger" {...props.spread}>static child</div>
}

export function SpreadDangerIf(props) @{
	<div id="spread-danger-if" {...props.spread}>
		@if (props.show) {
			<span id="conditional-danger-child">conditional</span>
		}
	</div>
}

export function VoidSideEffectChild(props) @{
	<div id="void-side-effect" {...props.spread}>
		{void props.onRun()}
	</div>
}

export function DangerEvaluationOrder(props) @{
	<div
		id="danger-evaluation-order"
		dangerouslySetInnerHTML={props.read('direct')}
		data-middle={props.read('middle')}
		{...props.getSpread()}
		title={props.read('after')}
	/>
}

export function InvalidObjectChild(props) @{
	<div id="invalid-object-child">{props.child}</div>
}

export function NestedInvalidObjectChild(props) {
	return createElement('div', { id: 'nested-invalid-object-child' }, props.child);
}

export function InvalidElementType(props) {
	const Component = props.type;
	return <Component />;
}
