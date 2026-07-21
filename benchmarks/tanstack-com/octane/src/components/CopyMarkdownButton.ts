'use client';
import { useTemporaryFlag } from '~/utils/browser-effects';

export function useCopyButton(
	onCopy: () => void | Promise<void>,
): [checked: boolean, onClick: (event: any) => void] {
	const copied = useTemporaryFlag(1500);

	const onClick = async (_event: any) => {
		await onCopy();
		copied.trigger();
	};

	return [copied.active, onClick];
}
