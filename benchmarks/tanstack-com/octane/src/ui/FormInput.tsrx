import { twMerge } from 'tailwind-merge';

type FormInputProps =
	Record<string, any> & {
		/** Ring color on focus. Defaults to blue. */
		focusRing?: 'blue' | 'orange' | 'purple';
	};

const ringStyles = {
	blue: 'focus:ring-blue-500',
	orange: 'focus:ring-orange-500',
	purple: 'focus:ring-purple-500',
};

// No forwardRef in octane: `ref` arrives as an ordinary prop and is forwarded
// through the `...props` spread onto the input.
export function FormInput({ className, focusRing = 'blue', ...props }: FormInputProps) {
	return <input
		class={twMerge(
			'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition-shadow',
			ringStyles[focusRing],
			className,
		)}
		{...props}
	/>;
}
