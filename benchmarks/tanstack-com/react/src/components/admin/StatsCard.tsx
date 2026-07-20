import * as React from 'react';
import { Card } from '~/components/Card';
import { twMerge } from 'tailwind-merge';

type StatsCardProps = {
	label: string;
	value: string | number;
	icon?: React.ReactNode;
	className?: string;
};

export function StatsCard({ label, value, icon, className }: StatsCardProps) {
	return (
		<Card className={twMerge('p-4', className)}>
			<div className="flex items-center gap-3">
				{icon && <div className="text-gray-400 dark:text-gray-500">{icon}</div>}
				<div>
					<div className="text-sm font-medium text-gray-600 dark:text-gray-400">{label}</div>
					<div className="text-2xl font-bold text-gray-900 dark:text-white">
						{typeof value === 'number' ? value.toLocaleString() : value}
					</div>
				</div>
			</div>
		</Card>
	);
}
