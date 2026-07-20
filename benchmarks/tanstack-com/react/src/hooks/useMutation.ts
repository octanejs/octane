import { isRedirect, useRouter } from '@tanstack/react-router';
import * as React from 'react';

type BaseMutationProps<TVariables, TData, TError> = {
	fn: (variables: TVariables) => Promise<TData>;
	onSuccess?: (ctx: { variables: TVariables; data: TData }) => void | Promise<void>;
	onError?: (ctx: { variables: TVariables; error: TError }) => void;
	onSettled?: (ctx: {
		variables: TVariables;
		data: TData | undefined;
		error: TError | undefined;
	}) => void | Promise<void>;
};

export function useBaseMutation<TVariables, TData, TError = Error>(
	opts: BaseMutationProps<TVariables, TData, TError>,
) {
	const [submittedAt, setSubmittedAt] = React.useState<number | undefined>();
	const [variables, setVariables] = React.useState<TVariables | undefined>();
	const [error, setError] = React.useState<TError | undefined>();
	const [data, setData] = React.useState<TData | undefined>();
	const [status, setStatus] = React.useState<'idle' | 'pending' | 'success' | 'error'>('idle');

	const mutate = React.useCallback(
		(async (variables: TVariables): Promise<TData | undefined> => {
			setStatus('pending');
			setSubmittedAt(Date.now());
			setVariables(variables);
			//
			try {
				const data = await opts.fn(variables);
				await opts.onSuccess?.({ variables, data });
				await opts.onSettled?.({ variables, data, error: undefined });
				setStatus('success');
				setError(undefined);
				setData(data);
				return data;
			} catch (err: any) {
				opts.onError?.({ variables, error: err });
				opts.onSettled?.({ variables, data: undefined, error: err });
				setStatus('error');
				setError(err);
			}
		}) as TVariables extends undefined
			? (variables?: TVariables) => Promise<TData | undefined>
			: (variables: TVariables) => Promise<TData | undefined>,
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[opts.fn],
	);

	const handleSubmit = React.useCallback(
		(e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault();
			mutate(new FormData((e as any).target) as TVariables);
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[mutate, variables],
	);

	return {
		status,
		variables,
		submittedAt,
		mutate,
		error,
		data,
		handleSubmit,
	};
}

export function useMutation<TVariables, TData, TError = Error>(
	opts: BaseMutationProps<TVariables, TData, TError>,
) {
	const router = useRouter();

	return useBaseMutation<TVariables, TData, TError>({
		...opts,
		// Use onSettled to handle potential redirects
		onSettled: async (ctx) => {
			if (isRedirect(ctx.data)) {
				router.navigate({ ...(ctx.data as any) });
			} else if (isRedirect(ctx.error)) {
				router.navigate({ ...(ctx.error as any) });
			}

			router.invalidate();

			await opts.onSettled?.(ctx);
		},
	});
}
