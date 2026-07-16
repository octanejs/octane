export function InputSpreadCascades() @{
	<section id="input-spread-cascades">
		<input
			id="input-spread-leading"
			{...{}}
			defaultValue="default"
			value="controlled"
			defaultChecked={false}
			checked={true}
			readOnly
		/>
		<input
			id="input-spread-middle"
			defaultValue="default"
			defaultChecked={false}
			{...{}}
			value="controlled"
			checked={true}
			readOnly
		/>
		<input
			id="input-spread-trailing"
			defaultValue="default"
			value="controlled"
			defaultChecked={false}
			checked={true}
			readOnly
			{...{}}
		/>
		<input
			id="input-spread-values"
			{...{ defaultValue: 'default', defaultChecked: false }}
			{...{ value: 'controlled', checked: true, readOnly: true }}
		/>
		<input
			id="input-spread-defaults-last"
			{...{ value: 'controlled', checked: true }}
			{...{ defaultValue: 'default', defaultChecked: false, readOnly: true }}
		/>
	</section>
}

export function InputDirectEvaluationOrder(props) @{
	<input
		id="input-direct-evaluation-order"
		title={props.read('title')}
		defaultValue={props.read('defaultValue')}
		data-middle={props.read('middle')}
		value={props.read('value')}
		defaultChecked={props.read('defaultChecked')}
		checked={props.read('checked')}
		readOnly
	/>
}

export function InputSpreadEvaluationOrder(props) @{
	<input
		id="input-spread-evaluation-order"
		value={props.read('value-before')}
		{...props.spread}
		title={props.read('title-after')}
		defaultValue={props.read('default-after')}
		readOnly
	/>
}

export function TextareaSelectSpreadCascades() @{
	<section id="textarea-select-spread-cascades">
		<textarea
			id="textarea-spread-leading"
			data-expected="controlled"
			{...{}}
			defaultValue="default"
			value="controlled"
			readOnly
		/>
		<textarea
			id="textarea-spread-middle"
			data-expected="controlled"
			defaultValue="default"
			{...{}}
			value="controlled"
			readOnly
		/>
		<textarea
			id="textarea-spread-values"
			data-expected="controlled"
			{...{ defaultValue: 'default', value: 'controlled', readOnly: true }}
		/>
		<textarea
			id="textarea-spread-default-last"
			data-expected="controlled"
			value="controlled"
			{...{ defaultValue: 'default', readOnly: true }}
		/>
		<textarea id="textarea-spread-value-undefined" {...{ value: undefined }}>value child</textarea>
		<textarea id="textarea-spread-value-null" {...{ value: null }}>null child</textarea>
		<textarea
			id="textarea-spread-default-undefined"
			{...{ defaultValue: undefined }}
		>{'default child'}</textarea>

		<select id="select-spread-controlled" defaultValue="baz" {...{ value: 'bar', readOnly: true }}>
			<option value="foo">Foo</option>
			<option value="bar">Bar</option>
			<option value="baz">Baz</option>
		</select>
		<select
			id="select-spread-default-last"
			value="bar"
			{...{ defaultValue: 'baz', readOnly: true }}
		>
			<option value="foo">Foo</option>
			<option value="bar">Bar</option>
			<option value="baz">Baz</option>
		</select>
		<select
			id="select-spread-multiple"
			{...{ multiple: true, value: ['bar', 'baz'], readOnly: true }}
		>
			<option value="foo">Foo</option>
			<option value="bar">Bar</option>
			<option value="baz">Baz</option>
		</select>
		<select
			id="select-spread-direct-multiple"
			multiple
			{...{ value: ['bar', 'baz'], readOnly: true }}
		>
			<option value="foo">Foo</option>
			<option value="bar">Bar</option>
			<option value="baz">Baz</option>
		</select>
	</section>
}

export function TextareaSpreadEvaluationOrder(props) @{
	<textarea
		id="textarea-spread-evaluation-order"
		value={props.read('value-before')}
		{...props.spread}
		title={props.read('title-after')}
		defaultValue={props.read('default-after')}
		readOnly
	/>
}

export function SelectSpreadEvaluationOrder(props) @{
	<select
		id="select-spread-evaluation-order"
		defaultValue={props.read('default-before')}
		{...props.spread}
		multiple={props.read('multiple-after')}
		title={props.read('title-after')}
		readOnly
	>
		<option value="foo">Foo</option>
		<option value="bar">Bar</option>
		<option value="baz">Baz</option>
	</select>
}

export function AttributeSpreadCollisions() @{
	<section id="attribute-spread-collisions">
		<div
			id="attr-direct-before"
			title="direct"
			data-collision="direct"
			{...{ title: 'spread', 'data-collision': 'spread' }}
		/>
		<div
			id="attr-spread-before"
			{...{ title: 'spread', 'data-collision': 'spread' }}
			title="direct"
			data-collision="direct"
		/>
		<div
			id="attr-spread-spread"
			{...{ title: 'first', 'data-collision': 'first', className: 'first' }}
			{...{
				title: 'second',
				'data-collision': 'second',
				class: ['second', { active: true }],
			}}
		/>
		<div id="attr-nullish-removal" {...{ title: 'spread' }} title={undefined} />
		<label id="attr-alias" htmlFor="first" {...{ htmlFor: 'second' }}>alias</label>
		<div id="attr-style" style={{ color: 'red' }} {...{ style: { color: 'blue' } }} />
		<svg>
			<use
				id="attr-svg-alias"
				{...{ 'xlink:href': '#first', strokeWidth: 1 }}
				{...{ xlinkHref: '#second', strokeWidth: 2 }}
			/>
		</svg>
		<x-parity-attr id="attr-custom" {...{ camelCase: 'first' }} camelCase="second" />
		<select id="attr-option-select" value="second" readOnly>
			<option {...{ value: 'first' }} value="second">Second</option>
			<option value="other">Other</option>
		</select>
	</section>
}

export function AttributeSpreadEvaluationOrder(props) @{
	<div
		id="attribute-spread-evaluation-order"
		title={props.read('direct-before')}
		{...props.first}
		data-middle={props.read('middle')}
		onClick={props.read('event-between')}
		{...props.second}
		title={props.read('direct-after')}
	/>
}

export function AttributeSpreadOrder() @{
	<div {...{ a: '1', b: '2' }} a="3" />
}

export function HostChildrenPropCascades(props) @{
	<section id="host-children-prop-cascades">
		<div id="children-direct" children={props.direct} />
		<div id="children-direct-spread" children="direct" {...props.directThenSpread} />
		<div id="children-spread-direct" {...props.spreadThenDirect} children="direct" />
		<div id="children-spread-spread" {...props.first} {...props.second} />
		<div id="children-cleared" children="stale" {...props.cleared} />
		<div id="children-omitted" {...props.first} {...props.omitted} />
		<div id="children-nested" {...props.nested}>nested</div>
		<div id="children-nested-null" children="ignored">{null}</div>
		<div id="children-renderable" {...props.renderable} />
		<textarea id="textarea-direct-children-prop" value={null} children="direct textarea" />
		<textarea id="textarea-spread-children-prop" {...props.textarea} />
	</section>
}

export function InputFormCoercionOrder(props) @{
	<input value={props.value} {...props.spread} title={props.title} readOnly />
}

export function InputDirectFormCoercionOrder(props) @{
	<input value={props.value} title={props.title} readOnly />
}

export function DirectDuplicateAttributes(props) @{
	<section id="direct-duplicate-attributes">
		<div id="duplicate-title" title="first" title="second" />
		<label id="duplicate-alias" htmlFor="first" for="second">label</label>
		<div id="duplicate-class" className="first" class="second" />
		<div id="duplicate-children" children="first" children="second" />
		<div
			id="duplicate-danger-null"
			children="fallback"
			dangerouslySetInnerHTML={{ __html: '<b>stale</b>' }}
			dangerouslySetInnerHTML={null}
		/>
		<textarea id="duplicate-textarea-value" value="first" value="second" readOnly />
		<select id="duplicate-select-multiple" multiple={false} multiple={true}>
			<option value="first">First</option>
			<option value="second">Second</option>
		</select>
		<select id="duplicate-select-value" value="first" value="second">
			<option value="first" value="second">Second</option>
			<option value="other">Other</option>
		</select>
		<div id="duplicate-dynamic-title" title={props.read('first')} title={props.read('second')} />
	</section>
}

export function VoidDynamicNestedChild(props) @{
	<input id="void-dynamic-nested-child" data-order={props.read('attr')}>{props.read(
		'child',
	)}</input>
}

export function VoidNullishSideEffect(props) @{
	<input id="void-nullish-side-effect">
		{void props.onRun()}
	</input>
}

export function VoidWhitespaceOnly() @{
	<input id="void-whitespace-only">
		{/* no semantic children */}
	</input>
}

export function VoidNestedNullWins() @{
	<input id="void-nested-null-wins" children="ignored">{null}</input>
}

export function VoidDirectDangerSources(props) @{
	<input
		id="void-direct-danger-sources"
		dangerouslySetInnerHTML={props.first}
		dangerouslySetInnerHTML={props.second}
	/>
}
