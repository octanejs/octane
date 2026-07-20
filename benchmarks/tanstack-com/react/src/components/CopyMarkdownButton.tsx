'use client';
import { type MouseEventHandler } from 'react';
import { useTemporaryFlag } from '~/utils/browser-effects';

export function useCopyButton(
	onCopy: () => void | Promise<void>,
): [checked: boolean, onClick: MouseEventHandler] {
	const copied = useTemporaryFlag(1500);

	const onClick: MouseEventHandler = async () => {
		await onCopy();
		copied.trigger();
	};

	return [copied.active, onClick];
}
