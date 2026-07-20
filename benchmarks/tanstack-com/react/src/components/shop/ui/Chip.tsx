import * as React from 'react';
import { twMerge } from 'tailwind-merge';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
	isSelected?: boolean;
	isUnavailable?: boolean;
	/** Full hex color for color-swatch chips — drives both selected (100%) and unselected (80%) states. */
	colorBg?: string;
	/** Legacy: hex background only for the selected state. */
	selectedBg?: string;
	/** Forced text color when using selectedBg — auto-derived from selectedBg if omitted. */
	selectedTextColor?: string;
};

export const ShopChip = React.forwardRef<HTMLButtonElement, Props>(function ShopChip(
	{
		isSelected,
		isUnavailable,
		children,
		className,
		disabled,
		colorBg,
		selectedBg,
		selectedTextColor,
		style,
		...rest
	},
	ref,
) {
	const chipStyle: React.CSSProperties = colorBg
		? {
				backgroundColor: isSelected ? colorBg : hexToRgba(colorBg, 0.8),
				borderColor: isSelected ? colorBg : hexToRgba(colorBg, 0.5),
				color: contrastColor(colorBg),
			}
		: isSelected && selectedBg
			? {
					backgroundColor: selectedBg,
					borderColor: selectedBg,
					color: selectedTextColor ?? contrastColor(selectedBg),
				}
			: {};

	return (
		<button
			ref={ref}
			type="button"
			aria-pressed={isSelected}
			disabled={disabled ?? isUnavailable}
			{...rest}
			style={{ ...style, ...chipStyle }}
			className={twMerge(
				'inline-flex items-center gap-[7px] px-3 py-1.5 rounded-md border text-shop-sm',
				'font-shop-display transition-[border-color,background-color,color]',
				!colorBg && 'bg-shop-surface text-shop-text border-shop-line',
				!colorBg && 'hover:enabled:bg-shop-surface-hover hover:enabled:border-shop-line-2',
				isSelected &&
					!colorBg &&
					!selectedBg &&
					'bg-shop-panel-2 border-shop-accent text-shop-text hover:enabled:border-shop-accent',
				isUnavailable &&
					!isSelected &&
					'line-through text-shop-muted opacity-40 cursor-not-allowed',
				className,
			)}
		>
			{children}
		</button>
	);
});

function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace('#', '');
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Returns '#000' or '#fff' based on the perceived luminance of a hex color. */
function contrastColor(hex: string): string {
	const h = hex.replace('#', '');
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
	return luminance > 0.55 ? '#000000' : '#ffffff';
}
