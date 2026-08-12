import Loading from '../Loading';
import styles from './styles';
import type { ContainerProps } from './types';

// Upstream used a separate `_ref` prop to avoid React forwardRef. Octane takes
// `ref` as an ordinary prop on the host div instead.

function MonacoContainer(props: ContainerProps) @{
	const { width, height, isEditorReady, loading, ref, className, wrapperProps = {} } = props;
	<section style={{ ...styles.wrapper, width, height }} {...wrapperProps}>
		@if (!isEditorReady) {
			<Loading>{loading}</Loading>
		}
		<div
			ref={ref}
			style={{ ...styles.fullWidth, ...(!isEditorReady ? styles.hide : {}) }}
			class={className}
		/>
	</section>
}

export default MonacoContainer;
