import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LogIn, Mail } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { useToast } from '~/components/ToastProvider';
import { useLoginModal } from '~/contexts/LoginModalContext';
import { currentUserQueryOptions, useCurrentUser } from '~/hooks/useCurrentUser';
import { Button } from '~/ui';
import { addUserSignupSource } from '~/utils/users.functions';

type NewsletterSignupProps = {
	className?: string;
	buttonClassName?: string;
	noteClassName?: string;
	successClassName?: string;
	showNote?: boolean;
};

export function NewsletterSignup({
	className,
	buttonClassName,
	noteClassName,
	successClassName,
	showNote = true,
}: NewsletterSignupProps) {
	const user = useCurrentUser();
	const queryClient = useQueryClient();
	const { notify } = useToast();
	const { openLoginModal } = useLoginModal();
	const isSubscribed = user?.signupSources.includes('newsletter') ?? false;

	const { mutate, isPending } = useMutation({
		mutationFn: () => addUserSignupSource({ data: { source: 'newsletter' } }),
		onSuccess: async (result) => {
			await queryClient.invalidateQueries(currentUserQueryOptions);

			notify(
				<div>
					<div className="font-medium">
						{result.alreadyTagged ? 'Already subscribed' : "You're subscribed"}
					</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						We'll use your TanStack login email.
					</div>
				</div>,
			);
		},
		onError: () => {
			notify(
				<div>
					<div className="font-medium">Subscription failed</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Please try again in a moment
					</div>
				</div>,
			);
		},
	});

	const handleSubscribe = React.useCallback(() => {
		if (isPending || isSubscribed) {
			return;
		}

		if (!user) {
			openLoginModal({
				onSuccess: () => mutate(),
			});
			return;
		}

		mutate();
	}, [isPending, isSubscribed, mutate, openLoginModal, user]);

	if (isSubscribed) {
		return (
			<p
				className={twMerge(
					'inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400',
					successClassName,
				)}
			>
				<Check className="h-3.5 w-3.5" />
				You're subscribed
			</p>
		);
	}

	return (
		<div className={twMerge('grid gap-2', className)}>
			<Button
				type="button"
				onClick={handleSubscribe}
				disabled={isPending}
				className={twMerge('w-full', buttonClassName)}
			>
				{user ? <Mail className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
				{isPending ? 'Subscribing...' : user ? 'Subscribe with my login' : 'Log in to subscribe'}
			</Button>
			{showNote ? (
				<p className={twMerge('text-xs text-gray-500 dark:text-gray-400', noteClassName)}>
					We'll use your TanStack login email.
				</p>
			) : null}
		</div>
	);
}
