// Helper function to validate admin capability
// Imports .server modules to avoid client bundle
export async function requireAdmin() {
	const { getAuthenticatedUser } = await import('./auth.server-helpers');
	const { getEffectiveCapabilities } = await import('./capabilities.server');

	const user = await getAuthenticatedUser();
	const effectiveCapabilities = await getEffectiveCapabilities(user.userId);

	if (!effectiveCapabilities.includes('admin')) {
		throw new Error('admin capability required');
	}

	return { currentUser: user };
}
