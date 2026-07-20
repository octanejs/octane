/**
 * Shared utilities for doc feedback that work in both client and server.
 * No dependencies on browser APIs or server-only modules.
 */

export type DocFeedbackType = 'note' | 'improvement';

/**
 * Calculate points from character count and feedback type.
 * Personal notes earn 0 points.
 * Improvements: 0.1 points per character, min 1 point (10 chars), soft cap 100 points (1000 chars).
 */
export function calculatePoints(characterCount: number, type: DocFeedbackType): number {
	if (type === 'note') {
		return 0;
	}

	if (characterCount < 10) {
		return Math.max(0, characterCount * 0.1);
	}

	if (characterCount >= 1000) {
		return 100;
	}

	return characterCount * 0.1;
}
