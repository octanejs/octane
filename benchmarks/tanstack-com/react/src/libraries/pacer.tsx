import { ArrowRightLeft, CircleGauge, WandSparkles } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { pacer } from './libraries';

const textStyles = `text-lime-600 dark:text-lime-500`;

export const pacerProject = {
	...pacer,
	description: `Optimize your application's performance with TanStack Pacer's core primitives: Debouncing, Throttling, Rate Limiting, Queuing, and Batching.`,
	latestBranch: 'main',
	bgRadial: 'from-lime-500 via-lime-700/50 to-transparent',
	textColor: `text-lime-700`,
	defaultDocs: 'overview',
	featureHighlights: [
		{
			title: 'Flexible & Type-Safe',
			icon: <WandSparkles className={twMerge(textStyles)} />,
			description: (
				<div>
					TanStack Pacer provides an intuitive and flexible API that works across any JavaScript
					framework.{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						Every utility is fully type-safe with reactive framework adapters
					</span>{' '}
					that seamlessly connect to your state management of choice. Choose from multiple layers of
					abstraction to confidently control timing in your applications.
				</div>
			),
		},
		{
			title: 'Optimize Performance',
			icon: <CircleGauge className={twMerge(textStyles)} />,
			description: (
				<div>
					Enhance your application's efficiency with flexible utilities for{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						debouncing, throttling, rate limiting, queuing, and batching
					</span>
					. Reduce unnecessary operations and resource consumption while maintaining smooth user
					experiences. Built-in cleanup and cancellation capabilities help prevent memory leaks and
					optimize resource usage. Fine-tune behavior with flexible configuration options to match
					your specific performance needs.
				</div>
			),
		},
		{
			title: 'Async or Sync',
			icon: <ArrowRightLeft className={twMerge(textStyles)} />,
			description: (
				<div>
					Choose between async or sync execution for each utility based on your needs.{' '}
					<span className={twMerge('font-semibold', textStyles)}>
						Take advantage of optional built-in error handling, retries, abort controllers, and
						status reporting
					</span>
					. Perfect for handling both simple synchronous operations and complex task pooling
					workflows with or without concurrency control.
				</div>
			),
		},
	],
};
