import type { OctaneNode } from 'octane';

// Octane's template attributes do not declare `shadowrootmode`.
const declarativeShadowRoot = { shadowrootmode: 'open' } as Record<string, string>;

export function templateRender(children: OctaneNode, __html: string | undefined): OctaneNode {
	if (typeof window === 'undefined' && __html != null) {
		return (
			<>
				<template {...declarativeShadowRoot} dangerouslySetInnerHTML={{ __html }} />
				{children}
			</>
		);
	}
	return <>{children}</>;
}
