import {
	Suspense,
	createContext,
	lazy,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

const LazySearchModal = lazy(
	() => import('~/components/SearchModal.tsrx').then((m) => ({ default: m.SearchModal })),
);

interface SearchContextType {
	isOpen: boolean;
	isAiDockOpen: boolean;
	isAiDockDirty: boolean;
	aiDockAskRequest: | {
			id: number;
			question: string;
	  }
	| null;
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

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export function SearchProvider({ children }: { children?: any }) {
	const [isOpen, setIsOpen] = useState(false);
	const [isAiDockOpen, setIsAiDockOpen] = useState(false);
	const [isAiDockDirty, setIsAiDockDirty] = useState(false);
	const [hasLoadedSearch, setHasLoadedSearch] = useState(false);
	const [newChatRequestId, setNewChatRequestId] = useState(0);
	const [aiDockAskRequest, setAiDockAskRequest] = useState<
		| {
				id: number;
				question: string;
		  }
		| null
	>(null);
	const aiDockCloseTimerRef = useRef<number | null>(null);

	const cancelAiDockHoverClose = useCallback(() => {
		if (!aiDockCloseTimerRef.current) {
			return;
		}

		window.clearTimeout(aiDockCloseTimerRef.current);
		aiDockCloseTimerRef.current = null;
	}, []);

	const openSearch = useCallback(() => {
		setHasLoadedSearch(true);
		setIsOpen(true);
	}, []);

	const openAiDock = useCallback(() => {
		cancelAiDockHoverClose();
		setIsOpen(false);
		setIsAiDockOpen(true);
	}, [cancelAiDockHoverClose]);

	const askAiDock = useCallback((question: string) => {
		const trimmedQuestion = question.trim();
		if (trimmedQuestion.length < 3) {
			return;
		}

		cancelAiDockHoverClose();
		setIsOpen(false);
		setIsAiDockDirty(true);
		setIsAiDockOpen(true);
		setAiDockAskRequest(
			(current) => ({
				id: (current?.id ?? 0) + 1,
				question: trimmedQuestion,
			}),
		);
	}, [cancelAiDockHoverClose]);

	const clearAiDockAskRequest = useCallback((id: number) => {
		setAiDockAskRequest((current) => (current?.id === id ? null : current));
	}, []);

	const closeSearch = useCallback(() => {
		setIsOpen(false);
	}, []);

	const closeAiDock = useCallback(() => {
		cancelAiDockHoverClose();
		setIsAiDockOpen(false);
	}, [cancelAiDockHoverClose]);

	const scheduleAiDockHoverClose = useCallback(() => {
		cancelAiDockHoverClose();
		aiDockCloseTimerRef.current = window.setTimeout(() => {
			setIsAiDockOpen(false);
			aiDockCloseTimerRef.current = null;
		}, 300);
	}, [cancelAiDockHoverClose]);

	useEffect(() => {
		return () => {
			cancelAiDockHoverClose();
		};
	}, [cancelAiDockHoverClose]);

	const requestNewChat = useCallback(() => {
		setNewChatRequestId((current) => current + 1);
	}, []);

	const value = useMemo(
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

	useEffect(() => {
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

	useEffect(() => {
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

	return <SearchContext.Provider value={value}>
		{children}
		{hasLoadedSearch
			? <Suspense fallback={null}>
					<LazySearchModal />
				</Suspense>
			: null}
	</SearchContext.Provider>;
}

export function useSearchContext() {
	const context = useContext(SearchContext);
	if (context === undefined) {
		throw new Error('useSearch must be used within a SearchProvider');
	}
	return context;
}
