import {
	type Context,
	createContext,
	type CSSProperties,
	type OctaneNode,
	useCallback,
	useContext,
	useState,
} from 'octane';

import { Virtualizer as VirtualizerClass, type VirtualizerConfig } from '@pierre/diffs';

export const VirtualizerContext: Context<VirtualizerClass | undefined> = createContext<
	VirtualizerClass | undefined
>(undefined);

interface VirtualizerProps {
	children: OctaneNode;
	config?: Partial<VirtualizerConfig>;
	className?: string;
	style?: CSSProperties;
	contentClassName?: string;
	contentStyle?: CSSProperties;
}

export function Virtualizer({
	children,
	config,
	className,
	style,
	contentClassName,
	contentStyle,
}: VirtualizerProps): OctaneNode {
	const [instance] = useState(() => {
		return typeof window !== 'undefined' ? new VirtualizerClass(config) : undefined;
	});
	const ref = useCallback(
		(node: HTMLElement | null) => {
			if (node != null) {
				instance?.setup(node);
			} else {
				instance?.cleanUp();
			}
		},
		[instance],
	);
	return (
		<VirtualizerContext value={instance}>
			<div className={className} style={style} ref={ref}>
				<div className={contentClassName} style={contentStyle}>
					{children}
				</div>
			</div>
		</VirtualizerContext>
	);
}

export function useVirtualizer(): VirtualizerClass | undefined {
	return useContext(VirtualizerContext);
}
