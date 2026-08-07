import { useInvokeState, useIpcEvent } from '@octanejs/electron';

export function ServerCommand() @{
	const result = useInvokeState<string>('greet', { name: 'ada' });
	useIpcEvent('tick', () => {});
	<div id="server-status">{result.status as string}</div>
}
