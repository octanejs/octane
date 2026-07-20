import * as React from 'react';
import { twMerge } from 'tailwind-merge';

type CardOwnProps<TElement extends React.ElementType = 'div'> = {
	as?: TElement;
	children: React.ReactNode;
	className?: string;
};

type CardProps<TElement extends React.ElementType = 'div'> = CardOwnProps<TElement> &
	Omit<React.ComponentPropsWithoutRef<TElement>, keyof CardOwnProps<TElement>>;

type CardComponent = <TElement extends React.ElementType = 'div'>(
	props: CardProps<TElement>,
) => React.ReactNode;

export const Card: CardComponent = ({ as, children, className, ...props }) => {
	const Component = as || 'div';
	return React.createElement(
		Component,
		{
			className: twMerge(
				'bg-white dark:bg-gray-900 rounded-lg shadow-md border border-gray-200 dark:border-gray-800',
				className,
			),
			...props,
		},
		children,
	);
};
