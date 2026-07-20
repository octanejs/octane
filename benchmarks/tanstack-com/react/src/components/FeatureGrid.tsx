import * as React from 'react';
import { CheckCircleIcon } from '~/components/icons/CheckCircleIcon';

type FeatureGridProps = {
	title?: string;
	items: React.ReactNode[];
	gridClassName?: string;
};

export function FeatureGrid({ title, items, gridClassName }: FeatureGridProps) {
	return (
		<div className="px-4 sm:px-6 lg:px-8 mx-auto">
			{title ? (
				<div className="pb-8">
					<h3 className="text-3xl font-bold">{title}</h3>
				</div>
			) : null}
			<div
				className={
					gridClassName ||
					'grid grid-flow-row grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-4 mx-auto'
				}
			>
				{items.map((d, i) => (
					<span key={i} className="flex gap-2">
						<CheckCircleIcon className="text-green-500 h-lh w-4 shrink-0" /> {d}
					</span>
				))}
			</div>
		</div>
	);
}
