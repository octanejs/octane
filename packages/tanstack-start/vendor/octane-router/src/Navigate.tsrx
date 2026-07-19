// Imperative navigation as a component: navigates once on mount, renders nothing.
import { useLayoutEffect, useRef } from 'octane';
import type { NavigateOptions } from '@tanstack/router-core';
import { useNavigate } from './hooks.ts';

export function Navigate(props: NavigateOptions) @{
	const navigate = useNavigate();
	const done = useRef(false);

	useLayoutEffect(() => {
		if (done.current) {
			return;
		}
		done.current = true;
		navigate(props);
	}, []);
}
