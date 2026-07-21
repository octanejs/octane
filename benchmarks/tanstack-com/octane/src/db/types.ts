// Client-safe types and constants
// This file contains NO drizzle-orm imports and can be safely imported in client code

// Enum constants - single source of truth for both TypeScript types and Drizzle pgEnums
export const CAPABILITIES = [
	'admin',
	'api-keys',
	'disableAds',
	'builder',
	'mcp',
	'moderate-feedback',
	'moderate-showcases',
] as const;

export const OAUTH_PROVIDERS = ['github', 'google'] as const;

export const DOC_FEEDBACK_TYPES = ['note', 'improvement'] as const;

export const DOC_FEEDBACK_STATUSES = ['pending', 'approved', 'denied'] as const;

export const SHOWCASE_STATUSES = ['pending', 'approved', 'denied'] as const;

// Note: 'open-source' is kept in enum for DB compatibility but hidden from UI
// Open source status is now derived from sourceUrl field
export const SHOWCASE_USE_CASES = [
	'blog',
	'e-commerce',
	'saas',
	'dashboard',
	'documentation',
	'portfolio',
	'social',
	'developer-tool',
	'marketing',
	'media',
	'open-source',
] as const;

// Use cases shown in the UI (excludes deprecated 'open-source')
export const SHOWCASE_USE_CASES_UI = SHOWCASE_USE_CASES.filter((uc) => uc !== 'open-source');

export const AUDIT_ACTIONS = [
	'user.capabilities.update',
	'user.adsDisabled.update',
	'user.sessions.revoke',
	'role.create',
	'role.update',
	'role.delete',
	'role.assignment.create',
	'role.assignment.delete',
	'feedback.moderate',
	'showcase.create',
	'showcase.update',
	'showcase.delete',
	'showcase.moderate',
] as const;

export const RELEASE_LEVELS = ['major', 'minor', 'patch'] as const;

export const SIGNUP_SOURCES = ['newsletter'] as const;

// Derived types from constants
export type Capability = (typeof CAPABILITIES)[number];
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export type DocFeedbackType = (typeof DOC_FEEDBACK_TYPES)[number];
export type DocFeedbackStatus = (typeof DOC_FEEDBACK_STATUSES)[number];
export type ShowcaseStatus = (typeof SHOWCASE_STATUSES)[number];
export type ShowcaseUseCase = (typeof SHOWCASE_USE_CASES)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type ReleaseLevel = (typeof RELEASE_LEVELS)[number];
export type SignupSource = (typeof SIGNUP_SOURCES)[number];

// Legacy aliases for backwards compatibility
/** @deprecated Use CAPABILITIES instead */
export const VALID_CAPABILITIES = CAPABILITIES;

// Capabilities that grant access to the admin area
export const ADMIN_ACCESS_CAPABILITIES = [
	'admin',
	'moderate-feedback',
	'moderate-showcases',
] as const;

// Inferred model types (manually defined to avoid drizzle-orm dependency)
// These mirror the shapes from InferSelectModel but are defined manually

export interface User {
	id: string;
	email: string;
	name: string | null;
	displayUsername: string | null;
	image: string | null;
	oauthImage: string | null;
	capabilities: Capability[];
	adsDisabled: boolean | null;
	interestedInHidingAds: boolean | null;
	lastUsedFramework: string | null;
	signupSources: SignupSource[];
	sessionVersion: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface DocFeedback {
	id: string;
	userId: string;
	type: DocFeedbackType;
	content: string;
	characterCount: number;
	pagePath: string;
	libraryId: string;
	libraryVersion: string;
	blockSelector: string;
	blockContentHash: string | null;
	blockMarkdown: string | null;
	status: DocFeedbackStatus;
	isDetached: boolean;
	isCollapsed: boolean;
	moderatedBy: string | null;
	moderatedAt: Date | null;
	moderationNote: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface Showcase {
	id: string;
	userId: string;
	name: string;
	tagline: string;
	description: string | null;
	url: string;
	logoUrl: string | null;
	screenshotUrl: string;
	sourceUrl: string | null;
	libraries: string[];
	useCases: ShowcaseUseCase[];
	isFeatured: boolean;
	status: ShowcaseStatus;
	moderatedBy: string | null;
	moderatedAt: Date | null;
	moderationNote: string | null;
	trancoRank: number | null;
	trancoRankUpdatedAt: Date | null;
	voteScore: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface ShowcaseVote {
	id: string;
	showcaseId: string;
	userId: string;
	value: number;
	createdAt: Date;
	updatedAt: Date;
}

export interface Role {
	id: string;
	name: string;
	description: string | null;
	capabilities: Capability[];
	createdAt: Date;
	updatedAt: Date;
}

// ============================================================================
// Capability Checking Utilities (isomorphic - works on client and server)
// ============================================================================

/**
 * Check if user has a specific capability.
 * Admin capability grants access to all other capabilities.
 */
export function hasCapability(capabilities: Capability[], requiredCapability: Capability): boolean {
	return capabilities.includes('admin') || capabilities.includes(requiredCapability);
}

/**
 * Check if user has all specified capabilities.
 * Admin capability grants access to all other capabilities.
 */
export function hasAllCapabilities(
	capabilities: Capability[],
	requiredCapabilities: Capability[],
): boolean {
	if (capabilities.includes('admin')) {
		return true;
	}
	return requiredCapabilities.every((cap) => capabilities.includes(cap));
}

/**
 * Check if user has any of the specified capabilities.
 * Admin capability grants access to all other capabilities.
 */
export function hasAnyCapability(
	capabilities: Capability[],
	requiredCapabilities: Capability[],
): boolean {
	if (capabilities.includes('admin')) {
		return true;
	}
	return requiredCapabilities.some((cap) => capabilities.includes(cap));
}

/**
 * Check if user has admin capability.
 */
export function isAdmin(capabilities: Capability[]): boolean {
	return capabilities.includes('admin');
}
