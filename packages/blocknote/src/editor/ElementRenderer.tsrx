import { forwardRef, useImperativeHandle, useState } from 'octane';
import { createPortal, flushSync } from 'octane';

/**
 * A helper component to render a single element to a container so we can subsequently read the DOM / HTML contents
 *
 * This is useful so we can render arbitrary React elements (blocks) in the correct context (used by `ReactRenderUtil`)
 */
export const ElementRenderer = forwardRef<(node: React.OctaneNode, container: HTMLElement) => void>(
	(_props, ref) => {
		const [singleRenderData, setSingleRenderData] = useState<
			{ node: React.OctaneNode; container: HTMLElement } | undefined
		>();

		useImperativeHandle(ref, () => {
			return (node: React.OctaneNode, container: HTMLElement) => {
				flushSync(() => {
					setSingleRenderData({ node, container });
				});

				// clear after it's been rendered to `container`
				setSingleRenderData(undefined);
			};
		}, []);

		return <>
			{singleRenderData && createPortal(singleRenderData.node, singleRenderData.container)}
		</>;
	},
);
