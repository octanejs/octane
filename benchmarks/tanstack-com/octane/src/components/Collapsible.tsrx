import { createContext, isChildrenBlock, useCallback, useContext, useMemo, useState } from 'octane';
import { twMerge } from 'tailwind-merge';

type CollapsibleRenderProps = {
	open: boolean;
	toggle: () => void;
};

type CollapsibleProps = {
	open?: boolean;
	defaultOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: any;
	className?: string;
};

type CollapsibleTriggerProps =
	Record<string, any> & {
		children?: any;
	};

type CollapsibleContentProps = {
	children?: any;
	className?: string;
};

const CollapsibleContext = createContext<CollapsibleRenderProps | null>(null);

function useCollapsible() {
	const context = useContext(CollapsibleContext);
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
	const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);

	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : uncontrolledOpen;

	const toggle = useCallback(() => {
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

	const value = useMemo(() => ({ open, toggle }), [open, toggle]);

	// React accepts render-prop children (`{({ open }) => ...}`); in octane a
	// compiled children block is also a function, so distinguish the user render
	// prop with isChildrenBlock.
	return <CollapsibleContext.Provider value={value}>
		<div className={className} data-collapsible>
			{typeof children === 'function' && !isChildrenBlock(children) ? children(value) : children}
		</div>
	</CollapsibleContext.Provider>;
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

	return <button
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
		class={twMerge('cursor-pointer select-none', className)}
		data-collapsible-trigger
	>{children}</button>;
}

export function CollapsibleContent({ children, className }: CollapsibleContentProps) {
	const { open } = useCollapsible();

	return <div
		class={twMerge(
			'grid transition-[grid-template-rows] duration-200 ease-out',
			open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
			className,
		)}
	>
		<div class="overflow-hidden">{children}</div>
	</div>;
}
