import * as React from 'react';
import { useHeldKeys, useHotkey } from '@tanstack/react-hotkeys';

interface ApplicationStarterHotkeysProps {
	onSubmit: () => void;
	onModKeyChange: (isHeld: boolean) => void;
	promptFocused: boolean;
}

export function ApplicationStarterHotkeys({
	onSubmit,
	onModKeyChange,
	promptFocused,
}: ApplicationStarterHotkeysProps) {
	const heldKeys = useHeldKeys();
	const isModHeld = heldKeys.includes('Meta') || heldKeys.includes('Control');

	useHotkey('Mod+Enter', () => {
		if (!promptFocused) {
			return;
		}

		onSubmit();
	});

	React.useEffect(() => {
		onModKeyChange(isModHeld);
		return () => onModKeyChange(false);
	}, [isModHeld, onModKeyChange]);

	return null;
}
