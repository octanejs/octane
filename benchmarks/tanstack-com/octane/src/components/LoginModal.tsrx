import { useEffect } from 'octane';
import { Dialog as DialogPrimitive } from '@octanejs/radix';
import { X } from '@octanejs/lucide';
import { GithubIcon } from '~/components/icons/GithubIcon.tsrx';
import { GoogleIcon } from '~/components/icons/GoogleIcon.tsrx';
import { authClient } from '~/auth/client';

interface LoginModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
	useEffect(() => {
		if (!open) {
			return;
		}

		function handleMessage(event: MessageEvent) {
			if (
				event.origin === window.location.origin && event.data && typeof event.data === 'object' &&
					'type' in event.data &&
					event.data.type === 'TANSTACK_AUTH_SUCCESS'
			) {
				onOpenChange(false);
				window.location.reload();
			}
		}

		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [open, onOpenChange]);

	const openSocialPopup = (provider: 'github' | 'google') => {
		const popup = authClient.signIn.socialPopup({ provider });

		if (!popup) {
			authClient.signIn.social({ provider });
		}
	};

	return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
		<DialogPrimitive.Portal>
			<DialogPrimitive.Overlay className="fixed inset-0 z-[999] bg-black/60 backdrop-blur-sm" />
			<DialogPrimitive.Content
				className="fixed left-1/2 top-1/2 z-[1000] w-full max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white dark:bg-gray-900 p-6 shadow-xl"
			>
				<div class="flex items-center justify-between mb-4">
					<DialogPrimitive.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
						Sign in to continue
					</DialogPrimitive.Title>
					<DialogPrimitive.Close
						className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-gray-800"
					>
						<X className="w-5 h-5 text-gray-500" />
					</DialogPrimitive.Close>
				</div>

				<div class="space-y-3">
					<button
						type="button"
						onClick={() => openSocialPopup('github')}
						class="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 font-medium py-2.5 px-4 rounded-lg transition-colors"
					>
						<GithubIcon className="w-5 h-5" />
						Continue with GitHub
					</button>
					<button
						type="button"
						onClick={() => openSocialPopup('google')}
						class="w-full flex items-center justify-center gap-2 bg-[#DB4437] hover:bg-[#c53929] text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
					>
						<GoogleIcon className="w-5 h-5" />
						Continue with Google
					</button>
				</div>
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	</DialogPrimitive.Root>;
}
