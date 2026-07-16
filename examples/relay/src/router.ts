import type { ChannelId, Route } from './types';

export const CHANNELS: readonly ChannelId[] = ['general', 'design', 'random'];

export const CHANNEL_DETAILS: Readonly<
	Record<ChannelId, { label: string; description: string; members: number }>
> = {
	general: {
		label: 'general',
		description: 'Company-wide announcements and work in progress',
		members: 28,
	},
	design: {
		label: 'design',
		description: 'Critiques, research notes, and product craft',
		members: 12,
	},
	random: {
		label: 'random',
		description: 'A quiet corner for everything beyond the roadmap',
		members: 28,
	},
};

function isChannel(value: string): value is ChannelId {
	return CHANNELS.some((channel) => channel === value);
}

export function readRoute(pathname = window.location.pathname): Route {
	const match = pathname.match(/^\/channels\/([^/]+)(?:\/thread\/([^/]+))?\/?$/);
	if (match === null || !isChannel(match[1] ?? '')) {
		return { channel: 'general', threadId: null };
	}
	return {
		channel: match[1] as ChannelId,
		threadId: match[2] ? decodeURIComponent(match[2]) : null,
	};
}

export function channelURL(channel: ChannelId): string {
	return `/channels/${channel}${window.location.search}`;
}

export function threadURL(channel: ChannelId, messageId: string): string {
	return `/channels/${channel}/thread/${encodeURIComponent(messageId)}${window.location.search}`;
}
