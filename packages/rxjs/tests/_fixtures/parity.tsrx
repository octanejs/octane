import { bind, Subscribe } from '@octanejs/rxjs';
import { BehaviorSubject } from 'rxjs';

const values = new BehaviorSubject(1);
const [useValue] = bind(values);

function Value() {
	const value = useValue();
	return <div>
		<span id="value">{String(value)}</span>
		<button id="next" onClick={() => values.next(values.value + 1)}>{'next'}</button>
	</div>;
}

export function BoundValue() {
	return <Subscribe source$={values}>
		<Value />
	</Subscribe>;
}
