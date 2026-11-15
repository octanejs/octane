import { useLayoutEffect, useRef } from 'octane';
import { signal$ } from 'octane/signals';

export const label$ = signal$('default');

export interface SignalReaderProps {
	id: string;
	onLayout?: (text: string) => void;
}

export function SignalReader({ id, onLayout }: SignalReaderProps) @{
	const text = label$.get();
	const ref = useRef<HTMLSpanElement>(null);
	useLayoutEffect(() => {
		onLayout?.(ref.current!.textContent!);
	}, []);
	<span id={id} ref={ref}>
		{text}
	</span>
}
