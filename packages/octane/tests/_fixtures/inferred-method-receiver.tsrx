import { useEffect, useLayoutEffect, useMemo } from 'octane';

// Issue #1788: two objects can share one own method. Calling it as
// `source.subscribe()` passes `source` as `this`, so the inferred dependency
// must change with the receiver even though the function identity does not.
export function EffectFromOwnMethod(props) @{
	const source = props.source;
	useEffect(() => source.subscribe());
	<span>{props.noise as string}</span>
}

export function MemoFromOwnMethod(props) @{
	const source = props.source;
	const value = useMemo(() => source.read());
	<span>{value as string}</span>
}

// The guarded call takes the descriptor-probing path of the same helper.
export function GuardedEffectFromOwnMethod(props) @{
	const source = props.source;
	useEffect(() => {
		if (props.enabled) return source.subscribe();
	});
	<span>{props.noise as string}</span>
}

// A guarded plain read passes no receiver, so a stable function value keeps
// the hook quiet while the props container is rebuilt.
export function GuardedLayoutEffectFromOwnFunctionRead(props) @{
	useLayoutEffect(() => {
		if (props.enabled) props.log(props.handler);
	});
	<span>{props.noise as string}</span>
}

// A callback prop called as `props.onPing()` receives the props container as
// `this`. Only an arrow function cannot observe that receiver.
export function EffectFromCallbackProp(props) @{
	useEffect(() => {
		props.log('run');
		props.onPing();
	});
	<span>{props.noise as string}</span>
}
