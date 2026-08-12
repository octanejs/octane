import type { Octane } from 'octane/jsx-runtime';
import type { OctaneNode } from 'octane';

export type LoadingProps = {
	children?: OctaneNode;
};

declare function Loading(props?: LoadingProps): Octane.JSX.Element;
export default Loading;
