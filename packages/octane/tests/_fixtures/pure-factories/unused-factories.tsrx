import { createContext, createPortal, lazy, memo } from 'octane';

function Label() @{
	<span>{'label'}</span>
}

export const LabelContext = createContext('label');
export const MemoLabel = memo(Label);
export const LazyLabel = lazy(() => Promise.resolve({ default: Label }));
export const detachedPortal = createPortal(null, null as unknown as Element);

export function quadruple(value: number): number {
	return value * 4;
}
