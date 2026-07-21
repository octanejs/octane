import { createServerFn } from '@octanejs/tanstack-start';
import * as v from 'valibot';
import { VALID_CAPABILITIES, type Capability } from '~/db/types';
import { requireAdmin } from './roles.server';
import { db } from '~/db/client';
import { roles, roleAssignments, users } from '~/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getEffectiveCapabilities } from './capabilities.server';
import { recordAuditLog } from './audit.server';
import { sendTestEmail } from './email.server';

const capabilityPicklist = v.picklist(
	VALID_CAPABILITIES as unknown as [Capability, ...Capability[]],
);

export const listRoles = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			nameFilter: v.optional(v.string()),
			capabilityFilter: v.optional(v.array(capabilityPicklist)),
		}),
	)
	.handler(async ({ data }) => {
		await requireAdmin();

		// Get all roles
		let allRoles = await db.select().from(roles);

		// Apply name filter
		if (data.nameFilter && data.nameFilter.length > 0) {
			const nameLower = data.nameFilter.toLowerCase();
			allRoles = allRoles.filter(
				(role) =>
					role.name.toLowerCase().includes(nameLower) ||
					(role.description && role.description.toLowerCase().includes(nameLower)),
			);
		}

		// Apply capability filter
		if (data.capabilityFilter && data.capabilityFilter.length > 0) {
			allRoles = allRoles.filter((role) =>
				data.capabilityFilter!.some((cap) => role.capabilities.includes(cap)),
			);
		}

		// Sort by name
		const sorted = allRoles.sort((a, b) => a.name.localeCompare(b.name));

		// Transform to match expected format
		return sorted.map((role) => ({
			_id: role.id,
			name: role.name,
			description: role.description,
			capabilities: role.capabilities,
			createdAt: role.createdAt.getTime(),
			updatedAt: role.updatedAt.getTime(),
		}));
	});

export const getRole = createServerFn({ method: 'POST' })
	.validator(v.object({ roleId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		await requireAdmin();

		const role = await db.query.roles.findFirst({
			where: eq(roles.id, data.roleId),
		});

		if (!role) {
			throw new Error('Role not found');
		}

		return {
			_id: role.id,
			name: role.name,
			description: role.description,
			capabilities: role.capabilities,
			createdAt: role.createdAt.getTime(),
			updatedAt: role.updatedAt.getTime(),
		};
	});

export const createRole = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			name: v.string(),
			description: v.optional(v.string()),
			capabilities: v.array(capabilityPicklist),
		}),
	)
	.handler(async ({ data }) => {
		const { currentUser } = await requireAdmin();

		// Check if role with same name already exists
		const existing = await db.query.roles.findFirst({
			where: eq(roles.name, data.name),
		});

		if (existing) {
			throw new Error(`Role with name "${data.name}" already exists`);
		}

		const [newRole] = await db
			.insert(roles)
			.values({
				name: data.name,
				description: data.description,
				capabilities: data.capabilities,
			})
			.returning();

		// Record audit log
		await recordAuditLog({
			actorId: currentUser.userId,
			action: 'role.create',
			targetType: 'role',
			targetId: newRole.id,
			details: {
				name: data.name,
				description: data.description,
				capabilities: data.capabilities,
			},
		});

		return { roleId: newRole.id, success: true };
	});

export const updateRole = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			roleId: v.pipe(v.string(), v.uuid()),
			name: v.optional(v.string()),
			description: v.optional(v.string()),
			capabilities: v.optional(v.array(capabilityPicklist)),
		}),
	)
	.handler(async ({ data }) => {
		const { currentUser } = await requireAdmin();

		const role = await db.query.roles.findFirst({
			where: eq(roles.id, data.roleId),
		});

		if (!role) {
			throw new Error('Role not found');
		}

		// If name is being updated, check for duplicates
		if (data.name && data.name !== role.name) {
			const existing = await db.query.roles.findFirst({
				where: eq(roles.name, data.name),
			});

			if (existing) {
				throw new Error(`Role with name "${data.name}" already exists`);
			}
		}

		const updates: {
			name?: string;
			description?: string;
			capabilities?: Capability[];
			updatedAt: Date;
		} = {
			updatedAt: new Date(),
		};

		if (data.name !== undefined) updates.name = data.name;
		if (data.description !== undefined) updates.description = data.description;
		if (data.capabilities !== undefined) updates.capabilities = data.capabilities;

		await db.update(roles).set(updates).where(eq(roles.id, data.roleId));

		// Record audit log
		await recordAuditLog({
			actorId: currentUser.userId,
			action: 'role.update',
			targetType: 'role',
			targetId: data.roleId,
			details: {
				before: {
					name: role.name,
					description: role.description,
					capabilities: role.capabilities,
				},
				after: {
					name: data.name ?? role.name,
					description: data.description ?? role.description,
					capabilities: data.capabilities ?? role.capabilities,
				},
			},
		});

		return { success: true };
	});

export const deleteRole = createServerFn({ method: 'POST' })
	.validator(v.object({ roleId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		const { currentUser } = await requireAdmin();

		const role = await db.query.roles.findFirst({
			where: eq(roles.id, data.roleId),
		});

		if (!role) {
			throw new Error('Role not found');
		}

		// Delete all role assignments for this role (cascade will handle this, but explicit for clarity)
		await db.delete(roleAssignments).where(eq(roleAssignments.roleId, data.roleId));

		// Delete the role
		await db.delete(roles).where(eq(roles.id, data.roleId));

		// Record audit log
		await recordAuditLog({
			actorId: currentUser.userId,
			action: 'role.delete',
			targetType: 'role',
			targetId: data.roleId,
			details: {
				name: role.name,
				description: role.description,
				capabilities: role.capabilities,
			},
		});

		return { success: true };
	});

export const getUserRoles = createServerFn({ method: 'POST' })
	.validator(v.object({ userId: v.optional(v.pipe(v.string(), v.uuid())) }))
	.handler(async ({ data }) => {
		await requireAdmin();

		// Return empty array if userId is not provided
		if (!data.userId) {
			return [];
		}

		// Validate that user exists
		const user = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
		});

		if (!user) {
			return [];
		}

		const userRoleAssignments = await db.query.roleAssignments.findMany({
			where: eq(roleAssignments.userId, data.userId),
		});

		const userRoles = await Promise.all(
			userRoleAssignments.map((ra) =>
				db.query.roles.findFirst({
					where: eq(roles.id, ra.roleId),
				}),
			),
		);

		const validRoles = userRoles.filter((role): role is NonNullable<typeof role> => role !== null);

		return validRoles.map((role) => ({
			_id: role.id,
			name: role.name,
			description: role.description,
			capabilities: role.capabilities,
			createdAt: role.createdAt.getTime(),
			updatedAt: role.updatedAt.getTime(),
		}));
	});

export const assignRolesToUser = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			userId: v.pipe(v.string(), v.uuid()),
			roleIds: v.array(v.pipe(v.string(), v.uuid())),
		}),
	)
	.handler(async ({ data }) => {
		const { currentUser } = await requireAdmin();

		// Validate that user exists
		const user = await db.query.users.findFirst({
			where: eq(users.id, data.userId),
		});

		if (!user) {
			throw new Error('User not found');
		}

		// Validate that all roles exist
		const existingRoles = await db.query.roles.findMany({
			where: inArray(roles.id, data.roleIds),
		});

		if (existingRoles.length !== data.roleIds.length) {
			throw new Error('One or more roles not found');
		}

		// Get existing role assignments
		const existingAssignments = await db.query.roleAssignments.findMany({
			where: eq(roleAssignments.userId, data.userId),
		});

		const existingRoleIds = new Set(existingAssignments.map((ra) => ra.roleId));
		const newRoleIds = new Set(data.roleIds);

		// Delete assignments that are no longer needed
		const toDelete = existingAssignments.filter((ra) => !newRoleIds.has(ra.roleId));
		if (toDelete.length > 0) {
			await db.delete(roleAssignments).where(
				inArray(
					roleAssignments.id,
					toDelete.map((ra) => ra.id),
				),
			);

			// Record audit logs for removed assignments
			await Promise.all(
				toDelete.map((ra) =>
					recordAuditLog({
						actorId: currentUser.userId,
						action: 'role.assignment.delete',
						targetType: 'user',
						targetId: data.userId,
						details: { roleId: ra.roleId },
					}),
				),
			);
		}

		// Create new assignments
		const toCreate = data.roleIds.filter((roleId) => !existingRoleIds.has(roleId));
		if (toCreate.length > 0) {
			await db.insert(roleAssignments).values(
				toCreate.map((roleId) => ({
					userId: data.userId,
					roleId,
				})),
			);

			// Record audit logs for new assignments
			await Promise.all(
				toCreate.map((roleId) =>
					recordAuditLog({
						actorId: currentUser.userId,
						action: 'role.assignment.create',
						targetType: 'user',
						targetId: data.userId,
						details: { roleId },
					}),
				),
			);
		}

		return { success: true };
	});

export const getUserEffectiveCapabilities = createServerFn({ method: 'POST' })
	.validator(v.object({ userId: v.optional(v.pipe(v.string(), v.uuid())) }))
	.handler(async ({ data }) => {
		await requireAdmin();

		if (!data.userId) {
			return [];
		}

		return await getEffectiveCapabilities(data.userId);
	});

export const getBulkUserRoles = createServerFn({ method: 'POST' })
	.validator(v.object({ userIds: v.array(v.pipe(v.string(), v.uuid())) }))
	.handler(async ({ data }) => {
		await requireAdmin();

		const assignments = await db.query.roleAssignments.findMany({
			where: inArray(roleAssignments.userId, data.userIds),
		});

		const roleIds = Array.from(new Set(assignments.map((a) => a.roleId)));
		const rolesMap = new Map(
			(
				await db.query.roles.findMany({
					where: inArray(roles.id, roleIds),
				})
			).map((role) => [role.id, role]),
		);

		// Group by user
		type RoleRow = NonNullable<Awaited<ReturnType<typeof db.query.roles.findFirst>>>;
		const result: Record<string, RoleRow[]> = {};
		for (const userId of data.userIds) {
			result[userId] = [];
		}

		for (const assignment of assignments) {
			const role = rolesMap.get(assignment.roleId);
			if (role) {
				result[assignment.userId].push(role);
			}
		}

		// Transform to match expected format
		const transformed: Record<
			string,
			Array<{
				_id: string;
				name: string;
				description: string | null;
				capabilities: Capability[];
				createdAt: number;
				updatedAt: number;
			}>
		> = {};
		for (const [userId, userRoles] of Object.entries(result)) {
			transformed[userId] = userRoles.map((role) => ({
				_id: role.id,
				name: role.name,
				description: role.description,
				capabilities: role.capabilities,
				createdAt: role.createdAt.getTime(),
				updatedAt: role.updatedAt.getTime(),
			}));
		}

		return transformed;
	});

export const getBulkEffectiveCapabilities = createServerFn({ method: 'POST' })
	.validator(v.object({ userIds: v.array(v.pipe(v.string(), v.uuid())) }))
	.handler(async ({ data }) => {
		await requireAdmin();

		const result: Record<string, Capability[]> = {};

		await Promise.all(
			data.userIds.map(async (userId) => {
				result[userId] = await getEffectiveCapabilities(userId);
			}),
		);

		return result;
	});

export const getUsersWithRole = createServerFn({ method: 'POST' })
	.validator(v.object({ roleId: v.pipe(v.string(), v.uuid()) }))
	.handler(async ({ data }) => {
		await requireAdmin();

		const assignments = await db.query.roleAssignments.findMany({
			where: eq(roleAssignments.roleId, data.roleId),
		});

		const userIds = assignments.map((a) => a.userId);
		const usersWithRole = await db.query.users.findMany({
			where: inArray(users.id, userIds),
		});

		return usersWithRole.map((user) => ({
			_id: user.id,
			userId: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			displayUsername: user.displayUsername,
			capabilities: user.capabilities,
			adsDisabled: user.adsDisabled,
			interestedInHidingAds: user.interestedInHidingAds,
			createdAt: user.createdAt.getTime(),
			updatedAt: user.updatedAt.getTime(),
		}));
	});

export const removeUsersFromRole = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			roleId: v.pipe(v.string(), v.uuid()),
			userIds: v.array(v.pipe(v.string(), v.uuid())),
		}),
	)
	.handler(async ({ data }) => {
		const { currentUser } = await requireAdmin();

		// Validate that role exists
		const role = await db.query.roles.findFirst({
			where: eq(roles.id, data.roleId),
		});

		if (!role) {
			throw new Error('Role not found');
		}

		// Delete role assignments
		await db
			.delete(roleAssignments)
			.where(
				and(eq(roleAssignments.roleId, data.roleId), inArray(roleAssignments.userId, data.userIds)),
			);

		// Record audit logs for each user
		await Promise.all(
			data.userIds.map((userId) =>
				recordAuditLog({
					actorId: currentUser.userId,
					action: 'role.assignment.delete',
					targetType: 'user',
					targetId: userId,
					details: { roleId: data.roleId, roleName: role.name },
				}),
			),
		);

		return { success: true };
	});

export const bulkAssignRolesToUsers = createServerFn({ method: 'POST' })
	.validator(
		v.object({
			userIds: v.array(v.pipe(v.string(), v.uuid())),
			roleIds: v.array(v.pipe(v.string(), v.uuid())),
		}),
	)
	.handler(async ({ data }) => {
		const { currentUser } = await requireAdmin();

		// Validate that all users exist
		const existingUsers = await db.query.users.findMany({
			where: inArray(users.id, data.userIds),
		});

		if (existingUsers.length !== data.userIds.length) {
			throw new Error('One or more users not found');
		}

		// Validate that all roles exist
		const existingRoles = await db.query.roles.findMany({
			where: inArray(roles.id, data.roleIds),
		});

		if (existingRoles.length !== data.roleIds.length) {
			throw new Error('One or more roles not found');
		}

		// Get existing assignments to avoid duplicates
		const existingAssignments = await db.query.roleAssignments.findMany({
			where: inArray(roleAssignments.userId, data.userIds),
		});

		const existingSet = new Set(existingAssignments.map((a) => `${a.userId}:${a.roleId}`));

		// Create new assignments (skip duplicates)
		const toCreate: Array<{ userId: string; roleId: string }> = [];
		for (const userId of data.userIds) {
			for (const roleId of data.roleIds) {
				const key = `${userId}:${roleId}`;
				if (!existingSet.has(key)) {
					toCreate.push({ userId, roleId });
				}
			}
		}

		if (toCreate.length > 0) {
			await db.insert(roleAssignments).values(toCreate);

			// Record audit logs for new assignments
			await Promise.all(
				toCreate.map((assignment) =>
					recordAuditLog({
						actorId: currentUser.userId,
						action: 'role.assignment.create',
						targetType: 'user',
						targetId: assignment.userId,
						details: {
							roleId: assignment.roleId,
							bulkOperation: true,
						},
					}),
				),
			);
		}

		return { success: true, assigned: toCreate.length };
	});

export const sendTestModeratorEmail = createServerFn({ method: 'POST' })
	.validator(v.object({ capability: capabilityPicklist }))
	.handler(async ({ data }) => {
		await requireAdmin();
		return sendTestEmail(data.capability);
	});
