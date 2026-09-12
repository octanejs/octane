'use client';

import { useRef } from 'octane';
import { useDbClient } from './DbProvider.tsrx';
import type { DehydratedDbState } from '@tanstack/db';
import type { OctaneNode } from 'octane';

export type HydrationBoundaryProps = {
	state: DehydratedDbState;
	children?: OctaneNode;
};

export function HydrationBoundary({ state, children }: HydrationBoundaryProps) {
	const client = useDbClient();
	const hydrated = useRef<{ client: typeof client; state: DehydratedDbState } | undefined>(
		undefined,
	);

	if (hydrated.current?.client !== client || hydrated.current.state !== state) {
		client.hydrate(state);
		hydrated.current = { client, state };
	}

	return children;
}
