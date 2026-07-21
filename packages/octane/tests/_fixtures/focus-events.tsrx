import { useState } from 'octane';

// onFocus/onBlur are non-bubbling — they only fire if octane delegates them in the
// capture phase. A parent handler also fires (React-style bubbling simulation).
// Functional updates so both synchronous handlers accumulate.
export function FocusEvents() {
	const [log, setLog] = useState('');
	return <div class="wrap" onFocus={() => setLog((l) => l + 'W')}>
		<input
			class="inp"
			onFocus={() => setLog((l) => l + 'f')}
			onBlur={() => setLog((l) => l + 'b')}
		/>
		<span class="log">{log as string}</span>
	</div>;
}
