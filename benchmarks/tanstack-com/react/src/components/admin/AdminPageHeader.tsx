import * as React from 'react';
import { Spinner } from '~/components/Spinner';

type AdminPageHeaderProps = {
	icon: React.ReactNode;
	title: string;
	isLoading?: boolean;
	actions?: React.ReactNode;
};

export function AdminPageHeader({ icon, title, isLoading, actions }: AdminPageHeaderProps) {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-3">
				<div className="text-2xl text-blue-500">{icon}</div>
				<h1 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h1>
				{isLoading && <Spinner className="text-gray-500 dark:text-gray-400" />}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}
