import { GitBranch, RotateCcw, ShieldCheck } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { workflow } from './libraries';

const textStyles = 'text-blue-900 dark:text-blue-400';

export const workflowProject = {
	...workflow,
	description:
		'Define durable, type-safe workflows for the messy parts of real applications: approvals, retries, fan-out, long-running jobs, and state you need to trust.',
	featureHighlights: [
		{
			title: 'Typed Workflows',
			icon: <GitBranch className={twMerge(textStyles)} />,
			description: (
				<div>
					Model each step with TypeScript-first inputs, outputs, and shared context.{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						Your workflow graph stays understandable as it grows
					</span>
					, with types carrying intent across every transition.
				</div>
			),
		},
		{
			title: 'Durable Execution',
			icon: <ShieldCheck className={twMerge(textStyles)} />,
			description: (
				<div>
					Keep critical business processes moving through deploys, restarts, and slow external
					systems.{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						Workflow state is designed to be resumed, inspected, and trusted
					</span>{' '}
					instead of hidden inside one-off background jobs.
				</div>
			),
		},
		{
			title: 'Retries & Recovery',
			icon: <RotateCcw className={twMerge(textStyles)} />,
			description: (
				<div>
					Configure retries, backoff, and recovery behavior close to the work being performed.{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						Handle failure as part of the workflow model
					</span>
					, not as scattered glue code around it.
				</div>
			),
		},
	],
};
