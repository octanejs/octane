import { useState } from 'octane';
import { PasswordToggleField } from '@octanejs/radix';

// PasswordToggleField inside a real <form> so the Input's native reset/submit
// listeners engage (visibility must flip back to hidden on submit/reset).
export function PasswordFieldApp(props?: { defaultVisible?: boolean }) {
	const [visibility, setVisibility] = useState('hidden');
	const [submits, setSubmits] = useState(0);
	return (
		<form
			data-testid="form"
			onSubmit={(event: Event) => {
				event.preventDefault();
				setSubmits((c) => c + 1);
			}}
		>
			<span data-testid="visibility">{visibility}</span>
			<span data-testid="submits">{submits}</span>
			<PasswordToggleField.Root
				defaultVisible={props?.defaultVisible}
				onVisibilityChange={(v: boolean) => setVisibility(v ? 'visible' : 'hidden')}
			>
				<PasswordToggleField.Input data-testid="input" name="password" />
				<PasswordToggleField.Toggle data-testid="toggle">
					<PasswordToggleField.Slot visible="Hide" hidden="Show" />
				</PasswordToggleField.Toggle>
			</PasswordToggleField.Root>
			<button type="submit" data-testid="submit">
				Submit
			</button>
			<button type="reset" data-testid="reset">
				Reset
			</button>
		</form>
	);
}

// Icon variant: the toggle has no text content, so it derives its default
// aria-label; Icon projects the per-state icon element via Primitive.svg asChild.
export function PasswordFieldIconApp() {
	return (
		<PasswordToggleField.Root>
			<PasswordToggleField.Input data-testid="input" />
			<PasswordToggleField.Toggle data-testid="toggle">
				<PasswordToggleField.Icon
					visible={<svg data-testid="icon-open" viewBox="0 0 15 15" />}
					hidden={<svg data-testid="icon-closed" viewBox="0 0 15 15" />}
				/>
			</PasswordToggleField.Toggle>
		</PasswordToggleField.Root>
	);
}
