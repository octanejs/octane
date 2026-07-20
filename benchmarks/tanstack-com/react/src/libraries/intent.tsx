import { Library } from '.';
import { BookOpen, Package, RefreshCw } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { intent } from './libraries';

const textStyles = `text-sky-600 dark:text-sky-500`;

export const intentProject = {
	...intent,
	featureHighlights: [
		{
			title: 'Agent Skills in npm',
			icon: <Package className={twMerge(textStyles)} />,
			description: (
				<div>
					Ship <span className={twMerge('font-semibold', textStyles)}>Agent Skills</span> —
					procedural knowledge agents load on demand — as part of your npm package. Skills travel
					with your library via npm update, not the model's training cutoff or copy-pasted rules
					files.
				</div>
			),
		},
		{
			title: 'Automatic Discovery',
			icon: <BookOpen className={twMerge(textStyles)} />,
			description: (
				<div>
					Agents discover skills automatically from{' '}
					<span className={twMerge('font-semibold', textStyles)}>node_modules</span>. No manual
					setup per-library. Install the package and agents can find and use the skills — compatible
					with the open Agent Skills format.
				</div>
			),
		},
		{
			title: 'Staleness Detection',
			icon: <RefreshCw className={twMerge(textStyles)} />,
			description: (
				<div>
					Each skill declares its source docs. When those docs change,{' '}
					<span className={twMerge('font-semibold', textStyles)}>@tanstack/intent stale</span> flags
					the skill for review. Run it in CI and you get a failing check when sources drift — skills
					become part of your release checklist.
				</div>
			),
		},
	],
} satisfies Library;
