import type { FC, OctaneNode } from '../../../../react-shim.js';
import { ResizeHandle } from '../ResizeHandle/index.tsrx';
import getClassNameFactory from '../../../../lib/get-class-name-factory';
import styles from './styles.module.css';

const getClassName = getClassNameFactory('Sidebar', styles);

interface SidebarProps {
	position: 'left' | 'right';
	sidebarRef: { current: HTMLDivElement | null };
	isVisible: boolean;
	onResize: (width: number) => void;
	onResizeEnd: (width: number) => void;
	children: OctaneNode;
}

export const Sidebar: FC<SidebarProps> = ({
	position,
	sidebarRef,
	isVisible,
	onResize,
	onResizeEnd,
	children,
}) => {
	if (!isVisible) return null;

	return <>
		<div ref={sidebarRef} className={getClassName({ [position]: true })}>{children}</div>
		<div className={`${getClassName('resizeHandle')}`}>
			<ResizeHandle
				position={position}
				sidebarRef={sidebarRef}
				onResize={onResize}
				onResizeEnd={onResizeEnd}
			/>
		</div>
	</>;
};
