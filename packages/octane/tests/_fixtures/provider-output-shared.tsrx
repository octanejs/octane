import { useMemo } from 'octane';
import { Label, Counter } from './provider-output.tsrx';

export function First() @{
	const memo = useMemo(() => ({ text: 'first' }), []);
	<div>
		<input defaultValue="draft" />
		<Label text={memo.text} />
		<Counter />
	</div>
}

export function Second() @{
	<div>
		<input defaultValue="draft" />
		<Label text="second" />
		<Counter />
	</div>
}
