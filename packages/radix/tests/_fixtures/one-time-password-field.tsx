import { useState } from 'octane';
import { OneTimePasswordField } from '@octanejs/radix';

// A 6-cell one-time-password field inside a real <form> so the HiddenInput engages
// (FormData, reset listener, autoSubmit's requestSubmit).
export function OtpApp(props?: {
	disabled?: boolean;
	autoSubmit?: boolean;
	type?: 'text' | 'password';
	validationType?: 'alpha' | 'numeric' | 'alphanumeric' | 'none';
	defaultValue?: string;
	placeholder?: string;
}) {
	const [value, setValue] = useState('');
	const [autoSubmitted, setAutoSubmitted] = useState('none');
	const [submits, setSubmits] = useState(0);
	const [invalids, setInvalids] = useState(0);
	// Dynamic cell count (e.g. a 6-digit vs 7-digit code UI). Cells render via a KEYED
	// map so shrinking the count removes a keyed item (proper unmount). (A
	// `{cond ? <Input/> : null}` conditional also works now — the de-opt item
	// component→null leak this once documented is fixed; see octane's
	// deopt-item-path-switch.test.ts.)
	const [cellCount, setCellCount] = useState(6);
	const onInvalidChange = () => setInvalids((c: number) => c + 1);
	return (
		<form
			data-testid="form"
			onSubmit={(event: Event) => {
				event.preventDefault();
				setSubmits((c: number) => c + 1);
			}}
		>
			<span data-testid="value">{value}</span>
			<span data-testid="auto-submitted">{autoSubmitted}</span>
			<span data-testid="submits">{submits}</span>
			<span data-testid="invalids">{invalids}</span>
			<OneTimePasswordField.Root
				data-testid="root"
				disabled={props?.disabled}
				autoSubmit={props?.autoSubmit}
				type={props?.type}
				validationType={props?.validationType}
				defaultValue={props?.defaultValue}
				placeholder={props?.placeholder}
				onValueChange={setValue}
				onAutoSubmit={(v: string) => setAutoSubmitted(v)}
			>
				{Array.from({ length: cellCount }, (_, i) => (
					<OneTimePasswordField.Input
						key={i}
						data-testid={'cell-' + i}
						onInvalidChange={onInvalidChange}
					/>
				))}
				<OneTimePasswordField.HiddenInput data-testid="hidden" name="code" />
			</OneTimePasswordField.Root>
			<button type="reset" data-testid="reset">
				reset
			</button>
			<button
				type="button"
				data-testid="toggle-cell"
				onClick={() => setCellCount((c: number) => (c === 6 ? 7 : 6))}
			>
				toggle cell
			</button>
		</form>
	);
}
