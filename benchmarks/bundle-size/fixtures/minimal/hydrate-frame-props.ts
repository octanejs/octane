import type { FrameProps } from './hydrate-frame-app.tsrx';

// The @try boundary reads already-settled data on both sides, as a frame whose
// server response carried the result does, so hydration adopts the content
// instead of rendering the pending arm.
export function frameProps(): FrameProps {
	const content = Object.assign(Promise.resolve('welcome'), {
		status: 'fulfilled' as const,
		value: 'welcome',
	});
	return {
		items: [
			{ id: 'inbox', label: 'Inbox' },
			{ id: 'sent', label: 'Sent' },
			{ id: 'archive', label: 'Archive' },
		],
		content,
		style: { width: '200px' },
	};
}
