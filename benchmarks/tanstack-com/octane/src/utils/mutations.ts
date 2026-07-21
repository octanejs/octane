import { useMutation, useQueryClient } from '@octanejs/tanstack-query';
import {
	updateUserCapabilities,
	adminSetAdsDisabled,
	bulkUpdateUserCapabilities,
} from './users.functions';
import {
	createRole,
	updateRole,
	deleteRole,
	assignRolesToUser,
	bulkAssignRolesToUsers,
	removeUsersFromRole,
} from './roles.functions';
import type { Capability } from '~/db/types';

// User mutations
export function useUpdateUserCapabilities() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { userId: string; capabilities: Capability[] }) =>
			updateUserCapabilities({
				data: data as Parameters<typeof updateUserCapabilities>[0]['data'],
			}),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});
}

export function useAdminSetAdsDisabled() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { userId: string; adsDisabled: boolean }) => adminSetAdsDisabled({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});
}

export function useBulkUpdateUserCapabilities() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { userIds: string[]; capabilities: Capability[] }) =>
			bulkUpdateUserCapabilities({
				data: data as Parameters<typeof bulkUpdateUserCapabilities>[0]['data'],
			}),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});
}

// Role mutations
export function useCreateRole() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { name: string; description?: string; capabilities: Capability[] }) =>
			createRole({
				data: data as Parameters<typeof createRole>[0]['data'],
			}),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});
}

export function useUpdateRole() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: {
			roleId: string;
			name?: string;
			description?: string;
			capabilities?: Capability[];
		}) =>
			updateRole({
				data: data as Parameters<typeof updateRole>[0]['data'],
			}),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});
}

export function useDeleteRole() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { roleId: string }) => deleteRole({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});
}

export function useAssignRolesToUser() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { userId: string; roleIds: string[] }) => assignRolesToUser({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});
}

export function useBulkAssignRolesToUsers() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { userIds: string[]; roleIds: string[] }) =>
			bulkAssignRolesToUsers({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});
}

export function useRemoveUsersFromRole() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { roleId: string; userIds: string[] }) => removeUsersFromRole({ data }),
		onSuccess: () => {
			queryClient.invalidateQueries();
		},
	});
}
