import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useMachine } from '@xstate/react';
import {
	progressionMachine,
	getPhaseFromState,
	getBattlePhase,
	BADGE_INFO,
	type BadgeTier,
} from './progressionMachine';
import { useGameStore } from '../hooks/useGameStore';

interface ProgressionContextValue {
	// Machine state
	phase: 'intro' | 'playing' | 'upgrading' | 'gameover' | 'victory';
	battlePhase: 'partners' | 'showcase' | 'corners' | null;

	// Badge info
	highestBadge: BadgeTier;
	newBadgeEarned: BadgeTier | null;
	badgeInfo: typeof BADGE_INFO;

	// Progress counts
	progress: {
		libraries: { discovered: number; total: number };
		partners: { discovered: number; total: number };
		showcases: { discovered: number; total: number };
		corners: { discovered: number; total: number };
	};

	// Actions
	startGame: () => void;
	completeUpgrade: () => void;
	shipDestroyed: () => void;
	respawn: () => void;
	dismissVictory: () => void;
	dismissBadge: () => void;
	reset: () => void;

	// Discovery actions (called by zustand sync)
	discoverLibrary: () => void;
	discoverPartner: () => void;
	discoverShowcase: () => void;
	discoverCorner: () => void;
}

const ProgressionContext = createContext<ProgressionContextValue | null>(null);

export function GameMachineProvider({ children }: { children: ReactNode }) {
	const [state, send] = useMachine(progressionMachine);

	// Get island counts from zustand
	const islands = useGameStore((s) => s.islands);
	const expandedIslands = useGameStore((s) => s.expandedIslands);
	const showcaseIslands = useGameStore((s) => s.showcaseIslands);
	const cornerIslands = useGameStore((s) => s.cornerIslands);

	// Sync island totals when they change
	useEffect(() => {
		const libraryCount = islands.length;
		const partnerCount = expandedIslands.filter((i) => i.type === 'partner').length;
		const showcaseCount = showcaseIslands.length;
		const cornerCount = cornerIslands.length;

		if (libraryCount > 0 || partnerCount > 0 || showcaseCount > 0 || cornerCount > 0) {
			send({
				type: 'SET_TOTALS',
				libraries: libraryCount,
				partners: partnerCount,
				showcases: showcaseCount,
				corners: cornerCount,
			});
		}
	}, [islands.length, expandedIslands, showcaseIslands.length, cornerIslands.length, send]);

	// Sync with zustand phase changes (for backward compatibility)
	const zustandPhase = useGameStore((s) => s.phase);
	const zustandStage = useGameStore((s) => s.stage);
	const zustandShowcaseUnlocked = useGameStore((s) => s.showcaseUnlocked);
	const zustandCornersUnlocked = useGameStore((s) => s.cornersUnlocked);
	const zustandGameWon = useGameStore((s) => s.gameWon);
	const discoveredIslands = useGameStore((s) => s.discoveredIslands);

	// Restore progress from zustand on mount
	useEffect(() => {
		// Count discovered by type
		let librariesDiscovered = 0;
		let partnersDiscovered = 0;
		let showcasesDiscovered = 0;
		let cornersDiscovered = 0;

		for (const id of discoveredIslands) {
			if (id.startsWith('library-')) librariesDiscovered++;
			else if (id.startsWith('partner-')) partnersDiscovered++;
			else if (id.startsWith('showcase-')) showcasesDiscovered++;
			else if (id.startsWith('corner-')) cornersDiscovered++;
		}

		// Determine highest badge from zustand state
		let highestBadge: BadgeTier = 'none';
		if (zustandGameWon) highestBadge = 'conqueror';
		else if (zustandCornersUnlocked) highestBadge = 'champion';
		else if (zustandShowcaseUnlocked) highestBadge = 'adventurer';
		else if (zustandStage === 'battle') highestBadge = 'explorer';

		// Only restore if we have progress
		if (highestBadge !== 'none' || librariesDiscovered > 0) {
			send({
				type: 'RESTORE_PROGRESS',
				librariesDiscovered,
				partnersDiscovered,
				showcasesDiscovered,
				cornersDiscovered,
				highestBadge,
			});
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Only on mount

	// Sync zustand phase changes to machine (when zustand is source of truth)
	useEffect(() => {
		const machinePhase = getPhaseFromState(state.value);

		// Sync gameover state
		if (zustandPhase === 'gameover' && machinePhase !== 'gameover') {
			send({ type: 'SHIP_DESTROYED' });
		}
	}, [zustandPhase, state.value, send]);

	const phase = getPhaseFromState(state.value);
	const battlePhase = getBattlePhase(state.value);

	const value: ProgressionContextValue = {
		phase,
		battlePhase,
		highestBadge: state.context.highestBadge,
		newBadgeEarned: state.context.newBadgeEarned,
		badgeInfo: BADGE_INFO,
		progress: {
			libraries: {
				discovered: state.context.librariesDiscovered,
				total: state.context.librariesTotal,
			},
			partners: {
				discovered: state.context.partnersDiscovered,
				total: state.context.partnersTotal,
			},
			showcases: {
				discovered: state.context.showcasesDiscovered,
				total: state.context.showcasesTotal,
			},
			corners: {
				discovered: state.context.cornersDiscovered,
				total: state.context.cornersTotal,
			},
		},
		startGame: () => send({ type: 'START_GAME' }),
		completeUpgrade: () => send({ type: 'UPGRADE_COMPLETE' }),
		shipDestroyed: () => send({ type: 'SHIP_DESTROYED' }),
		respawn: () => send({ type: 'RESPAWN' }),
		dismissVictory: () => send({ type: 'DISMISS_VICTORY' }),
		dismissBadge: () => send({ type: 'DISMISS_BADGE' }),
		reset: () => send({ type: 'RESET' }),
		discoverLibrary: () => send({ type: 'DISCOVER_LIBRARY' }),
		discoverPartner: () => send({ type: 'DISCOVER_PARTNER' }),
		discoverShowcase: () => send({ type: 'DISCOVER_SHOWCASE' }),
		discoverCorner: () => send({ type: 'DISCOVER_CORNER' }),
	};

	return <ProgressionContext.Provider value={value}>{children}</ProgressionContext.Provider>;
}

export function useProgression() {
	const context = useContext(ProgressionContext);
	if (!context) {
		throw new Error('useProgression must be used within GameMachineProvider');
	}
	return context;
}

export { BADGE_INFO, type BadgeTier };
