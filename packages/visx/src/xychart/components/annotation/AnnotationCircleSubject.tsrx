import { useContext } from 'octane';
import { CircleSubject as BaseCircleSubject } from '@octanejs/visx/annotation';
import type { CircleSubjectProps } from '@octanejs/visx/annotation';
import DataContext from '../../context/DataContext.tsrx';

export type AnnotationSubjectCircleProps = CircleSubjectProps;

/** AnnotationSubjectCircle which provides color from theme. */
export default function AnnotationCircleSubject(props: AnnotationSubjectCircleProps) {
	const { theme } = useContext(DataContext);
	return <BaseCircleSubject stroke={theme?.axisStyles.x.bottom.axisLine.stroke} {...props} />;
}
