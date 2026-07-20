import * as React from 'react';
import {
	useFloating,
	FloatingPortal,
	offset,
	shift,
	flip,
	autoUpdate,
	useMergeRefs,
} from '@floating-ui/react';

type TooltipTriggerProps = React.HTMLProps<HTMLElement> & React.RefAttributes<HTMLElement>;

interface TooltipProps {
	content: React.ReactNode;
	children: React.ReactElement<TooltipTriggerProps>;
	placement?: 'top' | 'right' | 'bottom' | 'left';
	className?: string;
}

export function Tooltip({ content, children, placement = 'top', className = '' }: TooltipProps) {
	const [isOpen, setIsOpen] = React.useState(false);

	const { refs, floatingStyles } = useFloating<HTMLElement>({
		open: isOpen,
		onOpenChange: setIsOpen,
		placement,
		middleware: [offset(5), flip(), shift()],
		whileElementsMounted: autoUpdate,
	});

	const triggerRef = useMergeRefs([refs.setReference, children.props.ref]);
	const triggerProps = children.props;

	const handleMouseEnter: React.MouseEventHandler<HTMLElement> = (event) => {
		triggerProps.onMouseEnter?.(event);
		setIsOpen(true);
	};

	const handleMouseLeave: React.MouseEventHandler<HTMLElement> = (event) => {
		triggerProps.onMouseLeave?.(event);
		setIsOpen(false);
	};

	const handleFocus: React.FocusEventHandler<HTMLElement> = (event) => {
		triggerProps.onFocus?.(event);
		setIsOpen(true);
	};

	const handleBlur: React.FocusEventHandler<HTMLElement> = (event) => {
		triggerProps.onBlur?.(event);
		setIsOpen(false);
	};

	return (
		<>
			{React.cloneElement(children, {
				ref: triggerRef,
				onMouseEnter: handleMouseEnter,
				onMouseLeave: handleMouseLeave,
				onFocus: handleFocus,
				onBlur: handleBlur,
			})}
			<FloatingPortal>
				{isOpen && (
					<div
						ref={refs.setFloating /* eslint-disable-line react-hooks/refs */}
						style={floatingStyles}
						className={`z-50 rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white shadow-lg dark:bg-gray-800 ${className}`}
					>
						{content}
					</div>
				)}
			</FloatingPortal>
		</>
	);
}
