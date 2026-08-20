import type { OctaneNode } from 'octane';
import type { IContentLoaderProps } from './types';
import Facebook from './presets/FacebookStyle.tsrx';
import Svg from './Svg.tsrx';

export default function ContentLoader(props: IContentLoaderProps): OctaneNode {
	return props.children ? <Svg {...props} /> : <Facebook {...props} />;
}
