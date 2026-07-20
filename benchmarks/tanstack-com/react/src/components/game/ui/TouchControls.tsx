import { useRef, useEffect, useCallback } from 'react';
import { useGameStore } from '../hooks/useGameStore';

// Track if a 3D object was clicked (set by R3F event handlers)
let clickedOn3DObject = false;
export function set3DObjectClicked() {
	clickedOn3DObject = true;
	setTimeout(() => {
		clickedOn3DObject = false;
	}, 100);
}

// Pointer state - shared with useBoatControls via module scope
let pointerActive = false;
let pointerX = 0;
let pointerY = 0;

export function getPointerState() {
	return { active: pointerActive, x: pointerX, y: pointerY };
}

export function TouchControls() {
	const { phase } = useGameStore();
	const isActiveRef = useRef(false);

	const handleStart = useCallback((clientX: number, clientY: number) => {
		if (clickedOn3DObject) return;
		isActiveRef.current = true;
		pointerActive = true;
		pointerX = clientX;
		pointerY = clientY;
	}, []);

	const handleMove = useCallback((clientX: number, clientY: number) => {
		if (!isActiveRef.current) return;
		pointerX = clientX;
		pointerY = clientY;
	}, []);

	const handleEnd = useCallback(() => {
		isActiveRef.current = false;
		pointerActive = false;
	}, []);

	// Mouse events
	useEffect(() => {
		if (phase !== 'playing') return;

		const onMouseDown = (e: MouseEvent) => {
			const target = e.target as HTMLElement;
			if (target.closest('button') || target.closest('a') || target.closest('[data-clickable]')) {
				return;
			}
			handleStart(e.clientX, e.clientY);
		};

		const onMouseMove = (e: MouseEvent) => {
			handleMove(e.clientX, e.clientY);
		};

		const onMouseUp = () => {
			handleEnd();
		};

		window.addEventListener('mousedown', onMouseDown);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);

		return () => {
			window.removeEventListener('mousedown', onMouseDown);
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			handleEnd();
		};
	}, [phase, handleStart, handleMove, handleEnd]);

	// Touch events
	useEffect(() => {
		if (phase !== 'playing') return;

		const onTouchStart = (e: TouchEvent) => {
			const target = e.target as HTMLElement;
			if (target.closest('button') || target.closest('a') || target.closest('[data-clickable]')) {
				return;
			}
			const touch = e.touches[0];
			handleStart(touch.clientX, touch.clientY);
		};

		const onTouchMove = (e: TouchEvent) => {
			e.preventDefault();
			const touch = e.touches[0];
			handleMove(touch.clientX, touch.clientY);
		};

		const onTouchEnd = () => {
			handleEnd();
		};

		window.addEventListener('touchstart', onTouchStart, { passive: true });
		window.addEventListener('touchmove', onTouchMove, { passive: false });
		window.addEventListener('touchend', onTouchEnd);
		window.addEventListener('touchcancel', onTouchEnd);

		return () => {
			window.removeEventListener('touchstart', onTouchStart);
			window.removeEventListener('touchmove', onTouchMove);
			window.removeEventListener('touchend', onTouchEnd);
			window.removeEventListener('touchcancel', onTouchEnd);
			handleEnd();
		};
	}, [phase, handleStart, handleMove, handleEnd]);

	return null;
}
