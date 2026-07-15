import {
	Annotation as VisxAnnotation,
	EditableAnnotation as VisxEditableAnnotation,
} from '@octanejs/visx/annotation';
import type { AxisScale } from '@octanejs/visx/axis';
import type { BaseAnnotationProps } from './private/BaseAnnotation.tsrx';
import BaseAnnotation from './private/BaseAnnotation.tsrx';

export type AnnotationProps<XScale extends AxisScale, YScale extends AxisScale, Datum extends object> =
	{ editable?: boolean } & Omit<BaseAnnotationProps<XScale, YScale, Datum>, 'AnnotationComponent'>;

export default function Annotation<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>({
	editable,
	...props
}: AnnotationProps<XScale, YScale, Datum>) {
	return <BaseAnnotation
		AnnotationComponent={editable ? VisxEditableAnnotation : VisxAnnotation}
		{...props}
	/>;
}
