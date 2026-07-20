import { env } from '~/utils/env';

const DISCORD_WEBHOOK_URL = env.DISCORD_WEBHOOK_URL;

type EmbedField = {
	name: string;
	value: string;
	inline?: boolean;
};

type DiscordEmbed = {
	title?: string;
	description?: string;
	color?: number;
	fields?: Array<EmbedField>;
	url?: string;
	timestamp?: string;
	footer?: {
		text: string;
	};
};

type DiscordWebhookPayload = {
	content?: string;
	embeds?: Array<DiscordEmbed>;
	username?: string;
	avatar_url?: string;
};

export async function sendDiscordNotification(payload: DiscordWebhookPayload): Promise<boolean> {
	if (!DISCORD_WEBHOOK_URL) {
		console.log('[Discord] Webhook not configured, skipping notification:', {
			title: payload.embeds?.[0]?.title,
		});
		return false;
	}

	try {
		const response = await fetch(DISCORD_WEBHOOK_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				username: 'TanStack Bot',
				...payload,
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			console.error('[Discord] Webhook failed:', response.status, text);
			return false;
		}

		return true;
	} catch (error) {
		console.error('[Discord] Failed to send notification:', error);
		return false;
	}
}

// Colors
const COLORS = {
	blue: 0x3b82f6,
	amber: 0xf59e0b,
	green: 0x22c55e,
	red: 0xef4444,
	purple: 0xa855f7,
} as const;

export function formatShowcaseEmbed(showcase: {
	name: string;
	url: string;
	tagline: string;
	libraries: Array<string>;
	userName?: string;
}): DiscordEmbed {
	return {
		title: '🎨 New Showcase Submitted',
		description: showcase.tagline,
		color: COLORS.blue,
		fields: [
			{ name: 'Name', value: showcase.name, inline: true },
			{ name: 'URL', value: showcase.url, inline: true },
			{ name: 'Libraries', value: showcase.libraries.join(', '), inline: true },
			{
				name: 'Submitted by',
				value: showcase.userName || 'Unknown',
				inline: true,
			},
		],
		url: 'https://tanstack.com/admin/showcases',
		footer: { text: 'Review in Admin → /admin/showcases' },
		timestamp: new Date().toISOString(),
	};
}

export function formatFeedbackEmbed(feedback: {
	type: 'note' | 'improvement';
	pagePath: string;
	libraryId: string;
	content: string;
	userName?: string;
}): DiscordEmbed {
	const typeLabel = feedback.type === 'note' ? '📝 Note' : '💡 Improvement';
	const truncatedContent =
		feedback.content.length > 1000 ? feedback.content.slice(0, 1000) + '...' : feedback.content;

	return {
		title: `${typeLabel}: ${feedback.libraryId}`,
		description: truncatedContent,
		color: COLORS.amber,
		fields: [
			{ name: 'Library', value: feedback.libraryId, inline: true },
			{ name: 'Page', value: feedback.pagePath, inline: true },
			{ name: 'By', value: feedback.userName || 'Unknown', inline: true },
		],
		url: 'https://tanstack.com/admin/feedback',
		footer: { text: 'Review in Admin → /admin/feedback' },
		timestamp: new Date().toISOString(),
	};
}

export async function notifyShowcaseSubmitted(showcase: {
	name: string;
	url: string;
	tagline: string;
	libraries: Array<string>;
	userName?: string;
}): Promise<boolean> {
	const embed = formatShowcaseEmbed(showcase);
	return sendDiscordNotification({ embeds: [embed] });
}

export async function notifyFeedbackSubmitted(feedback: {
	type: 'note' | 'improvement';
	pagePath: string;
	libraryId: string;
	content: string;
	userName?: string;
}): Promise<boolean> {
	const embed = formatFeedbackEmbed(feedback);
	return sendDiscordNotification({ embeds: [embed] });
}

export async function sendTestNotification(): Promise<boolean> {
	return sendDiscordNotification({
		embeds: [
			{
				title: '✅ Test Notification',
				description: 'Discord notifications are working correctly.',
				color: COLORS.green,
				timestamp: new Date().toISOString(),
			},
		],
	});
}
