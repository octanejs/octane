import Cross from './Cross.tsrx';
import type { MarkerComponentProps } from './Marker.tsrx';

export default function MarkerX(props: MarkerComponentProps) {
	return <Cross orient={45} {...props} />;
}
