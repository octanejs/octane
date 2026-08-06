import { Map } from '@octanejs/react-map-gl';
import type { MapProps } from '@octanejs/react-map-gl';

export function PlainMap(props: MapProps) @{
	<Map {...props} />
}
