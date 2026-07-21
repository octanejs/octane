import { DropdownMenu } from '@octanejs/radix';
import { twMerge } from 'tailwind-merge';

type DropdownProps = {
	children: any;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	modal?: boolean;
};

type DropdownTriggerProps = {
	children: any;
	className?: string;
	asChild?: boolean;
};

type DropdownContentProps = {
	children: any;
	className?: string;
	align?: 'start' | 'center' | 'end';
	sideOffset?: number;
	portal?: boolean;
	onFocus?: any;
	onPointerEnter?: any;
	onPointerLeave?: any;
};

type DropdownItemProps = {
	children: any;
	className?: string;
	onSelect?: () => void;
	asChild?: boolean;
};

type DropdownSeparatorProps = {
	className?: string;
};

export function Dropdown({ children, open, onOpenChange, modal = false }: DropdownProps) {
	return <DropdownMenu.Root
		open={open}
		onOpenChange={onOpenChange}
		modal={modal}
	>{children}</DropdownMenu.Root>;
}

export function DropdownTrigger({ children, className, asChild = true }: DropdownTriggerProps) {
	return <DropdownMenu.Trigger
		asChild={asChild}
		className={className}
	>{children}</DropdownMenu.Trigger>;
}

export function DropdownContent({
	children,
	className,
	align = 'end',
	sideOffset = 6,
	portal = true,
	onFocus,
	onPointerEnter,
	onPointerLeave,
}: DropdownContentProps) {
	const content = <DropdownMenu.Content
		align={align}
		sideOffset={sideOffset}
		onFocus={onFocus}
		onPointerEnter={onPointerEnter}
		onPointerLeave={onPointerLeave}
		className={twMerge(
			'dropdown-content z-[1200] min-w-48 rounded-lg p-1.5',
			'border border-gray-200 dark:border-gray-700',
			'bg-white dark:bg-gray-800',
			'shadow-lg',
			className,
		)}
	>{children}</DropdownMenu.Content>;

	if (!portal) {
		return content;
	}

	return <DropdownMenu.Portal>{content}</DropdownMenu.Portal>;
}

export function DropdownItem({ children, className, onSelect, asChild }: DropdownItemProps) {
	return <DropdownMenu.Item
		asChild={asChild}
		onSelect={onSelect}
		className={twMerge(
			'flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 outline-none',
			'text-sm text-gray-700 dark:text-gray-300',
			'hover:bg-gray-100 dark:hover:bg-gray-700/50',
			'focus:bg-gray-100 dark:focus:bg-gray-700/50',
			'transition-colors duration-150',
			className,
		)}
	>{children}</DropdownMenu.Item>;
}

export function DropdownSeparator({ className }: DropdownSeparatorProps) {
	return <DropdownMenu.Separator
		className={twMerge('my-1 h-px bg-gray-200 dark:bg-gray-700', className)}
	/>;
}
