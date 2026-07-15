export const BLOCKED_JAVASCRIPT_URL: string;

export function sanitizeURL(url: string): string;

export function shouldSanitizeURLAttribute(tag: string | undefined, name: string): boolean;

export function sanitizeURLAttribute(tag: string | undefined, name: string, value: string): string;
