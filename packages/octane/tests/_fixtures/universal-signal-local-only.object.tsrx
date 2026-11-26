// Only the client signals entry: the module still enables native reads.
import { useSignal$ } from 'octane/signals/client';

export const handles: { local: null | { set(n: number): void } } = { local: null };
export const localRenders = { count: 0 };

export function LocalOnly() @{
	localRenders.count++;
	const local$ = useSignal$(1);
	handles.local = local$;
	<view>{local$}</view>
}
