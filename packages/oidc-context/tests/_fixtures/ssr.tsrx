import { AuthProvider } from '../../src/AuthProvider';
import { useAuth } from '../../src/useAuth';

function AuthProbe() @{
	const auth = useAuth();
	<div>
		<span id="loading">{String(auth.isLoading)}</span>
		<span id="authenticated">{String(auth.isAuthenticated)}</span>
		<span id="user">
			{auth.user == null ? 'none' : 'present'}
		</span>
	</div>
}

export function ServerAuth() @{
	<AuthProvider authority="authority" client_id="client" redirect_uri="redirect">
		<AuthProbe />
	</AuthProvider>
}
