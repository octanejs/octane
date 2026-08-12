import { useState } from 'octane';

import { OTPInput } from '../../src/input.tsrx';

export function HydrationInput() @{
	const [value, setValue] = useState('12');
	<OTPInput maxLength={4} value={value} onChange={setValue} aria-label="Hydrated verification code">
		<output data-testid="hydrated-value">{value}</output>
	</OTPInput>
}
