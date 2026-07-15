import type { ProjectionProps } from './Projection.tsrx';
import Projection from './Projection.tsrx';
import type { GeoPermissibleObjects } from '../types';

/**
 * All props pass through to `<Projection projection="albersUsa" {...props} />`
 */
export default function AlbersUsa<Datum extends GeoPermissibleObjects>(props: Omit<ProjectionProps<Datum>, 'projection'>) {
	return <Projection projection="albersUsa" {...props} />;
}
