import { atom } from 'nanostores';
import { createAuthClient } from '@octanejs/better-auth';
import { useState } from 'octane';

const activeOrganization = atom('alpha');

function sessionResponse() {
	return new Response(JSON.stringify({
		user: {
			id: 'user-1',
			name: 'Ada',
			email: 'ada@example.com',
			emailVerified: true,
		},
		session: {
			id: 'session-1',
			userId: 'user-1',
			token: 'secret',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z',
			expiresAt: '2027-01-01T00:00:00.000Z',
		},
	}), { headers: { 'content-type': 'application/json' } });
}

const client = createAuthClient({
	baseURL: 'http://localhost/api/auth',
	fetchOptions: { customFetchImpl: async () => sessionResponse() },
	plugins: [
		{
			id: 'differential-plugin',
			getAtoms: () => ({ activeOrganization }),
			getActions: () => ({
				advanceOrganization: () => activeOrganization.set('beta'),
				useWidget: () => 'action-result',
			}),
		},
	],
});

export function AuthSurface() @{
	const session = client.useSession();
	const organization = client.useActiveOrganization();
	const [actionResult, setActionResult] = useState('idle');

	<div>
		<p id="session">
			{session.isPending ? 'pending' : session.data?.user.name ?? 'signed-out'}
		</p>
		<p id="organization">{organization}</p>
		<p id="action-result">{actionResult}</p>
		<button id="advance" onClick={() => client.advanceOrganization()}>advance</button>
		<button id="action" onClick={() => setActionResult(client.useWidget())}>action</button>
	</div>
}
