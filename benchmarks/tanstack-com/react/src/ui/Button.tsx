import * as React from 'react';
import { twMerge } from 'tailwind-merge';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon';

type ButtonColor =
	| 'blue'
	| 'green'
	| 'red'
	| 'orange'
	| 'purple'
	| 'gray'
	| 'emerald'
	| 'cyan'
	| 'yellow';

type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon-sm' | 'icon-md';

type ButtonRounded = 'none' | 'md' | 'lg' | 'full';

type ButtonOwnProps<TElement extends React.ElementType = 'button'> = {
	as?: TElement;
	children: React.ReactNode;
	variant?: ButtonVariant;
	color?: ButtonColor;
	size?: ButtonSize;
	rounded?: ButtonRounded;
	className?: string;
};

type ButtonProps<TElement extends React.ElementType = 'button'> = ButtonOwnProps<TElement> &
	Omit<React.ComponentPropsWithRef<TElement>, keyof ButtonOwnProps<TElement>>;

type ButtonComponent = <TElement extends React.ElementType = 'button'>(
	props: ButtonProps<TElement>,
) => React.ReactNode;

const primaryColorStyles: Record<ButtonColor, string> = {
	blue: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700',
	green: 'bg-green-600 text-white border-green-600 hover:bg-green-700',
	red: 'bg-red-600 text-white border-red-600 hover:bg-red-700',
	orange: 'bg-orange-600 text-white border-orange-600 hover:bg-orange-700',
	purple: 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700',
	gray: 'bg-gray-600 text-white border-gray-600 hover:bg-gray-700',
	emerald: 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600',
	cyan: 'bg-cyan-500 text-white border-cyan-500 hover:bg-cyan-600',
	yellow: 'bg-yellow-400 text-black border-yellow-400 hover:bg-yellow-500',
};

const iconColorStyles: Record<ButtonColor, string> = {
	blue: 'text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30',
	green: 'text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30',
	red: 'text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30',
	orange: 'text-orange-600 hover:bg-orange-100 dark:hover:bg-orange-900/30',
	purple: 'text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30',
	gray: 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
	emerald: 'text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30',
	cyan: 'text-cyan-600 hover:bg-cyan-100 dark:hover:bg-cyan-900/30',
	yellow: 'text-yellow-600 hover:bg-yellow-100 dark:hover:bg-yellow-900/30',
};

const variantStyles: Record<ButtonVariant, string> = {
	primary: 'border font-medium',
	secondary:
		'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border-transparent font-medium',
	ghost:
		'border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium',
	icon: 'border-transparent',
};

const sizeStyles: Record<ButtonSize, string> = {
	xs: 'px-2 py-1.5 text-xs',
	sm: 'px-3 py-1 text-sm',
	md: 'px-4 py-2 text-sm',
	lg: 'px-6 py-3 text-base',
	'icon-sm': 'p-1.5',
	'icon-md': 'p-2',
};

const roundedStyles: Record<ButtonRounded, string> = {
	none: 'rounded-none',
	md: 'rounded-md',
	lg: 'rounded-lg',
	full: 'rounded-full',
};

const baseStyles =
	'inline-flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900';

function getDefaultSize(variant: ButtonVariant): ButtonSize {
	if (variant === 'icon') return 'icon-md';
	return 'md';
}

function getDefaultRounded(size: ButtonSize): ButtonRounded {
	if (size === 'xs' || size === 'sm') return 'md';
	if (size === 'icon-sm' || size === 'icon-md') return 'lg';
	return 'lg';
}

type ButtonInnerProps = ButtonOwnProps & Record<string, unknown>;

export const Button: ButtonComponent = React.forwardRef<HTMLElement, ButtonInnerProps>(
	function Button(props, ref) {
		const {
			as,
			children,
			variant = 'primary',
			color = 'blue',
			size,
			rounded,
			className,
			...rest
		} = props as ButtonOwnProps & Record<string, unknown>;
		const Component = as || 'button';
		const resolvedSize = size ?? getDefaultSize(variant);
		const resolvedRounded = rounded ?? getDefaultRounded(resolvedSize);

		const colorStyles =
			variant === 'primary'
				? primaryColorStyles[color]
				: variant === 'icon'
					? iconColorStyles[color]
					: '';

		return React.createElement(
			Component,
			{
				ref,
				className: twMerge(
					baseStyles,
					variantStyles[variant],
					sizeStyles[resolvedSize],
					roundedStyles[resolvedRounded],
					colorStyles,
					className,
				),
				...rest,
			},
			children,
		);
	},
) as unknown as ButtonComponent;
