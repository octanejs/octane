/**
 * Framework metadata for the builder UI.
 * This file is safe to import on the client (no cta-engine dependencies).
 */

export type FrameworkId = 'react' | 'solid';

export function normalizeFrameworkId(id?: string): FrameworkId {
	switch (id) {
		case 'solid':
			return 'solid';
		case 'react-cra':
		case 'react':
		default:
			return 'react';
	}
}

export const FRAMEWORKS: Array<{
	id: FrameworkId;
	name: string;
	description: string;
}> = [
	{
		id: 'react',
		name: 'React',
		description: 'Full-stack React with TanStack Router',
	},
	{
		id: 'solid',
		name: 'Solid',
		description: 'Full-stack Solid with TanStack Router',
	},
];
