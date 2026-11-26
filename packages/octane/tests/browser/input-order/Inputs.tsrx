export interface InputProps {
	next: boolean;
	read<T>(prop: string, value: T): T;
}

export interface UncontrolledProps {
	type: 'range' | 'text';
	max: number;
	name: string;
	defaultValue: number;
}

export function UncontrolledTypeFirst(props: UncontrolledProps) @{
	<input type={props.type} max={props.max} defaultValue={props.defaultValue} name={props.name} />
}

export function UncontrolledConstraintFirst(props: UncontrolledProps) @{
	<input max={props.max} type={props.type} defaultValue={props.defaultValue} name={props.name} />
}

export function UncontrolledSpread(props: UncontrolledProps) @{
	<input {...props} />
}

export function Values({ next, read }: InputProps) @{
	const spread = {
		get value() {
			return read('spread value', next ? 150 : 50);
		},
		get max() {
			return read('spread max', next ? 200 : 100);
		},
	};
	<form id="values">
		<input
			name="max"
			type="range"
			title={read('title', 'Level')}
			value={read('value', next ? 150 : 50)}
			max={read('max', next ? 200 : 100)}
			readOnly
		/>
		<input name="unchanged" type="range" value={150} max={next ? 200 : 100} readOnly />
		<input
			name="min"
			type="range"
			value={next ? 50 : 100}
			min={next ? 0 : 100}
			max="200"
			readOnly
		/>
		<input name="step" type="range" value={next ? 57 : 50} step={next ? 1 : 10} readOnly />
		<input name="asserted-max" type="range" value={next ? 180 : 150} max={200 as number} readOnly />
		<input
			name="asserted-step"
			type="range"
			value={next ? 6.7 : 5.4}
			step={0.1 as number}
			readOnly
		/>
		<input
			name="email"
			type="email"
			value="a@example.test, b@example.test"
			multiple={!next}
			readOnly
		/>
		<input name="label" value={next ? 'hello' : '12'} type={next ? undefined : 'number'} readOnly />
		<input name="spread" type="range" {...spread} readOnly />
	</form>
}

export function RadioSwap({ next }: InputProps) @{
	<form id="swap">
		<input type="radio" checked name={next ? 'second' : 'first'} value="a" readOnly />
		<input type="radio" checked name={next ? 'first' : 'second'} value="b" readOnly />
	</form>
}

export function RadioMoves({ next }: InputProps) @{
	const formChange = { form: next ? 'destination' : 'source', checked: !next };
	<div>
		<input
			id="name-move"
			type="radio"
			name={next ? 'by-name' : 'previous'}
			checked={!next}
			form="destination"
			readOnly
		/>
		<input id="form-move" type="radio" name="by-form" {...formChange} readOnly />
		<input
			id="type-move"
			name="by-type"
			form="destination"
			type={next ? 'radio' : 'checkbox'}
			checked={!next}
			readOnly
		/>
	</div>
}
