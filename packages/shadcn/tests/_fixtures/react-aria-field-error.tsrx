import { useState } from 'octane';
import { FieldError } from '@octanejs/shadcn/react-aria/Field';

// FieldError derives its content in a useMemo. Octane does not thread
// destructured PARAMETER locals into a closure as a reactive value channel, so
// a memo that reads them can serve stale content forever. Driving the errors
// prop from state is what exposes that.
export function ErrorsUpdate() @{
	const [errors, setErrors] = useState<Array<{ message?: string }>>([{ message: 'first' }]);
	<div>
		<button id="swap" onClick={() => setErrors([{ message: 'second' }])}>
			swap
		</button>
		<button id="two" onClick={() => setErrors([{ message: 'a' }, { message: 'b' }])}>
			two
		</button>
		<FieldError errors={errors} />
	</div>
}

// A falsy entry must contribute nothing to the list, not the string "false".
export function FalsyEntry() @{
	<FieldError errors={[{ message: 'real' }, { message: undefined }, { message: 'also real' }]} />
}
