import { useRef } from 'octane';
import type { Octane } from 'octane/jsx-runtime';
import { useColorManipulation } from '../../hooks/useColorManipulation.tsrx';
import { useStyleSheet } from '../../hooks/useStyleSheet.tsrx';
import type { AnyColor, ColorModel, ColorPickerBaseProps } from '../../types';
import { Hue } from './Hue.tsrx';
import { Saturation } from './Saturation.tsrx';

interface Props<T extends AnyColor> extends Partial<ColorPickerBaseProps<T>> {
	colorModel: ColorModel<T>;
}

interface RootProps {
	hostProps: Octane.JSX.IntrinsicElements['div'];
	nodeRef: { current: HTMLDivElement | null };
	className: Octane.JSX.IntrinsicElements['div']['className'];
	classValue: Octane.JSX.IntrinsicElements['div']['class'];
	hsva: import('../../types').HsvaColor;
	onChange: (color: Partial<import('../../types').HsvaColor>) => void;
	onChangeEnd: () => void;
}

function ColorPickerRoot({
	hostProps,
	nodeRef,
	className,
	classValue,
	hsva,
	onChange,
	onChangeEnd,
}: RootProps) {
	return <div
		{...hostProps}
		ref={[hostProps.ref ?? null, nodeRef]}
		class={['react-colorful', className, classValue]}
	>
		<Saturation hsva={hsva} onChange={onChange} onChangeEnd={onChangeEnd} />
		<Hue
			hue={hsva.h}
			onChange={onChange}
			onChangeEnd={onChangeEnd}
			className="react-colorful__last-control"
		/>
	</div>;
}

export const ColorPicker = <T extends AnyColor,>({
	class: classValue,
	className,
	colorModel,
	color = colorModel.defaultColor,
	onChange,
	onChangeEnd,
	...rest
}: Props<T>) => {
	const nodeRef = useRef<HTMLDivElement | null>(null);
	useStyleSheet(nodeRef);
	const [hsva, updateHsva, commitChange] = useColorManipulation(
		colorModel,
		color,
		onChange,
		onChangeEnd,
	);
	return <ColorPickerRoot
		hostProps={rest}
		nodeRef={nodeRef}
		className={className}
		classValue={classValue}
		hsva={hsva}
		onChange={updateHsva}
		onChangeEnd={commitChange}
	/>;
};
