// Ported from @lexical/react/src/LexicalCollaborationContext.tsx — the context +
// reader hook (both rely only on useContext, which octane keys by identity, so no
// hook slot is needed and this stays plain `.ts`). The `LexicalCollaboration`
// provider component lands with P5 (collaboration).
import type { Doc } from 'yjs';

import { createContext, useContext } from 'octane';

export type CollaborationContextType = {
	color: string;
	isCollabActive: boolean;
	name: string;
	yjsDocMap: Map<string, Doc>;
};

const entries: [string, string][] = [
	['Cat', 'rgb(125, 50, 0)'],
	['Dog', 'rgb(100, 0, 0)'],
	['Rabbit', 'rgb(150, 0, 0)'],
	['Frog', 'rgb(200, 0, 0)'],
	['Fox', 'rgb(200, 75, 0)'],
	['Hedgehog', 'rgb(0, 75, 0)'],
	['Pigeon', 'rgb(0, 125, 0)'],
	['Squirrel', 'rgb(75, 100, 0)'],
	['Bear', 'rgb(125, 100, 0)'],
	['Tiger', 'rgb(0, 0, 150)'],
	['Leopard', 'rgb(0, 0, 200)'],
	['Zebra', 'rgb(0, 0, 250)'],
	['Wolf', 'rgb(0, 100, 150)'],
	['Owl', 'rgb(0, 100, 100)'],
	['Gull', 'rgb(100, 0, 100)'],
	['Squid', 'rgb(150, 0, 150)'],
];

const randomEntry = entries[Math.floor(Math.random() * entries.length)];

export const CollaborationContext = createContext<CollaborationContextType | null>(null);

function newContext(): CollaborationContextType {
	return {
		color: randomEntry[1],
		isCollabActive: false,
		name: randomEntry[0],
		yjsDocMap: new Map(),
	};
}

const UNSAFE_GLOBAL_CONTEXT = newContext();

export function useCollaborationContext(
	username?: string,
	color?: string,
): CollaborationContextType {
	let collabContext = useContext(CollaborationContext);

	collabContext = collabContext ?? UNSAFE_GLOBAL_CONTEXT;

	if (username != null) {
		collabContext.name = username;
	}

	if (color != null) {
		collabContext.color = color;
	}

	return collabContext;
}
