// Port of component/LabelList.tsx — one Label per data entry, fed by the
// cartesian/polar label-list contexts the graphical items provide.
import { createContext, useContext, isValidElement } from 'octane';
import { isLabelContentAFunction, Label } from './Label.tsrx';
import { Layer } from '../container/Layer.tsrx';
import { getValueByDataKey } from '../util/ChartUtils';
import { isNullish } from '../util/DataUtils';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';
import { ZIndexLayer } from '../zIndex/ZIndexLayer.tsrx';
import { DefaultZIndexes } from '../zIndex/DefaultZIndexes';
import { isRenderableText } from './Text.tsrx';

const defaultAccessor = (entry) => {
	const val = Array.isArray(entry.value) ? entry.value[entry.value.length - 1] : entry.value;
	if (isRenderableText(val)) {
		return val;
	}
	return undefined;
};

const CartesianLabelListContext = createContext(undefined);
export const CartesianLabelListContextProvider = CartesianLabelListContext.Provider;
const PolarLabelListContext = createContext(undefined);
export const PolarLabelListContextProvider = PolarLabelListContext.Provider;

function useCartesianLabelListContext() {
	return useContext(CartesianLabelListContext);
}
function usePolarLabelListContext() {
	return useContext(PolarLabelListContext);
}

export function LabelList(labelListProps) {
	const { valueAccessor = defaultAccessor, ...restProps } = labelListProps;
	const { dataKey, clockWise, id, textBreakAll, zIndex, ...others } = restProps;
	const cartesianData = useCartesianLabelListContext();
	const polarData = usePolarLabelListContext();
	const data = cartesianData || polarData;
	if (!data || !data.length) {
		return null;
	}
	return <ZIndexLayer zIndex={zIndex ?? DefaultZIndexes.label}>
		<Layer className="recharts-label-list">{data.map((entry, index) => {
			const value =
				isNullish(dataKey)
					? valueAccessor(entry, index)
					: getValueByDataKey(entry.payload, dataKey);
			const idProps = isNullish(id) ? {} : { id: id + '-' + index };
			return <Label
				key={'label-' + index}
				{...svgPropertiesAndEvents(entry)}
				{...others}
				{...idProps}
				fill={restProps.fill ?? entry.fill}
				parentViewBox={entry.parentViewBox}
				value={value}
				textBreakAll={textBreakAll}
				viewBox={entry.viewBox}
				index={index}
				zIndex={0}
			/>;
		})}</Layer>
	</ZIndexLayer>;
}

LabelList.displayName = 'LabelList';

export function LabelListFromLabelProp(props) {
	const { label } = props;
	if (!label) {
		return null;
	}
	if (label === true) {
		return <LabelList key="labelList-implicit" />;
	}
	if (isValidElement(label) || isLabelContentAFunction(label)) {
		return <LabelList key="labelList-implicit" content={label} />;
	}
	if (typeof label === 'object') {
		return <LabelList key="labelList-implicit" {...label} type={String(label.type)} />;
	}
	return null;
}
