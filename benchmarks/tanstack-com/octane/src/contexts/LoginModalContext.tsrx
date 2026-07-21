import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type Context,
} from 'octane';
import { useQueryClient } from '@octanejs/tanstack-query';
import { LoginModal } from '~/components/LoginModal.tsrx';
import { currentUserQueryOptions } from '~/hooks/useCurrentUser';

interface LoginModalContextValue {
	openLoginModal: (options?: { onSuccess?: () => void }) => void;
	closeLoginModal: () => void;
}

declare module global {
	var __tanstackLoginModalContext: Context<LoginModalContextValue | null> | undefined;
}

const LoginModalContext =
	import.meta.env.DEV && typeof window !== 'undefined'
		? globalThis.__tanstackLoginModalContext ??= createContext<LoginModalContextValue | null>(null)
		: createContext<LoginModalContextValue | null>(null);

export function useLoginModal() {
	const context = useContext(LoginModalContext);
	if (!context) {
		throw new Error('useLoginModal must be used within a LoginModalProvider');
	}
	return context;
}

interface LoginModalProviderProps {
	children?: any;
}

export function LoginModalProvider({ children }: LoginModalProviderProps) {
	const queryClient = useQueryClient();
	const [isOpen, setIsOpen] = useState(false);
	const pendingOnSuccessRef = useRef<(() => void) | undefined>(undefined);

	const openLoginModal = useCallback((options?: { onSuccess?: () => void }) => {
		pendingOnSuccessRef.current = options?.onSuccess;
		setIsOpen(true);
	}, []);

	const closeLoginModal = useCallback(() => {
		setIsOpen(false);
		pendingOnSuccessRef.current = undefined;
	}, []);

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) return;
			if (event.data?.type === 'TANSTACK_AUTH_SUCCESS') {
				queryClient.invalidateQueries(currentUserQueryOptions);
				const onSuccess = pendingOnSuccessRef.current;
				setIsOpen(false);
				pendingOnSuccessRef.current = undefined;
				if (onSuccess) {
					setTimeout(onSuccess, 0);
				}
			}
		};
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [queryClient]);

	const value = useMemo(() => ({ openLoginModal, closeLoginModal }), [
		openLoginModal,
		closeLoginModal,
	]);

	return <LoginModalContext.Provider value={value}>
		{children}
		<LoginModal open={isOpen} onOpenChange={setIsOpen} />
	</LoginModalContext.Provider>;
}
