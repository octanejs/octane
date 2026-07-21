import { createElement } from 'octane';
import { twMerge } from 'tailwind-merge';

type CardProps =
	Record<string, any> & {
		as?: any;
		children?: any;
		className?: string;
	};

export const Card = ({ as, children, className, ...props }: CardProps) => {
	const Component = as || 'div';
	return createElement(
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
