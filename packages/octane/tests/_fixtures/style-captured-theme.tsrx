import { theme } from './style-theme.tsrx';

const { $class: destructured, dark } = theme;
const direct = theme.$class;
let cached: string | undefined;

export function CapturedTheme({ kind }: { kind: 'destructured' | 'direct' | 'entry' }) @{
	<div class={kind === 'entry' ? dark : kind === 'direct' ? direct : destructured}>Probe</div>
}

export function CachedTheme() @{
	cached ??= theme.$class;
	<div class={cached}>Cached</div>
}
