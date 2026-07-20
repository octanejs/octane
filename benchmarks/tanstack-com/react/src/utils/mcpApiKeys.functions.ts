import { createServerFn } from '@tanstack/react-start';
import * as v from 'valibot';
import { db } from '~/db/client';
import { mcpApiKeys } from '~/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from './auth.functions';
import { generateApiKey } from '~/mcp/auth.server';

/**
 * Require authenticated user
 */
async function requireApiKeysAccess() {
	return requireAuth();
}

/**
 * List the current user's API keys
 */
export const listMcpApiKeys = createServerFn({ method: 'POST' }).handler(async () => {
	const user = await requireApiKeysAccess();

	const keys = await db
		.select({
			id: mcpApiKeys.id,
			keyPrefix: mcpApiKeys.keyPrefix,
			name: mcpApiKeys.name,
			rateLimitPerMinute: mcpApiKeys.rateLimitPerMinute,
			isActive: mcpApiKeys.isActive,
			lastUsedAt: mcpApiKeys.lastUsedAt,
			expiresAt: mcpApiKeys.expiresAt,
			createdAt: mcpApiKeys.createdAt,
		})
		.from(mcpApiKeys)
		.where(eq(mcpApiKeys.userId, user.userId))
		.orderBy(desc(mcpApiKeys.createdAt));

	return keys.map((key) => ({
		...key,
		lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
		expiresAt: key.expiresAt?.toISOString() ?? null,
		createdAt: key.createdAt.toISOString(),
	}));
});

/**
 * Create a new MCP API key for the current user
 * Returns the raw key (only shown once)
 */
export const createMcpApiKey = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			name: v.pipe(
				v.string(),
				v.minLength(1, 'Name is required'),
				v.maxLength(255, 'Name too long'),
			),
			expiresInDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
		}),
	)
	.handler(async ({ data }) => {
		const user = await requireApiKeysAccess();

		// Limit number of keys per user
		const existingKeys = await db
			.select({ id: mcpApiKeys.id })
			.from(mcpApiKeys)
			.where(and(eq(mcpApiKeys.userId, user.userId), eq(mcpApiKeys.isActive, true)));

		if (existingKeys.length >= 10) {
			throw new Error('Maximum of 10 active API keys allowed');
		}

		const { rawKey, keyHash, keyPrefix } = await generateApiKey();

		const expiresAt = data.expiresInDays
			? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
			: null;

		const [newKey] = await db
			.insert(mcpApiKeys)
			.values({
				keyHash,
				keyPrefix,
				name: data.name,
				userId: user.userId,
				expiresAt,
			})
			.returning({
				id: mcpApiKeys.id,
				keyPrefix: mcpApiKeys.keyPrefix,
				name: mcpApiKeys.name,
				createdAt: mcpApiKeys.createdAt,
			});

		return {
			id: newKey.id,
			keyPrefix: newKey.keyPrefix,
			name: newKey.name,
			createdAt: newKey.createdAt.toISOString(),
			rawKey,
		};
	});

/**
 * Revoke (deactivate) an MCP API key
 */
export const revokeMcpApiKey = createServerFn({ method: 'POST' })
	.validator(v.object({ keyId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		const user = await requireApiKeysAccess();

		const key = await db.query.mcpApiKeys.findFirst({
			where: and(eq(mcpApiKeys.id, data.keyId), eq(mcpApiKeys.userId, user.userId)),
		});

		if (!key) {
			throw new Error('API key not found');
		}

		await db
			.update(mcpApiKeys)
			.set({ isActive: false })
			.where(and(eq(mcpApiKeys.id, data.keyId), eq(mcpApiKeys.userId, user.userId)));

		return { success: true };
	});

/**
 * Delete an MCP API key permanently
 */
export const deleteMcpApiKey = createServerFn({ method: 'POST' })
	.validator(v.object({ keyId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		const user = await requireApiKeysAccess();

		const key = await db.query.mcpApiKeys.findFirst({
			where: and(eq(mcpApiKeys.id, data.keyId), eq(mcpApiKeys.userId, user.userId)),
		});

		if (!key) {
			throw new Error('API key not found');
		}

		await db
			.delete(mcpApiKeys)
			.where(and(eq(mcpApiKeys.id, data.keyId), eq(mcpApiKeys.userId, user.userId)));

		return { success: true };
	});

/**
 * Update an MCP API key's name
 */
export const updateMcpApiKey = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			keyId: v.pipe(v.string(), v.uuid()),
			name: v.pipe(
				v.string(),
				v.minLength(1, 'Name is required'),
				v.maxLength(255, 'Name too long'),
			),
		}),
	)
	.handler(async ({ data }) => {
		const user = await requireApiKeysAccess();

		const key = await db.query.mcpApiKeys.findFirst({
			where: and(eq(mcpApiKeys.id, data.keyId), eq(mcpApiKeys.userId, user.userId)),
		});

		if (!key) {
			throw new Error('API key not found');
		}

		await db
			.update(mcpApiKeys)
			.set({ name: data.name })
			.where(and(eq(mcpApiKeys.id, data.keyId), eq(mcpApiKeys.userId, user.userId)));

		return { success: true };
	});
