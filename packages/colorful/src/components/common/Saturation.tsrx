import { memo } from 'octane';
import type { HsvaColor } from '../../types';
import { clamp } from '../../utils/clamp';
import { hsvaToHslString } from '../../utils/convert';
import { round } from '../../utils/round';
import { Interactive, type Interaction } from './Interactive.tsrx';
import { Pointer } from './Pointer.tsrx';

interface Props {
	hsva: HsvaColor;
	onChange: (newColor: { s: number; v: number }) => void;
	onChangeEnd?: () => void;
}

const SaturationBase = ({ hsva, onChange, onChangeEnd }: Props) => {
	const handleMove = (interaction: Interaction) => {
		onChange({ s: interaction.left * 100, v: 100 - interaction.top * 100 });
	};
	const handleKey = (offset: Interaction) => {
		onChange({
			s: clamp(hsva.s + offset.left * 100, 0, 100),
			v: clamp(hsva.v - offset.top * 100, 0, 100),
		});
	};
	const containerStyle = {
		backgroundColor: hsvaToHslString({ h: hsva.h, s: 100, v: 100, a: 1 }),
	};
	return <div class="react-colorful__saturation" style={containerStyle}>
		<Interactive
			onMove={handleMove}
			onKey={handleKey}
			onEnd={onChangeEnd}
			aria-label="Color"
			aria-valuetext={`Saturation ${round(hsva.s)}%, Brightness ${round(hsva.v)}%`}
		>
			<Pointer
				className="react-colorful__saturation-pointer"
				top={1 - hsva.v / 100}
				left={hsva.s / 100}
				color={hsvaToHslString(hsva)}
			/>
		</Interactive>
	</div>;
};

export const Saturation = memo(SaturationBase);
