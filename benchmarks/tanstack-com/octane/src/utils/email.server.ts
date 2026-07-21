import { Resend } from 'resend';
import {
	notifyShowcaseSubmitted,
	notifyFeedbackSubmitted,
	sendTestNotification,
} from './discord.server';
import type { Capability } from '~/db/types';
import { env } from '~/utils/env';

// Keep Resend configured for future email needs
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const FROM_EMAIL = 'TanStack <notifications@tanstack.com>';

type ShowcaseData = {
	name: string;
	url: string;
	tagline: string;
	libraries: Array<string>;
	userName?: string;
};

type FeedbackData = {
	type: 'note' | 'improvement';
	pagePath: string;
	libraryId: string;
	content: string;
	userName?: string;
};

type ModeratorNotification = {
	capability: Capability;
	subject: string;
	text: string;
	html?: string;
	// Extended fields for Discord notifications
	_showcase?: ShowcaseData;
	_feedback?: FeedbackData;
};

/**
 * Send notifications to Discord for moderation events.
 * The capability parameter is kept for API compatibility but Discord
 * notifications go to the configured webhook channel.
 */
export async function notifyModerators(notification: ModeratorNotification) {
	if (notification._showcase) {
		await notifyShowcaseSubmitted(notification._showcase);
		return;
	}

	if (notification._feedback) {
		// Only send Discord notifications for improvements, not personal notes
		if (notification._feedback.type === 'improvement') {
			await notifyFeedbackSubmitted(notification._feedback);
		}
		return;
	}

	// Fallback: log if we can't determine the notification type
	console.log('[Notification] Unknown notification type:', {
		capability: notification.capability,
		subject: notification.subject,
	});
}

export function formatShowcaseSubmittedEmail(showcase: ShowcaseData) {
	const subject = `New Showcase: ${showcase.name}`;
	const text = `A new showcase has been submitted for review.

Name: ${showcase.name}
URL: ${showcase.url}
Tagline: ${showcase.tagline}
Libraries: ${showcase.libraries.join(', ')}
Submitted by: ${showcase.userName || 'Unknown'}

Review it at: https://tanstack.com/admin/showcases`;

	return { subject, text, _showcase: showcase };
}

export function formatFeedbackSubmittedEmail(feedback: FeedbackData) {
	const subject = `New ${feedback.type === 'note' ? 'Note' : 'Improvement'}: ${feedback.libraryId}`;
	const text = `New documentation feedback submitted.

Type: ${feedback.type}
Library: ${feedback.libraryId}
Page: ${feedback.pagePath}
By: ${feedback.userName || 'Unknown'}

Content:
${feedback.content}

Review it at: https://tanstack.com/admin/feedback`;

	return { subject, text, _feedback: feedback };
}

/**
 * Send a test notification to verify the system is working.
 */
export async function sendTestEmail(_capability: Capability): Promise<{
	success: boolean;
	emails: Array<string>;
	error?: string;
}> {
	const success = await sendTestNotification();

	if (success) {
		return { success: true, emails: ['discord'] };
	}

	return {
		success: false,
		emails: [],
		error: 'Discord webhook not configured (DISCORD_WEBHOOK_URL missing)',
	};
}

// Export Resend instance for future email needs
export { resend, FROM_EMAIL };
