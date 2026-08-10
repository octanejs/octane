/** @jsxImportSource @octanejs/three/intrinsics */
import { useThree } from '@octanejs/three';
import { useEffect } from '@octanejs/three/renderer';

export function ViewConnectedProbe({
	onState,
}: {
	onState: (state: { events: { connected: unknown }; setEvents: (value: unknown) => void }) => void;
}) @{
	const state = useThree((current) => current);
	useEffect(() => {
		onState(state as any);
	}, [state]);
	<></>
}
