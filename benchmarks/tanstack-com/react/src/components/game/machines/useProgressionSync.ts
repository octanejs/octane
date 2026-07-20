import { useEffect, useRef } from 'react';
import { useGameStore } from '../hooks/useGameStore';
import { useProgression } from './GameMachineProvider';

/**
 * Hook that syncs zustand game state with the progression state machine.
 * This bridge allows the progression machine to track badge state while
 * zustand remains the source of truth for game logic.
 */
export function useProgressionSync() {
	const {
		discoverLibrary,
		discoverPartner,
		discoverShowcase,
		discoverCorner,
		completeUpgrade,
		shipDestroyed,
		respawn,
		startGame,
	} = useProgression();

	// Track previous values to detect changes
	const prevDiscoveredRef = useRef<Set<string>>(new Set());
	const prevPhaseRef = useRef<string>('');

	// Get zustand state
	const discoveredIslands = useGameStore((s) => s.discoveredIslands);
	const phase = useGameStore((s) => s.phase);
	const islands = useGameStore((s) => s.islands);
	const expandedIslands = useGameStore((s) => s.expandedIslands);
	const showcaseIslands = useGameStore((s) => s.showcaseIslands);
	const cornerIslands = useGameStore((s) => s.cornerIslands);

	// Sync discoveries
	useEffect(() => {
		const prevDiscovered = prevDiscoveredRef.current;

		// Find newly discovered islands
		for (const id of discoveredIslands) {
			if (!prevDiscovered.has(id)) {
				// Determine island type and notify progression machine
				if (islands.some((i) => i.id === id)) {
					discoverLibrary();
				} else if (expandedIslands.some((i) => i.id === id && i.type === 'partner')) {
					discoverPartner();
				} else if (showcaseIslands.some((i) => i.id === id)) {
					discoverShowcase();
				} else if (cornerIslands.some((i) => i.id === id)) {
					discoverCorner();
				}
			}
		}

		prevDiscoveredRef.current = new Set(discoveredIslands);
	}, [
		discoveredIslands,
		islands,
		expandedIslands,
		showcaseIslands,
		cornerIslands,
		discoverLibrary,
		discoverPartner,
		discoverShowcase,
		discoverCorner,
	]);

	// Sync phase changes
	useEffect(() => {
		const prevPhase = prevPhaseRef.current;

		if (prevPhase !== phase) {
			if (phase === 'playing' && prevPhase === 'intro') {
				startGame();
			} else if (phase === 'playing' && prevPhase === 'upgrading') {
				completeUpgrade();
			} else if (phase === 'gameover') {
				shipDestroyed();
			} else if (phase === 'playing' && prevPhase === 'gameover') {
				respawn();
			}
		}

		prevPhaseRef.current = phase;
	}, [phase, startGame, completeUpgrade, shipDestroyed, respawn]);
}
