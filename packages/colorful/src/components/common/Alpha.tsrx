import type { HsvaColor } from '../../types';
import { clamp } from '../../utils/clamp';
import { hsvaToHslaString } from '../../utils/convert';
import { formatClassName } from '../../utils/format';
import { round } from '../../utils/round';
import { Interactive, type Interaction } from './Interactive.tsrx';
import { Pointer } from './Pointer.tsrx';

interface Props {
	className?: string;
	hsva: HsvaColor;
	onChange: (newAlpha: { a: number }) => void;
	onChangeEnd?: () => void;
}

export const Alpha = ({ className, hsva, onChange, onChangeEnd }: Props) => {
	const handleMove = (interaction: Interaction) => onChange({ a: interaction.left });
	const handleKey = (offset: Interaction) => onChange({ a: clamp(hsva.a + offset.left) });
	const colorFrom = hsvaToHslaString(Object.assign({}, hsva, { a: 0 }));
	const colorTo = hsvaToHslaString(Object.assign({}, hsva, { a: 1 }));
	const gradientStyle = { backgroundImage: `linear-gradient(90deg, ${colorFrom}, ${colorTo})` };
	const nodeClassName = formatClassName(['react-colorful__alpha', className]);
	const ariaValue = round(hsva.a * 100);
	return <div class={nodeClassName}>
		<div class="react-colorful__alpha-gradient" style={gradientStyle} />
		<Interactive
			onMove={handleMove}
			onKey={handleKey}
			onEnd={onChangeEnd}
			aria-label="Alpha"
			aria-valuetext={`${ariaValue}%`}
			aria-valuenow={ariaValue}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<Pointer
				className="react-colorful__alpha-pointer"
				left={hsva.a}
				color={hsvaToHslaString(hsva)}
			/>
		</Interactive>
	</div>;
};
