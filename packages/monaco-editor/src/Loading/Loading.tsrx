import type { OctaneNode } from 'octane';

import styles from './styles';

export type LoadingProps = {
	children?: OctaneNode;
};

function Loading(props: LoadingProps = {}) @{
	<div style={styles.container}>{props.children}</div>
}

export default Loading;
