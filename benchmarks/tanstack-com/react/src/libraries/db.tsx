import { GalleryVerticalEnd, Zap } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { CogsIcon } from '~/components/icons/CogsIcon';
import { db } from './libraries';

const textStyles = `text-orange-600 dark:text-orange-500`;

export const dbProject = {
	...db,
	description: `TanStack DB gives you a reactive, client-first store for your API data with collections, live queries and optimistic mutations that keep your UI reactive, consistent and blazing fast 🔥`,
	latestBranch: 'main',
	bgRadial: 'from-orange-500 via-orange-700/50 to-transparent',
	textColor: `text-orange-700`,
	defaultDocs: 'overview',
	featureHighlights: [
		{
			title: 'Collections',
			icon: <GalleryVerticalEnd className={twMerge(textStyles)} />,
			description: (
				<div>
					Collections are typed sets of objects. Sync or load data into them. Query across them with
					live queries and write locally to them using optimistic mutations.
				</div>
			),
		},
		{
			title: 'Live Queries',
			icon: <Zap className={twMerge(textStyles)} />,
			description: (
				<div>
					Live queries run reactively against and across collections. They're super fast, powered by
					differential dataflow, with support for joins, filters and aggregates.
				</div>
			),
		},
		{
			title: 'Optimistic mutations',
			icon: <CogsIcon className={twMerge(textStyles)} />,
			description: (
				<div>
					Batch and stage instant local changes across collections. Sync transactions to the backend
					with automatic management of rollbacks and optimistic state.
				</div>
			),
		},
	],
};
