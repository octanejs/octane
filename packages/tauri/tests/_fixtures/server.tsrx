import { useInvokeState, useTauriEvent } from '@octanejs/tauri';

export function ServerCommand() @{
	const result = useInvokeState<string>('greet', { name: 'ada' });
	useTauriEvent<string>('tick', () => {});
	<div id="server-status">{result.status as string}</div>
}
