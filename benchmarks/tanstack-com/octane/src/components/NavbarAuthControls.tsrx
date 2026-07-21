import { Suspense, lazy } from 'octane';
import { User } from '@octanejs/lucide';
import { Link, useNavigate } from '@octanejs/tanstack-router';
import { twMerge } from 'tailwind-merge';
import { Authenticated, AuthLoading, Unauthenticated } from '~/components/AuthComponents.tsrx';
import { authClient } from '~/auth/client';
import { ADMIN_ACCESS_CAPABILITIES } from '~/db/types';
import { useToast } from '~/components/ToastProvider.tsrx';
import { useCapabilities } from '~/hooks/useCapabilities';
import { useCurrentUser } from '~/hooks/useCurrentUser';

const LazyAuthenticatedUserMenu = lazy(
	() => import('~/components/AuthenticatedUserMenu.tsrx').then(
		(m) => ({
			default: m.AuthenticatedUserMenu,
		}),
	),
);
const adminCapabilities = new Set<string>(ADMIN_ACCESS_CAPABILITIES);

type NavbarAuthControlsProps = {
	className?: string;
};

export function NavbarAuthControls({ className }: NavbarAuthControlsProps) {
	const capabilities = useCapabilities();
	const user = useCurrentUser();
	const navigate = useNavigate();
	const { notify } = useToast();

	const canAdmin = capabilities.some((cap) => adminCapabilities.has(cap));

	const canApiKeys = !!user;

	const loginButton = <Link
		to="/login"
		aria-label="Log In"
		className={twMerge(
			'flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 whitespace-nowrap',
			'bg-black dark:bg-white text-white dark:text-black',
			'hover:bg-gray-800 dark:hover:bg-gray-200',
			'transition-colors duration-200 text-xs font-medium',
			className,
		)}
	>
		<User className="w-3.5 h-3.5" />
		<span class="hidden min-[430px]:inline">Log In</span>
	</Link>;

	const signOut = async () => {
		await authClient.signOut();
		navigate({ to: '/login' });
		notify(
			<div>
				<div class="font-medium">Signed out</div>
				<div class="text-gray-500 dark:text-gray-400 text-xs">You have been logged out</div>
			</div>,
		);
	};

	return <>
		<AuthLoading>{loginButton}</AuthLoading>
		<Unauthenticated>{loginButton}</Unauthenticated>
		<Authenticated>
			<Suspense fallback={loginButton}>
				<LazyAuthenticatedUserMenu
					user={user ?? null}
					canAdmin={canAdmin}
					canApiKeys={canApiKeys}
					onSignOut={signOut}
				/>
			</Suspense>
		</Authenticated>
	</>;
}
