import * as React from 'react';
import { Toaster, toast } from 'sonner';
import { useTheme } from '~/components/ThemeProvider';

type ToastOptions = {
	durationMs?: number;
};

type ToastContextValue = {
	notify: (content: React.ReactNode, options?: ToastOptions) => string;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
	const ctx = React.useContext(ToastContext);
	if (!ctx) {
		throw new Error('useToast must be used within ToastProvider');
	}
	return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
	const { resolvedTheme } = useTheme();

	const notify = React.useCallback((content: React.ReactNode, options?: ToastOptions) => {
		const id = toast(content, { duration: options?.durationMs ?? 2500 });
		return String(id);
	}, []);

	const contextValue = React.useMemo<ToastContextValue>(() => ({ notify }), [notify]);

	return (
		<ToastContext.Provider value={contextValue}>
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
						toast:
							'relative w-96 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-lg outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-50',
						content: 'flex items-start gap-2',
					},
				}}
			/>
		</ToastContext.Provider>
	);
}
