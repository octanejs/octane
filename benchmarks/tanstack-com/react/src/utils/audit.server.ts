import { db } from '~/db/client';
import { loginHistory, auditLogs, type AuditAction, type OAuthProvider } from '~/db/schema';
import { getClientIp } from './request.server';

// Re-export for backwards compatibility
export { getClientIp };

// Record a login event
export async function recordLogin(opts: {
	userId: string;
	provider: OAuthProvider;
	isNewUser: boolean;
	request: Request;
}): Promise<void> {
	const { userId, provider, isNewUser, request } = opts;

	await db.insert(loginHistory).values({
		userId,
		provider,
		isNewUser,
		ipAddress: getClientIp(request),
		userAgent: request.headers.get('user-agent') || undefined,
	});
}

// Record an audit log entry
export async function recordAuditLog(opts: {
	actorId: string;
	action: AuditAction;
	targetType: 'user' | 'role' | 'banner' | 'feed_entry' | 'feedback';
	targetId: string;
	details?: Record<string, unknown>;
	request?: Request;
}): Promise<void> {
	const { actorId, action, targetType, targetId, details, request } = opts;

	await db.insert(auditLogs).values({
		actorId,
		action,
		targetType,
		targetId,
		details: details ?? null,
		ipAddress: request ? getClientIp(request) : undefined,
		userAgent: request?.headers.get('user-agent') || undefined,
	});
}
