/** @jsxImportSource react */
// `octane/signals/react` resolves through the package exports with React's JSX types.
import { useSyncExternalStore } from 'react';
import { createScope, type Scope, type SignalHandle } from 'octane/signals';
import {
	RetainedSignalProvider,
	useOptionalRetainedSignalValue,
	SignalScopeProvider,
	type SignalFallback,
	useRetainedSignalValue,
	useSignalSubscription,
	useSignalScope,
	useSignalValue,
} from 'octane/signals/react';

const scope = createScope({ scopeKey: 'typetest' });
const count$ = scope.signal$('count', 1);
const label$ = scope.derived$('label', () => `${count$.get()}`);

function Count() {
	const count: number = useSignalValue(count$);
	const label: string = useRetainedSignalValue(label$, () => 'initial', true);
	const hydrated: number = useSignalValue(count$, () => 1);
	// @ts-expect-error A server snapshot must return the handle's value type.
	useSignalValue(count$, () => 'one');
	void hydrated;
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
		<RetainedSignalProvider
			getServerSnapshot={<T,>(handle: SignalHandle<T>): T => handle.get()}
			retainOnHide={false}
		>
			<Count />
		</RetainedSignalProvider>
	</SignalScopeProvider>
);

// @ts-expect-error The provider requires a scope.
export const missing = <SignalScopeProvider />;

declare const handle: SignalHandle<{ readonly id: string }>;
export const id = (): string => useSignalValue(handle).id;

export function useCount(handle: SignalHandle<readonly string[]> | null): number {
	const subscribe = useSignalSubscription(handle, false);
	return useSyncExternalStore(
		subscribe,
		() => handle?.get().length ?? 0,
		() => 0,
	);
}

export const narrow = (
	// @ts-expect-error The resolver must work for every handle value type.
	<RetainedSignalProvider getServerSnapshot={(handle: SignalHandle<number>) => handle.get()} />
);

export function Optional({ active }: { active: boolean }) {
	const value: number | 'loading' = useOptionalRetainedSignalValue(active ? count$ : 'loading');
	const inactive: false = useOptionalRetainedSignalValue(false);
	const fallback: SignalFallback = inactive;
	void fallback;
	// @ts-expect-error Resolve application-specific objects to native handles first.
	useOptionalRetainedSignalValue({ unresolved: true });
	return (
		<output>
			{String(value)}
			{String(inactive)}
		</output>
	);
}
