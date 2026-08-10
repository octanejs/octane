import { useAnimeScope, type UseAnimeScopeResult } from '@octanejs/animejs';
import type { Scope } from 'animejs';

export interface ScopeProbeProps {
	dependency: string;
	capture(result: UseAnimeScopeResult): void;
	onSetup(scope: Scope): void | (() => void);
}

export function ScopeProbe(props: ScopeProbeProps) @{
	const result = useAnimeScope((scope) => props.onSetup(scope), [props.dependency]);
	props.capture(result);
	<div ref={result.root}>
		<span className="target">target</span>
	</div>
}

export function SsrScopeProbe(props: { capture(result: UseAnimeScopeResult): void }) @{
	const result = useAnimeScope(() => {});
	props.capture(result);
	<div ref={result.root}>server</div>
}
