import type { ShellProps } from './shell.tsrx';

// Data the server response carried: both sides read settled values, so
// hydration adopts the content instead of the pending arm.
export function shellProps(): ShellProps {
	const greeting = Object.assign(Promise.resolve('welcome'), {
		status: 'fulfilled' as const,
		value: 'welcome',
	});
	return {
		items: [
			{ id: 'a', title: 'alpha' },
			{ id: 'b', title: 'beta' },
			{ id: 'c', title: 'gamma' },
		],
		greeting,
	};
}
