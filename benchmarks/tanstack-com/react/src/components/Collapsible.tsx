import * as React from 'react';
import { twMerge } from 'tailwind-merge';

type CollapsibleRenderProps = {
	open: boolean;
	toggle: () => void;
};

type CollapsibleProps = {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: React.ReactNode | ((props: CollapsibleRenderProps) => React.ReactNode);
	className?: string;
};

type CollapsibleTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	children: React.ReactNode;
};

type CollapsibleContentProps = {
	children: React.ReactNode;
	className?: string;
};

const CollapsibleContext = React.createContext<CollapsibleRenderProps | null>(null);

function useCollapsible() {
	const context = React.useContext(CollapsibleContext);
	if (!context) {
		throw new Error('Collapsible components must be used within a Collapsible');
	}
	return context;
}

export function Collapsible({
	open: controlledOpen,
	defaultOpen = false,
	onOpenChange,
	children,
	className,
}: CollapsibleProps) {
	const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);

	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : uncontrolledOpen;

	const toggle = React.useCallback(() => {
		if (isControlled) {
			onOpenChange?.(!open);
		} else {
			setUncontrolledOpen((prev) => {
				const next = !prev;
				onOpenChange?.(next);
				return next;
			});
		}
	}, [isControlled, open, onOpenChange]);

	const value = React.useMemo(() => ({ open, toggle }), [open, toggle]);

	return (
		<CollapsibleContext.Provider value={value}>
			<div className={className} data-collapsible>
				{typeof children === 'function' ? children(value) : children}
			</div>
		</CollapsibleContext.Provider>
	);
}

export function CollapsibleTrigger({
	children,
	className,
	onClick,
	onMouseDown,
	type = 'button',
	...props
}: CollapsibleTriggerProps) {
	const { open, toggle } = useCollapsible();

	return (
		<button
			{...props}
			type={type}
			aria-expanded={open}
			onMouseDown={(e) => {
				e.stopPropagation();
				onMouseDown?.(e);
			}}
			onClick={(e) => {
				e.stopPropagation();
				toggle();
				onClick?.(e);
			}}
			className={twMerge('cursor-pointer select-none', className)}
			data-collapsible-trigger
		>
			{children}
		</button>
	);
}

export function CollapsibleContent({ children, className }: CollapsibleContentProps) {
	const { open } = useCollapsible();

	return (
		<div
			className={twMerge(
				'grid transition-[grid-template-rows] duration-200 ease-out',
				open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
				className,
			)}
		>
			<div className="overflow-hidden">{children}</div>
		</div>
	);
}
