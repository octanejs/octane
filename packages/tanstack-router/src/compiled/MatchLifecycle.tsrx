// Synchronous error reporting remains compatibility-owned.
import { CompiledOutlet as CompiledComponent, useLayoutEffect, useRef } from 'octane';
import type { NotFoundError } from '@tanstack/router-core';
import { isNotFound } from '@tanstack/router-core';
import { useRouter } from './bindings';
import { useStore } from '../useStore';
import { ErrorComponent } from '../ErrorComponent.tsrx';

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
