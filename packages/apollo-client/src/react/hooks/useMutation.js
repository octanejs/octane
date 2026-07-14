import { equal } from '@wry/equality';
import * as React from 'octane';
import { mergeOptions, preventUnhandledRejection } from '@apollo/client/utilities/internal';
import { useIsomorphicLayoutEffect } from './internal/useIsomorphicLayoutEffect.js';
import { isCompilerSite } from './internal/site.js';
import { useApolloClient } from './useApolloClient.js';
/**
 *
 */
export const useMutation = function useMutation(mutation, options) {
	if (isCompilerSite(options)) options = undefined;
	const client = useApolloClient(options?.client);
	const [result, setResult] = React.useState(() => createInitialResult(client));
	const ref = React.useRef({
		result,
		mutationId: 0,
		isMounted: true,
		client,
		mutation,
		options,
	});
	useIsomorphicLayoutEffect(() => {
		Object.assign(ref.current, { client, options, mutation });
	}, null);
	const execute = React.useCallback((executeOptions = {}) => {
		const { options, mutation } = ref.current;
		const baseOptions = { ...options, mutation };
		const client = executeOptions.client || ref.current.client;
		const context =
			typeof executeOptions.context === 'function'
				? executeOptions.context(options?.context)
				: executeOptions.context;
		if (!ref.current.result.loading && ref.current.isMounted) {
			setResult(
				(ref.current.result = {
					loading: true,
					error: undefined,
					data: undefined,
					called: true,
					client,
				}),
			);
		}
		const mutationId = ++ref.current.mutationId;
		const clientOptions = mergeOptions(baseOptions, {
			...executeOptions,
			context,
		});
		return preventUnhandledRejection(
			client.mutate(clientOptions).then(
				(response) => {
					const { data, error } = response;
					const onError = executeOptions.onError || ref.current.options?.onError;
					if (error && onError) {
						onError(error, clientOptions);
					}
					if (mutationId === ref.current.mutationId) {
						const result = {
							called: true,
							loading: false,
							data,
							error,
							client,
						};
						if (ref.current.isMounted && !equal(ref.current.result, result)) {
							setResult((ref.current.result = result));
						}
					}
					const onCompleted = executeOptions.onCompleted || ref.current.options?.onCompleted;
					if (!error) {
						onCompleted?.(response.data, clientOptions);
					}
					return response;
				},
				(error) => {
					if (mutationId === ref.current.mutationId && ref.current.isMounted) {
						const result = {
							loading: false,
							error,
							data: void 0,
							called: true,
							client,
						};
						if (!equal(ref.current.result, result)) {
							setResult((ref.current.result = result));
						}
					}
					const onError = executeOptions.onError || ref.current.options?.onError;
					if (onError) {
						onError(error, clientOptions);
					}
					throw error;
				},
			),
		);
	}, []);
	const reset = React.useCallback(() => {
		if (ref.current.isMounted) {
			const result = createInitialResult(ref.current.client);
			Object.assign(ref.current, { mutationId: 0, result });
			setResult(result);
		}
	}, []);
	React.useEffect(() => {
		const current = ref.current;
		current.isMounted = true;
		return () => {
			current.isMounted = false;
		};
	}, []);
	return [execute, { reset, ...result }];
};
function createInitialResult(client) {
	return {
		data: undefined,
		error: undefined,
		called: false,
		loading: false,
		client,
	};
}
