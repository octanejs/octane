import { ThinkingOrb, type OrbSize, type OrbState, type OrbTheme } from '@octanejs/thinking-orbs';

export interface OrbGridProps {
	ids: string[];
	state: OrbState;
	size: OrbSize;
	theme: OrbTheme;
	paused: boolean;
	onCanvas?: (id: string, node: HTMLCanvasElement | null) => void;
	onClick?: () => void;
}

export function OrbGrid({ ids, state, size, theme, paused, onCanvas, onClick }: OrbGridProps) {
	return <section>
		@for (const id of ids; key id) {
			<ThinkingOrb
				data-orb={id}
				state={state}
				size={size}
				theme={theme}
				paused={paused}
				tabIndex={0}
				ref={(node) => onCanvas?.(id, node)}
				onClick={onClick}
			/>
		}
	</section>;
}
