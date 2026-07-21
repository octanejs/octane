import { createContext, useCallback, useContext, useMemo } from 'octane';
import { Toaster, toast } from '@octanejs/sonner';
import { useTheme } from '~/components/ThemeProvider.tsrx';

type ToastOptions = {
	durationMs?: number;
};

type ToastContextValue = {
	notify: (content: any, options?: ToastOptions) => string;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) {
		throw new Error('useToast must be used within ToastProvider');
	}
	return ctx;
}

export function ToastProvider({ children }: { children?: any }) {
	const { resolvedTheme } = useTheme();

	const notify = useCallback((content: any, options?: ToastOptions) => {
		const id = toast(content, { duration: options?.durationMs ?? 2500 });
		return String(id);
	}, []);

	const contextValue = useMemo<ToastContextValue>(() => ({ notify }), [notify]);

	return <ToastContext.Provider value={contextValue}>
		{children}
		<Toaster
			theme={resolvedTheme}
			position="bottom-right"
			swipeDirections={['right']}
			offset={16}
			gap={8}
			toastOptions={{
				unstyled: true,
				classNames: {
					toast: 'relative w-96 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-lg outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-50',
					content: 'flex items-start gap-2',
				},
			}}
		/>
	</ToastContext.Provider>;
}
