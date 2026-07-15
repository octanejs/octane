import { useContext } from 'octane';
import { Connector as BaseConnector } from '@octanejs/visx/annotation';
import type { ConnectorProps as BaseConnectorProps } from '@octanejs/visx/annotation';
import DataContext from '../../context/DataContext.tsrx';

export type AnnotationConnectorProps = BaseConnectorProps;

/** AnnotationConnector which provides color from theme. */
export default function AnnotationConnector(props: AnnotationConnectorProps) {
	const { theme } = useContext(DataContext);
	return <BaseConnector stroke={theme?.axisStyles.x.bottom.axisLine.stroke} {...props} />;
}
