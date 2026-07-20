import { db } from '~/db/client';
import { docFeedback, type DocFeedbackStatus } from '~/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { requireCapability } from './auth.server';
import { getEffectiveCapabilities } from './capabilities.server';
import { sha256Hex } from './hash';
import { calculatePoints } from './docFeedback.shared';

// Re-export shared utilities
export { calculatePoints };

/**
 * Require the user to have the moderate-feedback capability
 */
export async function requireModerateFeedback() {
	return await requireCapability({
		data: { capability: 'moderate-feedback' },
	});
}

/**
 * Generate a hierarchical selector for a block element
 * Returns a selector like: "section[1] > h2[0] > p[2]"
 */
export function generateBlockSelector(elementPath: Array<{ tag: string; index: number }>): string {
	return elementPath.map((el) => `${el.tag}[${el.index}]`).join(' > ');
}

/**
 * Generate SHA-256 hash of block content for drift detection
 */
export const generateContentHash = sha256Hex;

/**
 * Check if the user can moderate feedback (has moderate-feedback or admin capability)
 */
export async function canModerateFeedback(userId: string): Promise<boolean> {
	const capabilities = await getEffectiveCapabilities(userId);
	return capabilities.includes('moderate-feedback') || capabilities.includes('admin');
}

/**
 * Get user's total approved feedback points
 */
export async function getUserTotalPoints(userId: string): Promise<number> {
	const result = await db
		.select({
			characterCount: docFeedback.characterCount,
			type: docFeedback.type,
		})
		.from(docFeedback)
		.where(
			and(eq(docFeedback.userId, userId), eq(docFeedback.status, 'approved' as DocFeedbackStatus)),
		);

	// Calculate total points in JS

	return result.reduce((sum, item) => {
		return sum + calculatePoints(item.characterCount, item.type);
	}, 0);
}

/**
 * Get feedback statistics for a user
 */
export async function getUserFeedbackStats(userId: string) {
	// Only count improvements for status stats (notes are private and don't need moderation)
	const feedback = await db
		.select({
			status: docFeedback.status,
			characterCount: docFeedback.characterCount,
			type: docFeedback.type,
		})
		.from(docFeedback)
		.where(and(eq(docFeedback.userId, userId), eq(docFeedback.type, 'improvement')));

	// Calculate stats in JS
	const statsMap = {
		pending: { count: 0, points: 0 },
		approved: { count: 0, points: 0 },
		denied: { count: 0, points: 0 },
	};

	feedback.forEach((item) => {
		const points = calculatePoints(item.characterCount, item.type);
		statsMap[item.status].count++;
		statsMap[item.status].points += points;
	});

	const total = Object.values(statsMap).reduce((sum, stat) => sum + stat.count, 0);

	return {
		total,
		totalApprovedPoints: statsMap.approved.points,
		byStatus: statsMap,
	};
}

/**
 * Validate that user owns the feedback
 */
export async function validateFeedbackOwnership(feedbackId: string, userId: string): Promise<void> {
	const feedback = await db.query.docFeedback.findFirst({
		where: eq(docFeedback.id, feedbackId),
	});

	if (!feedback) {
		throw new Error('Feedback not found');
	}

	if (feedback.userId !== userId) {
		throw new Error('You do not have permission to modify this feedback');
	}
}

/**
 * Check rate limit for feedback submissions
 * Returns true if rate limit is exceeded, false otherwise
 */
export async function checkRateLimit(userId: string): Promise<boolean> {
	// Limit: 10 submissions per hour
	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

	const recentSubmissions = await db
		.select({ count: sql<number>`COUNT(*)::int` })
		.from(docFeedback)
		.where(and(eq(docFeedback.userId, userId), gte(docFeedback.createdAt, oneHourAgo)));

	const count = recentSubmissions[0]?.count ?? 0;
	return count >= 10;
}
