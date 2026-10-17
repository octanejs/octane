// These exceptional paths own live router state and synchronous error reporting.
// They remain compatibility components so the match projection can stay pure.
import { CompiledOutlet as CompiledComponent, useLayoutEffect, useRef } from 'octane';
import type { NotFoundError } from '@tanstack/router-core';
import { isNotFound } from '@tanstack/router-core';
import { useRouter } from './bindings';
import { useStore } from '../useStore';
import { ErrorComponent } from '../ErrorComponent.tsrx';

export function CompiledPending(props: { route?: any; waitForTransition?: boolean }) @{
	const router = useRouter();
	// The pending match must suspend on the live navigation transaction before
	// showing its fallback. The Strong match projection cannot read that owner.
	if (props.waitForTransition) {
		const transaction = (router as any)._tx;
		if (transaction) throw transaction[5];
	}
	const Pending = props.route?.options.pendingComponent ?? router.options.defaultPendingComponent;
	@if (Pending) {
		<CompiledComponent component={Pending} props={{}} />
	}
}

export function CompiledFailure(props: {
	error: any;
	reset: () => void;
	route: any;
	global?: boolean;
}) @{
	const router = useRouter();
	const errorComponent = props.global
		? ErrorComponent
		: (props.route.options.errorComponent ?? router.options.defaultErrorComponent);
	const notFoundComponent = props.route.isRoot
		? (props.route.options.notFoundComponent ?? router.options.notFoundRoute?.options.component)
		: props.route.options.notFoundComponent;
	const isMissing = isNotFound(props.error);
	if (isMissing) {
		const missing = props.error as NotFoundError;
		missing.routeId ??= props.route.id;
		if (!notFoundComponent || missing.routeId !== props.route.id) throw missing;
	} else if (!errorComponent) {
		throw props.error;
	}

	// Report an error only at the boundary that owns it and retry after its
	// TanStack match identity changes, just like the normal binding.
	const reported = useRef<unknown>(null);
	if (!isMissing && !props.global && reported.current !== props.error) {
		reported.current = props.error;
		const onCatch = props.route.options.onCatch ?? router.options.defaultOnCatch;
		onCatch?.(props.error, { componentStack: '' });
	}
	const store = router.stores.getMatchStore(props.route.id);
	const match = useStore(store, (m: any) => m);
	const firstMatch = useRef(match);
	useLayoutEffect(() => {
		if (firstMatch.current !== match) {
			firstMatch.current = match;
			props.reset();
		}
	}, [match]);

	@if (isMissing) {
		<CompiledComponent component={notFoundComponent} props={props.error} />
	} @else {
		<CompiledComponent
			component={errorComponent}
			props={{ error: props.error, reset: props.reset, info: { componentStack: '' } }}
		/>
	}
}
