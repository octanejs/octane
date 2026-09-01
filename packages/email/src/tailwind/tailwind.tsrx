import type { OctaneNode } from 'octane';
import { registerTailwindBoundary, type TailwindBoundaryOptions } from './context.ts';

export interface TailwindProps extends TailwindBoundaryOptions {
	children: OctaneNode;
}

export function Tailwind({ children, config, theme, utility }: TailwindProps) @{
	const id = registerTailwindBoundary({ config, theme, utility });
	<>
		<template data-octane-email-tailwind-start={id} />
		{children}
		<template data-octane-email-tailwind-end={id} />
	</>
}
