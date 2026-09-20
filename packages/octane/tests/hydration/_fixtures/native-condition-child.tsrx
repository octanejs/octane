'use strong';

import { useContext, useEffect, type Context } from 'octane';

export function DeferredContent(props: {
	context: Context<string>;
	label: string;
	onEffect?: () => void;
	onCleanup?: () => void;
	onClick?: () => void;
}) @{
	const context = useContext(props.context);
	useEffect(() => {
		props.onEffect?.();
		return () => props.onCleanup?.();
	});
	<button id="deferred-action" onClick={props.onClick}>{props.label + ':' + context}</button>
}
