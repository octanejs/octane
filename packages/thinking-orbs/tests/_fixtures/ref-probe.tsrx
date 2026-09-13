import { ThinkingOrb } from '@octanejs/thinking-orbs';

export function ThinkingOrbRefProbe({
	onRef,
}: {
	onRef: (node: HTMLCanvasElement | null) => void;
}) {
	return <ThinkingOrb size={20} theme="light" paused ref={onRef} tabIndex={0} />;
}
