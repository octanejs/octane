/** @jsxImportSource react */
// `octane/signals/react` resolves through the package exports with React's JSX types.
import { createScope, type Scope, type SignalHandle } from 'octane/signals';
import { SignalScopeProvider, useSignalScope, useSignalValue } from 'octane/signals/react';

const scope = createScope({ scopeKey: 'typetest' });
const count$ = scope.signal$('count', 1);
const label$ = scope.derived$('label', () => `${count$.get()}`);

function Count() {
	const count: number = useSignalValue(count$);
	const label: string = useSignalValue(label$);
	// @ts-expect-error A number handle reads as a number.
	const wrong: string = useSignalValue(count$);
	const owner: Scope = useSignalScope();
	void owner;
	void wrong;
	return (
		<output>
			{count} {label}
		</output>
	);
}

export const tree = (
	<SignalScopeProvider scope={scope}>
		<Count />
	</SignalScopeProvider>
);

// @ts-expect-error The provider requires a scope.
export const missing = <SignalScopeProvider />;

declare const handle: SignalHandle<{ readonly id: string }>;
export const id = (): string => useSignalValue(handle).id;
