import { useMemo } from 'octane';
import type { OctaneNode } from 'octane';
import AnnotationContext from '../context/AnnotationContext.tsrx';
import type { AnnotationContextType } from '../types';

export type AnnotationProps = Pick<AnnotationContextType, 'x' | 'y' | 'dx' | 'dy'> & {
		/** Annotation children (Subject, Label, Connector) */
		children: OctaneNode;
	};

export default function Annotation({ x, y, dx, dy, children }: AnnotationProps) {
	const value = useMemo(() => ({ x, y, dx, dy }), [x, y, dx, dy]);
	return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}
