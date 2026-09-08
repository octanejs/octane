import { ThinkingOrb } from '@octanejs/thinking-orbs';

export function ThinkingOrbsDiff() {
	return <div id="root">
		<ThinkingOrb id="working" state="working" size={64} theme="dark" />
		<ThinkingOrb id="inline" state="searching" size={20} theme="light" />
	</div>;
}
