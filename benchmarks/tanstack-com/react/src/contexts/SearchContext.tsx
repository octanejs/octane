import * as React from 'react';

const LazySearchModal = React.lazy(() =>
	import('~/components/SearchModal').then((m) => ({ default: m.SearchModal })),
);

interface SearchContextType {
	isOpen: boolean;
	isAiDockOpen: boolean;
	isAiDockDirty: boolean;
	aiDockAskRequest: {
		id: number;
		question: string;
	} | null;
	newChatRequestId: number;
	openSearch: () => void;
	openAiDock: () => void;
	askAiDock: (question: string) => void;
	clearAiDockAskRequest: (id: number) => void;
	closeSearch: () => void;
	closeAiDock: () => void;
	cancelAiDockHoverClose: () => void;
	scheduleAiDockHoverClose: () => void;
	setAiDockDirty: (isDirty: boolean) => void;
}

const SearchContext = React.createContext<SearchContextType | undefined>(undefined);

export function SearchProvider({ children }: { children: React.ReactNode }) {
	const [isOpen, setIsOpen] = React.useState(false);
	const [isAiDockOpen, setIsAiDockOpen] = React.useState(false);
	const [isAiDockDirty, setIsAiDockDirty] = React.useState(false);
	const [hasLoadedSearch, setHasLoadedSearch] = React.useState(false);
	const [newChatRequestId, setNewChatRequestId] = React.useState(0);
	const [aiDockAskRequest, setAiDockAskRequest] = React.useState<{
		id: number;
		question: string;
	} | null>(null);
	const aiDockCloseTimerRef = React.useRef<number | null>(null);

	const cancelAiDockHoverClose = React.useCallback(() => {
		if (!aiDockCloseTimerRef.current) {
			return;
		}

		window.clearTimeout(aiDockCloseTimerRef.current);
		aiDockCloseTimerRef.current = null;
	}, []);

	const openSearch = React.useCallback(() => {
		setHasLoadedSearch(true);
		setIsOpen(true);
	}, []);

	const openAiDock = React.useCallback(() => {
		cancelAiDockHoverClose();
		setIsOpen(false);
		setIsAiDockOpen(true);
	}, [cancelAiDockHoverClose]);

	const askAiDock = React.useCallback(
		(question: string) => {
			const trimmedQuestion = question.trim();
			if (trimmedQuestion.length < 3) {
				return;
			}

			cancelAiDockHoverClose();
			setIsOpen(false);
			setIsAiDockDirty(true);
			setIsAiDockOpen(true);
			setAiDockAskRequest((current) => ({
				id: (current?.id ?? 0) + 1,
				question: trimmedQuestion,
			}));
		},
		[cancelAiDockHoverClose],
	);

	const clearAiDockAskRequest = React.useCallback((id: number) => {
		setAiDockAskRequest((current) => (current?.id === id ? null : current));
	}, []);

	const closeSearch = React.useCallback(() => {
		setIsOpen(false);
	}, []);

	const closeAiDock = React.useCallback(() => {
		cancelAiDockHoverClose();
		setIsAiDockOpen(false);
	}, [cancelAiDockHoverClose]);

	const scheduleAiDockHoverClose = React.useCallback(() => {
		cancelAiDockHoverClose();
		aiDockCloseTimerRef.current = window.setTimeout(() => {
			setIsAiDockOpen(false);
			aiDockCloseTimerRef.current = null;
		}, 300);
	}, [cancelAiDockHoverClose]);

	React.useEffect(() => {
		return () => {
			cancelAiDockHoverClose();
		};
	}, [cancelAiDockHoverClose]);

	const requestNewChat = React.useCallback(() => {
		setNewChatRequestId((current) => current + 1);
	}, []);

	const value = React.useMemo(
		() => ({
			isOpen,
			isAiDockOpen,
			isAiDockDirty,
			aiDockAskRequest,
			newChatRequestId,
			openSearch,
			openAiDock,
			askAiDock,
			clearAiDockAskRequest,
			closeSearch,
			closeAiDock,
			cancelAiDockHoverClose,
			scheduleAiDockHoverClose,
			setAiDockDirty: setIsAiDockDirty,
		}),
		[
			aiDockAskRequest,
			askAiDock,
			cancelAiDockHoverClose,
			clearAiDockAskRequest,
			closeAiDock,
			closeSearch,
			isAiDockDirty,
			isAiDockOpen,
			isOpen,
			newChatRequestId,
			openAiDock,
			openSearch,
			scheduleAiDockHoverClose,
		],
	);

	React.useEffect(() => {
		const handleDocumentClick = (event: MouseEvent) => {
			if (!(event.target instanceof Element)) return;

			const trigger = event.target.closest('[data-search-trigger]');
			if (!trigger) return;
			if (trigger instanceof HTMLButtonElement && trigger.disabled) return;

			event.preventDefault();
			openSearch();
		};

		document.addEventListener('click', handleDocumentClick);
		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	}, [openSearch]);

	React.useEffect(() => {
		const handleGlobalKeyDown = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			if (event.altKey || event.shiftKey) return;
			// Match both `key` and `code` so the shortcut works on non-QWERTY layouts.
			const isK = event.key.toLowerCase() === 'k' || event.code === 'KeyK';
			if (!isK) return;

			event.preventDefault();
			event.stopPropagation();

			if (isOpen) {
				requestNewChat();
				return;
			}

			openSearch();
		};

		document.addEventListener('keydown', handleGlobalKeyDown, { capture: true });
		return () => {
			document.removeEventListener('keydown', handleGlobalKeyDown, {
				capture: true,
			});
		};
	}, [isOpen, openSearch, requestNewChat]);

	return (
		<SearchContext.Provider value={value}>
			{children}
			{hasLoadedSearch ? (
				<React.Suspense fallback={null}>
					<LazySearchModal />
				</React.Suspense>
			) : null}
		</SearchContext.Provider>
	);
}

export function useSearchContext() {
	const context = React.useContext(SearchContext);
	if (context === undefined) {
		throw new Error('useSearch must be used within a SearchProvider');
	}
	return context;
}
