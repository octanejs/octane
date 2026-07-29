import { useCallback, useState } from 'octane';
import { withoutSlot } from '../internal';

export interface UseDisclosureOptions {
	onOpen?: () => void;
	onClose?: () => void;
}

export interface UseDisclosureHandlers {
	set: (value: boolean) => void;
	open: () => void;
	close: () => void;
	toggle: () => void;
}

export type UseDisclosureReturnValue = [boolean, UseDisclosureHandlers];

export function useDisclosure(
	initialState = false,
	options: UseDisclosureOptions = {},
): UseDisclosureReturnValue {
	const normalizedInitialState = withoutSlot(initialState) ?? false;
	const normalizedOptions = withoutSlot(options) ?? {};
	const [opened, setOpened] = useState(normalizedInitialState);

	const open = useCallback(() => {
		setOpened((isOpened) => {
			if (!isOpened) {
				normalizedOptions.onOpen?.();
				return true;
			}
			return isOpened;
		});
	}, [normalizedOptions.onOpen]);

	const close = useCallback(() => {
		setOpened((isOpened) => {
			if (isOpened) {
				normalizedOptions.onClose?.();
				return false;
			}
			return isOpened;
		});
	}, [normalizedOptions.onClose]);

	const toggle = useCallback(() => {
		opened ? close() : open();
	}, [close, open, opened]);

	return [opened, { open, close, toggle, set: setOpened }];
}

export namespace useDisclosure {
	export type Options = UseDisclosureOptions;
	export type Handlers = UseDisclosureHandlers;
	export type ReturnValue = UseDisclosureReturnValue;
}
