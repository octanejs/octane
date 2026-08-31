# @octanejs/oidc-context

Octane binding for [`react-oidc-context@3.3.1`](https://github.com/authts/react-oidc-context). Pair it with the `oidc-client-ts` peer (`^3.1.0`).

## Installation

```sh
npm install @octanejs/oidc-context oidc-client-ts
pnpm add @octanejs/oidc-context oidc-client-ts
```

```ts
import { createElement } from 'octane';
import { AuthProvider, useAuth } from '@octanejs/oidc-context';

function Profile() {
	const auth = useAuth();
	return auth.isAuthenticated ? auth.user?.profile?.sub ?? '' : 'signed out';
}

export function App() {
	return createElement(
		AuthProvider,
		{
			authority: 'https://issuer.example',
			client_id: 'app',
			redirect_uri: 'https://app.example/callback',
		},
		createElement(Profile),
	);
}
```

`withAuth` and `withAuthenticationRequired` stay higher-order functions and render through `createElement`. See `UPSTREAM.md` for the pin and export crosswalk.
