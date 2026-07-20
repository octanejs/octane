import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import type { Framework } from '~/libraries';
import { getFrameworkOptions } from '~/libraries/frameworks';

type FrameworkIconTabsProps = {
	frameworks: Framework[];
	value: Framework;
	onChange: (framework: Framework) => void;
	className?: string;
};

export function FrameworkIconTabs({
	frameworks,
	value,
	onChange,
	className,
}: FrameworkIconTabsProps) {
	const options = React.useMemo(() => getFrameworkOptions(frameworks), [frameworks]);

	return (
		<div
			className={twMerge(
				`flex items-center justify-start gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto scrollbar-hide`,
				className,
			)}
		>
			{options.map((opt) => (
				<button
					key={opt.value}
					className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 -mb-[1px] border-b-2 text-sm font-bold transition-colors ${
						value === opt.value
							? 'border-current text-current'
							: 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
					}`}
					onClick={() => onChange(opt.value as Framework)}
					aria-label={opt.label}
					title={opt.label}
					type="button"
				>
					<img src={opt.logo} alt="" className="w-4 h-4" />
					<span>{opt.label}</span>
				</button>
			))}
		</div>
	);
}
