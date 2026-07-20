import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '~/ui';

type AdminEmptyStateProps = {
	icon: React.ReactNode;
	title: string;
	description?: string;
	action?: {
		label: string;
		to: string;
	};
};

export function AdminEmptyState({ icon, title, description, action }: AdminEmptyStateProps) {
	return (
		<div className="text-center py-12">
			<div className="mx-auto h-12 w-12 text-gray-400 flex items-center justify-center">{icon}</div>
			<h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{title}</h3>
			{description && (
				<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
			)}
			{action && (
				<div className="mt-6">
					<Link to={action.to}>
						<Button size="sm">{action.label}</Button>
					</Link>
				</div>
			)}
		</div>
	);
}
