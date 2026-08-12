import { Canvas } from '@octanejs/three';
import { useCallback, useEffect, useRef, useState } from 'octane';
import { createProceduralAudio } from './assets.js';
import { DoomScene } from './Doom.three.tsrx';
import {
	createGameState,
	FIXED_STEP_MS,
	semanticSnapshot,
	stepGame,
	turnPlayer,
	type GameState,
	type InputState,
} from './model.js';

type Phase = 'landing' | 'loading' | 'playing' | 'failed';
type DoomProof =
	Readonly<{
		version: 1;
		contract: 'doom-clean-room-v1';
		getSnapshot: () => ReturnType<typeof semanticSnapshot>;
		getShell: () => Readonly<{
			phase: Phase;
			paused: boolean;
			pointerLocked: boolean;
			permissionError: string | null;
		}>;
	}>;

declare global {
	var __OCTANE_DOOM_PROOF__: DoomProof | undefined;
}

const emptyInput = (): InputState => ({
	forward: false,
	backward: false,
	left: false,
	right: false,
	fire: false,
});

function hasWebGL(): boolean {
	try {
		const canvas = document.createElement('canvas');
		return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
	} catch {
		return false;
	}
}

export function DoomDemo() @{
	const shellRef = useRef<HTMLDivElement | null>(null);
	const aimRef = useRef<HTMLDivElement | null>(null);
	const stateRef = useRef<GameState>(createGameState());
	const inputRef = useRef<InputState>(emptyInput());
	const phaseRef = useRef<Phase>('landing');
	const pausedRef = useRef(false);
	const permissionErrorRef = useRef<string | null>(null);
	const pointerLockedRef = useRef(false);
	const audioRef = useRef<ReturnType<typeof createProceduralAudio> | null>(null);
	const simulationTimeRef = useRef(0);
	const enterSessionRef = useRef(0);
	const loadingTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
	const [phase, setPhase] = useState<Phase>('landing');
	const [game, setGame] = useState<GameState>(stateRef.current);
	const [paused, setPaused] = useState(false);
	const [pointerLocked, setPointerLocked] = useState(false);
	const [permissionError, setPermissionError] = useState<string | null>(null);

	pausedRef.current = paused;
	pointerLockedRef.current = pointerLocked;
	permissionErrorRef.current = permissionError;

	function setPhaseNow(next: Phase): void {
		// Sole writer for phaseRef. Never mirror committed `phase` back into the
		// ref (render or effect) — that races with a newer setPhaseNow in the
		// commit-to-effect gap and can skip loading→playing or re-arm simulation.
		phaseRef.current = next;
		setPhase(next);
	}

	function setPausedNow(next: boolean): void {
		pausedRef.current = next;
		setPaused(next);
	}

	function invalidateEnterSession(): void {
		enterSessionRef.current += 1;
		if (loadingTimeoutRef.current !== null) {
			window.clearTimeout(loadingTimeoutRef.current);
			loadingTimeoutRef.current = null;
		}
	}

	const reset = useCallback(() => {
		stateRef.current = createGameState();
		inputRef.current = emptyInput();
		simulationTimeRef.current = 0;
		setGame(stateRef.current);
		setPausedNow(false);
	}, []);

	const requestPermissions = useCallback(async function requestPermissions(session: number) {
		setPermissionError(null);
		try {
			audioRef.current ??= createProceduralAudio();
			await audioRef.current.unlock();
			if (enterSessionRef.current !== session) return;
			// Aim mounts with the level branch; wait until it exists so lock targets
			// the viewport, not the whole shell (safety controls must stay clickable).
			let aim = aimRef.current;
			for (let attempt = 0; aim == null && attempt < 30; attempt += 1) {
				await new Promise<void>(function waitForAimFrame(resolve) {
					requestAnimationFrame(function onFrame() {
						resolve();
					});
				});
				if (enterSessionRef.current !== session) return;
				aim = aimRef.current;
			}
			if (enterSessionRef.current !== session) return;
			if (aim == null) {
				setPermissionError('Aim surface was not ready for pointer lock.');
				return;
			}
			const result = aim.requestPointerLock();
			if (result && 'then' in result) await result;
			if (enterSessionRef.current !== session) return;
		} catch (error) {
			if (enterSessionRef.current !== session) return;
			setPermissionError(error instanceof Error ? error.message : 'Permission was rejected.');
		}
	}, []);

	const enter = useCallback(async function enter() {
		if (!hasWebGL()) {
			setPhaseNow('failed');
			return;
		}
		const session = enterSessionRef.current + 1;
		enterSessionRef.current = session;
		if (loadingTimeoutRef.current !== null) {
			window.clearTimeout(loadingTimeoutRef.current);
			loadingTimeoutRef.current = null;
		}
		reset();
		setPhaseNow('loading');
		// The playground router owns location.hash. Add an internal history entry
		// without changing the URL so Back exits the level without unmounting Doom.
		history.pushState({ ...history.state, octaneDoom: true }, '', location.href);
		await requestPermissions(session);
		if (enterSessionRef.current !== session) return;
		loadingTimeoutRef.current = window.setTimeout(function startPlaying() {
			loadingTimeoutRef.current = null;
			if (enterSessionRef.current !== session) return;
			if (phaseRef.current !== 'loading') return;
			setPhaseNow('playing');
		}, 420);
	}, [requestPermissions, reset]);

	const retryPermissions = useCallback(function retryPermissions() {
		void requestPermissions(enterSessionRef.current);
	}, [requestPermissions]);

	const exit = useCallback(function exit() {
		invalidateEnterSession();
		document.exitPointerLock?.();
		audioRef.current?.stop();
		setPhaseNow('landing');
		reset();
		if (history.state?.octaneDoom === true) history.back();
	}, [reset]);

	useEffect(() => {
		const updatePointerLock = () => setPointerLocked(
			document.pointerLockElement === aimRef.current,
		);
		const onPointerError = () => setPermissionError('Pointer lock was rejected. Click Retry aim.');
		const onPopState = function onPopState() {
			if (phaseRef.current !== 'landing') {
				invalidateEnterSession();
				document.exitPointerLock?.();
				audioRef.current?.stop();
				setPhaseNow('landing');
				reset();
			}
		};
		document.addEventListener('pointerlockchange', updatePointerLock);
		document.addEventListener('pointerlockerror', onPointerError);
		window.addEventListener('popstate', onPopState);
		return () => {
			document.removeEventListener('pointerlockchange', updatePointerLock);
			document.removeEventListener('pointerlockerror', onPointerError);
			window.removeEventListener('popstate', onPopState);
		};
	}, [reset]);

	useEffect(() => {
		const setKey = (event: KeyboardEvent, down: boolean) => {
			if (phaseRef.current !== 'playing') return;
			const key = event.code;
			if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(key)) event.preventDefault();
			// Ignore presses while paused (mouse look already does); still honor
			// keyup so held keys from before pause do not stick after resume.
			if (pausedRef.current && down) return;
			if (key === 'KeyW') inputRef.current.forward = down;
			else if (key === 'KeyS') inputRef.current.backward = down;
			else if (key === 'KeyA') inputRef.current.left = down;
			else if (key === 'KeyD') inputRef.current.right = down;
			else if (key === 'Space') inputRef.current.fire = down;
		};
		const keydown = (event: KeyboardEvent) => setKey(event, true);
		const keyup = (event: KeyboardEvent) => setKey(event, false);
		const mousemove = (event: MouseEvent) => {
			if (
				document.pointerLockElement !== aimRef.current || phaseRef.current !== 'playing' ||
					pausedRef.current
			) return;
			stateRef.current = turnPlayer(stateRef.current, event.movementX * 0.0022);
		};
		window.addEventListener('keydown', keydown);
		window.addEventListener('keyup', keyup);
		window.addEventListener('mousemove', mousemove);
		return () => {
			window.removeEventListener('keydown', keydown);
			window.removeEventListener('keyup', keyup);
			window.removeEventListener('mousemove', mousemove);
		};
	}, []);

	useEffect(() => {
		let frame = 0;
		let prior = performance.now();
		let accumulator = 0;
		const tick = (time: number) => {
			const elapsed = Math.min(time - prior, 100);
			prior = time;
			if (phaseRef.current === 'playing' && !pausedRef.current) {
				accumulator += elapsed;
				while (accumulator >= FIXED_STEP_MS) {
					simulationTimeRef.current += FIXED_STEP_MS;
					stateRef.current = stepGame(
						stateRef.current,
						inputRef.current,
						simulationTimeRef.current,
					);
					for (const cue of stateRef.current.audioEvents) audioRef.current?.play(cue);
					accumulator -= FIXED_STEP_MS;
				}
				setGame(stateRef.current);
			}
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, []);

	useEffect(() => {
		const proofEnabled =
			(import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_DOOM_PROOF === '1';
		if (!proofEnabled) return;
		const proof: DoomProof = Object.freeze({
			version: 1,
			contract: 'doom-clean-room-v1',
			getSnapshot: () => semanticSnapshot(stateRef.current),
			getShell: () => Object.freeze({
				phase: phaseRef.current,
				paused: pausedRef.current,
				pointerLocked: pointerLockedRef.current,
				permissionError: permissionErrorRef.current,
			}),
		});
		globalThis.__OCTANE_DOOM_PROOF__ = proof;
		return () => {
			if (globalThis.__OCTANE_DOOM_PROOF__ === proof) delete globalThis.__OCTANE_DOOM_PROOF__;
		};
	}, []);

	useEffect(
		() => () => {
			inputRef.current = emptyInput();
			audioRef.current?.stop();
			audioRef.current = null;
			if (document.pointerLockElement === aimRef.current) document.exitPointerLock?.();
		},
		[],
	);

	function unlockAim(): void {
		if (document.pointerLockElement === aimRef.current) document.exitPointerLock?.();
	}

	function togglePaused(): void {
		unlockAim();
		const next = !pausedRef.current;
		if (next) inputRef.current = emptyInput();
		setPausedNow(next);
	}

	function resetFromSafety(): void {
		unlockAim();
		reset();
	}

	function exitFromSafety(): void {
		unlockAim();
		exit();
	}

	<div
		ref={shellRef}
		class="octane-doom"
		data-doom-shell={phase}
		data-doom-pointer={pointerLocked ? 'locked' : 'unlocked'}
		data-doom-paused={paused ? 'true' : 'false'}
		style={{
			position: 'relative',
			height: 'min(75vh, 720px)',
			minHeight: '500px',
			overflow: 'hidden',
			borderRadius: '10px',
			background: '#080806',
			color: '#f0dfb1',
			fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
		}}
	>
		@if (phase === 'landing') {
			<div
				data-doom-landing="ready"
				style={{
					position: 'absolute',
					inset: 0,
					display: 'grid',
					placeItems: 'center',
					background: 'radial-gradient(circle at 50% 30%, #4b160d, #090706 58%)',
				}}
			>
				<div
					style={{
						textAlign: 'center',
						padding: '28px',
						border: '2px solid #9c4b2c',
						background: '#0d0907e8',
						boxShadow: '0 0 50px #b62d122e',
					}}
				>
					<div
						style={{
							color: '#ff6b35',
							fontSize: 'clamp(2.8rem, 9vw, 7rem)',
							fontWeight: 950,
							letterSpacing: '-0.09em',
							lineHeight: 0.9,
							textShadow: '5px 5px 0 #51160b',
						}}
					>{'OCTANE // DOOM'}</div>
					<p style={{ color: '#bea984' }}>{'One level. Five hostiles. Eleven anomalies.'}</p>
					<button
						data-doom-start="true"
						onClick={enter}
						style={{
							border: '2px solid #ff6b35',
							background: '#3b130b',
							color: '#ffe5ad',
							padding: '12px 24px',
							cursor: 'pointer',
							font: 'inherit',
							fontWeight: 800,
						}}
					>{'ENTER THE LEVEL'}</button>
				</div>
			</div>
		} @else if (phase === 'failed') {
			<div
				data-doom-webgl-failure="true"
				style={{
					position: 'absolute',
					inset: 0,
					display: 'grid',
					placeItems: 'center',
					padding: '32px',
					textAlign: 'center',
				}}
			>
				<div>
					<h2>{'WebGL unavailable'}</h2>
					<p>{'Enable hardware acceleration or try a WebGL-capable browser.'}</p>
					<button
						onClick={function returnToLanding() {
							setPhaseNow('landing');
						}}
					>{'Return'}</button>
				</div>
			</div>
		} @else {
			<div data-doom-level="active" style={{ position: 'absolute', inset: 0 }}>
				<div ref={aimRef} data-doom-aim="true" style={{ position: 'absolute', inset: 0 }}>
					<Canvas camera={{ position: [2, 1, 2], fov: 72, near: 0.05, far: 60 }} dpr={[1, 1.5]}>
						<DoomScene state={game} />
					</Canvas>
					@if (phase === 'loading') {
						<div
							data-doom-loading="true"
							style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}
						>
							@try {
								<div
									data-doom-loading-indicator="true"
									style={{
										position: 'absolute',
										left: '50%',
										top: '50%',
										transform: 'translate(-50%, -50%)',
										color: '#ff6b35',
										fontWeight: 900,
									}}
								>{'BUILDING SECTOR'}</div>
							} @pending {
								<div style={{ position: 'absolute', inset: 0, background: '#171717' }}></div>
							}
						</div>
					}
					<div
						data-doom-crosshair="true"
						style={{
							position: 'absolute',
							left: '50%',
							top: '50%',
							width: '22px',
							height: '22px',
							transform: 'translate(-50%, -50%)',
							pointerEvents: 'none',
							zIndex: 8,
						}}
					>
						<span
							style={{
								position: 'absolute',
								left: 0,
								top: '10px',
								width: '8px',
								height: '2px',
								background: '#fff3ce',
							}}
						></span>
						<span
							style={{
								position: 'absolute',
								right: 0,
								top: '10px',
								width: '8px',
								height: '2px',
								background: '#fff3ce',
							}}
						></span>
						<span
							style={{
								position: 'absolute',
								left: '10px',
								top: 0,
								width: '2px',
								height: '8px',
								background: '#fff3ce',
							}}
						></span>
						<span
							style={{
								position: 'absolute',
								left: '10px',
								bottom: 0,
								width: '2px',
								height: '8px',
								background: '#fff3ce',
							}}
						></span>
					</div>
					<div
						data-doom-weapon={game.now < game.weaponUntil ? 'firing' : 'idle'}
						style={{
							position: 'absolute',
							width: game.now < game.weaponUntil ? '210px' : '190px',
							height: game.now < game.weaponUntil ? '170px' : '150px',
							left: '50%',
							bottom: '-25px',
							transform: 'translateX(-50%)',
							clipPath: 'polygon(23% 100%, 15% 36%, 32% 20%, 42% 0, 58% 0, 68% 20%, 85% 36%, 77% 100%)',
							background: game.now < game.weaponUntil
								? 'linear-gradient(90deg,#23150d,#fff091 48%,#3a1b0d)'
								: 'linear-gradient(90deg,#171717,#625444 48%,#201a16)',
							border: '5px solid #090807',
							pointerEvents: 'none',
							zIndex: 7,
						}}
					></div>
				</div>
				<div
					data-doom-safety-controls="octane"
					style={{
						position: 'absolute',
						left: '12px',
						bottom: '12px',
						zIndex: 12,
						display: 'flex',
						gap: '6px',
					}}
				>
					<button onClick={togglePaused}>
						{paused ? 'Resume (Octane safety)' : 'Pause (Octane safety)'}
					</button>
					<button onClick={resetFromSafety}>{'Reset (Octane safety)'}</button>
					<button onClick={exitFromSafety}>{'Exit (Octane safety)'}</button>
				</div>
				@if (!pointerLocked && phase === 'playing') {
					<div
						data-doom-aim-retry="true"
						style={{
							position: 'absolute',
							right: '12px',
							top: '12px',
							zIndex: 12,
							padding: '8px',
							background: '#110c08dd',
						}}
					>
						<button onClick={retryPermissions}>{'Retry aim / audio'}</button>
						{permissionError ? <span style={{ marginLeft: '8px' }}>{permissionError}</span> : null}
					</div>
				}
				@if (paused) {
					<div
						data-doom-paused-overlay="true"
						style={{
							position: 'absolute',
							inset: 0,
							display: 'grid',
							placeItems: 'center',
							zIndex: 10,
							background: '#0008',
							fontSize: '2rem',
							fontWeight: 900,
							pointerEvents: 'none',
						}}
					>{'OCTANE SAFETY PAUSE'}</div>
				}
			</div>
		}
	</div>
}
