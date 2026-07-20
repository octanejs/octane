import * as React from 'react';
import { twMerge } from 'tailwind-merge';

type OptionData = { value: string; label: string; disabled: boolean };

type Props = {
	value?: string;
	onChange?: (e: { target: { value: string } }) => void;
	className?: string;
	triggerClassName?: string;
	children?: React.ReactNode;
};

function getOptionLabel(children: React.ReactNode, value: string): string {
	const text = React.Children.toArray(children)
		.map((part) => (typeof part === 'string' || typeof part === 'number' ? String(part) : ''))
		.join('')
		.trim();
	return text || value;
}

function extractOptions(children: React.ReactNode): Array<OptionData> {
	const options: Array<OptionData> = [];
	React.Children.forEach(children, (child) => {
		if (!React.isValidElement(child) || child.type !== 'option') return;
		const el = child as React.ReactElement<{
			value?: string;
			children?: React.ReactNode;
			disabled?: boolean;
		}>;
		const value = String(el.props.value ?? '');
		const label = getOptionLabel(el.props.children, value);
		options.push({ value, label, disabled: el.props.disabled ?? false });
	});
	return options;
}

/** Custom themed dropdown. Keeps the same onChange API as a native <select>
 * so all call-sites stay unchanged. */
export function ShopSelect({ value, onChange, className, triggerClassName, children }: Props) {
	const [open, setOpen] = React.useState(false);
	const [focused, setFocused] = React.useState<string | null>(null);
	const triggerRef = React.useRef<HTMLButtonElement>(null);
	const menuRef = React.useRef<HTMLDivElement>(null);

	const options = extractOptions(children);
	const selected = options.find((o) => o.value === value);

	// Close on outside click
	React.useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (
				!triggerRef.current?.contains(e.target as Node) &&
				!menuRef.current?.contains(e.target as Node)
			) {
				setOpen(false);
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [open]);

	// Keyboard navigation
	const onKeyDown = (e: React.KeyboardEvent) => {
		if (!open) {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
				e.preventDefault();
				setOpen(true);
				setFocused(value ?? options[0]?.value ?? null);
			}
			return;
		}
		const idx = options.findIndex((o) => o.value === focused);
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setFocused(options[Math.min(idx + 1, options.length - 1)]?.value ?? null);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			setFocused(options[Math.max(idx - 1, 0)]?.value ?? null);
		} else if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (focused) select(focused);
		} else if (e.key === 'Escape') {
			setOpen(false);
			triggerRef.current?.focus();
		}
	};

	const select = (optValue: string) => {
		if (options.find((opt) => opt.value === optValue)?.disabled) return;
		onChange?.({ target: { value: optValue } });
		setOpen(false);
		triggerRef.current?.focus();
	};

	return (
		<div className={twMerge('relative', className)}>
			<button
				ref={triggerRef}
				type="button"
				aria-haspopup="listbox"
				aria-expanded={open}
				onKeyDown={onKeyDown}
				onClick={() => {
					setOpen((o) => !o);
					if (!open) setFocused(value ?? options[0]?.value ?? null);
				}}
				className={twMerge(
					'flex items-center gap-2 border border-shop-line-2 rounded-xl',
					'py-2.5 pl-4 pr-3 bg-transparent text-shop-text-2 font-shop-mono text-shop-ui',
					'cursor-pointer transition-colors select-none whitespace-nowrap',
					'hover:border-shop-muted hover:text-shop-text',
					open && 'border-shop-muted text-shop-text',
					triggerClassName,
				)}
			>
				{selected?.label ?? '—'}
				<svg
					width="10"
					height="10"
					viewBox="0 0 10 10"
					aria-hidden
					className={twMerge('transition-transform duration-150 shrink-0', open && 'rotate-180')}
				>
					<path
						d="M2 4l3 3 3-3"
						stroke="currentColor"
						fill="none"
						strokeWidth="1.4"
						strokeLinecap="round"
					/>
				</svg>
			</button>

			{open ? (
				<div
					ref={menuRef}
					role="listbox"
					className={twMerge(
						'absolute right-0 top-[calc(100%+6px)] z-[200] min-w-full',
						'bg-shop-panel border border-shop-line rounded-xl max-h-[min(320px,60vh)] overflow-y-auto overflow-x-hidden',
						'shadow-[0_8px_24px_-4px_rgba(0,0,0,0.18),0_2px_8px_-2px_rgba(0,0,0,0.12)]',
					)}
				>
					{options.map((opt) => {
						const isSelected = opt.value === value;
						const isFocused = opt.value === focused;
						return (
							<button
								key={opt.value}
								type="button"
								role="option"
								aria-selected={isSelected}
								disabled={opt.disabled}
								onMouseEnter={() => setFocused(opt.value)}
								onClick={() => select(opt.value)}
								className={twMerge(
									'w-full text-left px-4 py-2.5 font-shop-mono text-shop-ui whitespace-nowrap',
									'transition-colors duration-75 flex items-center gap-2',
									isSelected ? 'text-shop-accent' : 'text-shop-text-2',
									isFocused && !opt.disabled && 'bg-shop-surface text-shop-text',
									opt.disabled && 'opacity-40 cursor-not-allowed line-through',
								)}
							>
								<span
									className={twMerge(
										'w-1.5 h-1.5 rounded-full shrink-0 transition-opacity',
										isSelected ? 'bg-shop-accent opacity-100' : 'opacity-0',
									)}
								/>
								{opt.label}
							</button>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
