import { useTransition } from 'octane';

export type Start = (fn: () => void | Promise<unknown>) => void;

export function PendingPair(props: { bind: (first: Start, second: Start) => void }) @{
	const [first, startFirst] = useTransition();
	const [second, startSecond] = useTransition();
	props.bind(startFirst, startSecond);
	<span>{String(first) + ':' + String(second)}</span>
}
