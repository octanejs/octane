export function NullishFormCascades(props) @{
	<section id="nullish-form-cascades">
		<input id="nullish-input" value="a" {...props.input} readOnly />
		<textarea id="nullish-textarea" value="a" {...props.textarea} readOnly />
		<input id="nullish-checkbox" type="checkbox" checked={true} {...props.checkbox} readOnly />
	</section>
}

export function SpreadSelect(props) @{
	<select id="spread-select" {...props.select} onInput={() => {}}>
		<option value="foo">Foo</option>
		<option value="bar">Bar</option>
		<option value="baz">Baz</option>
	</select>
}

export function InputDefaultValueOrder(props) @{
	<input
		id="input-default-value-order"
		defaultValue={props.defaultValue}
		value={props.value}
		readOnly
	/>
}

export function InputValueDefaultOrder(props) @{
	<input
		id="input-value-default-order"
		value={props.value}
		defaultValue={props.defaultValue}
		readOnly
	/>
}

export function MutableFormSpreads(props) @{
	<section id="mutable-form-spreads">
		<input id="mutable-input" {...props.input} readOnly />
		<textarea id="mutable-textarea" {...props.textarea} readOnly />
		<input id="mutable-checkbox" type="checkbox" {...props.checkbox} readOnly />
		<select id="mutable-select" {...props.select} onInput={() => {}}>
			<option value="foo">Foo</option>
			<option value="bar">Bar</option>
			<option value="baz">Baz</option>
		</select>
	</section>
}

export function FormSpreadEvaluationOrder(props) @{
	<input
		id="form-spread-evaluation"
		data-before={props.read('before')}
		value={props.read('value')}
		{...props.spread}
		data-after={props.read('after')}
		readOnly
	/>
}

export function HostApplicationOrder(props) @{
	<div {...props.spread} title={props.title} />
}

export function AliasApplicationOrder(props) @{
	<label htmlFor={props.firstFor} id={props.id} for={props.finalFor}>label</label>
}

export function MutableHostCollision(props) @{
	<button
		id="mutable-host-collision"
		{...props.spread}
		title="fixed"
		className="fixed"
		style={{ color: 'blue' }}
		onClick={props.onClick}
		ref={props.ref}
	>
		fixed
	</button>
}

export function DuplicateHostSources(props) @{
	<section id="duplicate-host-sources">
		<div id="duplicate-title" title={props.first} title={props.second} />
		<label id="duplicate-alias" htmlFor={props.first} for={props.second}>label</label>
		<input id="duplicate-value" value={props.first} value={props.second} readOnly />
		<div
			id="duplicate-danger"
			dangerouslySetInnerHTML={props.firstDanger}
			dangerouslySetInnerHTML={props.secondDanger}
		/>
		<div id="duplicate-children" children={props.firstChild} children={props.secondChild} />
	</section>
}

export function PropChildrenSources(props) @{
	<section id="prop-children-sources">
		<div id="direct-prop-child" children={props.direct} />
		<div id="spread-prop-child" {...props.first} {...props.second} />
		<div id="nested-child-wins" {...props.nested}>nested</div>
	</section>
}

export function DangerToSpreadChild(props) @{
	<div id="danger-to-spread-child" {...props.source} />
}

export function DynamicVoidChild(props) @{
	<input id="dynamic-void-child">{props.child}</input>
}
