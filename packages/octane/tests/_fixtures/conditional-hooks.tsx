/** @jsxImportSource octane */
import { useEffect, useInsertionEffect, useLayoutEffect } from 'octane';

export function ConditionalTsxEffect(props: { enabled: boolean; label: string; log: string[] }) {
	if (props.enabled) {
		useEffect(() => {
			props.log.push('create:' + props.label);
			return () => props.log.push('cleanup:' + props.label);
		}, [props.label, props.log]);
	}
	return <div className="conditional-tsx">{props.label}</div>;
}

export function ConditionalEffectPhases(props: { enabled: boolean; log: string[] }) {
	if (props.enabled) {
		useEffect(() => {
			props.log.push('passive:create');
			return () => props.log.push('passive:cleanup');
		}, [props.log]);
		useLayoutEffect(() => {
			props.log.push('layout:create');
			return () => props.log.push('layout:cleanup');
		}, [props.log]);
		useInsertionEffect(() => {
			props.log.push('insertion:create');
			return () => props.log.push('insertion:cleanup');
		}, [props.log]);
	}
	return <div className="conditional-phases">stable</div>;
}

export function ConditionalEffectOrder(props: { first: boolean; tick: number; log: string[] }) {
	if (props.first) {
		useEffect(() => {
			props.log.push('first:create');
			return () => props.log.push('first:cleanup');
		}, [props.log]);
	}
	useEffect(() => {
		props.log.push('second:create:' + props.tick);
		return () => props.log.push('second:cleanup:' + props.tick);
	}, [props.log, props.tick]);
	return <div className="conditional-order">stable</div>;
}
