// Port of container/ClipPathProvider.tsx — mints the chart's clip path id,
// renders the <defs><clipPath> sized to the plot area, and provides the id.
import { createContext, useContext, useState } from 'octane';
import { uniqueId } from '../util/DataUtils';
import { usePlotArea } from '../hooks';

const ClipPathIdContext = createContext(undefined);

export function ClipPathProvider(props) @{
	const { children } = props;
	const [clipPathId] = useState(uniqueId('recharts') + '-clip');
	const plotArea = usePlotArea();
	if (plotArea == null) {
		return null;
	}
	const { x, y, width, height } = plotArea;
	<ClipPathIdContext.Provider value={clipPathId}>
		<defs>
			<clipPath id={clipPathId}>
				<rect x={x} y={y} height={height} width={width} />
			</clipPath>
		</defs>
		{children}
	</ClipPathIdContext.Provider>
}

export const useClipPathId = () => {
	return useContext(ClipPathIdContext);
};
