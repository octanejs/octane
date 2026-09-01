import {
	FloatingFocusManagerProps,
	UseDismissProps,
	UseFloatingOptions,
	UseHoverProps,
	UseTransitionStatusProps,
	UseTransitionStylesProps,
} from '@octanejs/floating-ui';
import { HTMLAttributes } from 'octane';

export type FloatingUIOptions = {
	useFloatingOptions?: UseFloatingOptions;
	useTransitionStylesProps?: UseTransitionStylesProps;
	useTransitionStatusProps?: UseTransitionStatusProps;
	useDismissProps?: UseDismissProps;
	useHoverProps?: UseHoverProps;
	elementProps?: HTMLAttributes<HTMLDivElement>;
	/**
	 * Props to pass to the `FloatingFocusManager` component.
	 */
	focusManagerProps?: Omit<FloatingFocusManagerProps, 'context' | 'children'>;
};
