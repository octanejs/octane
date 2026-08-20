import { useContext } from 'octane';

import { AuthContext, type AuthContextProps } from './AuthContext';
import { splitSlot } from './internal';

/**
 * @public
 */
export function useAuth(...rest: [slot?: symbol]): AuthContextProps {
	splitSlot(rest);
	const context = useContext(AuthContext);

	if (!context) {
		console.warn(
			'AuthProvider context is undefined, please verify you are calling useAuth() as child of a <AuthProvider> component.',
		);
	}

	return context as AuthContextProps;
}
