import { isRedirect, useRouter } from '@octanejs/tanstack-router';

export function useServerFn(serverFn) {
	const router = useRouter();
	return async (...args) => {
		try {
			const response = await serverFn(...args);
			if (isRedirect(response)) throw response;
			return response;
		} catch (error) {
			if (isRedirect(error)) {
				error.options._fromLocation = router.stores.location.get();
				return router.navigate(router.resolveRedirect(error).options);
			}
			throw error;
		}
	};
}
