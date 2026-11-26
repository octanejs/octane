import { renderToString } from 'octane/server';
import { createScope } from 'octane/signals';
import { RadioSwap, Values, type InputProps } from './Inputs.tsrx';
import { SignalInputs } from './SignalInputs.tsrx';

export function renderForHydration() {
	const props: InputProps = { next: false, read: (_name, value) => value };
	const scope = createScope({ scopeKey: 'ordered-inputs' });
	try {
		const value$ = scope.signal$('value', '150');
		const limit$ = scope.signal$('limit', 100);
		return {
			values: renderToString(Values, props).html,
			radios: renderToString(RadioSwap, props).html,
			signals: renderToString(SignalInputs, { value$, limit$, max: 100 }).html,
		};
	} finally {
		scope.dispose();
	}
}
