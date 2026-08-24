import styles, { badge, mutableStyles } from './css-module-constants.styles.js';
import * as classes from './css-module-constants.styles.js';

interface Props {
	label: string;
	selected: 'root' | 'tail';
	attrs: { class?: string; className?: string };
	shadow: string;
	rows: { id: string; root: string }[];
	onClick: () => void;
	ref: { current: HTMLElement | null };
}

function Shadow(styles: { root: string }) @{
	<aside data-case="shadow" class={styles.root} />
}

export function CssConstants(props: Props) @{
	<main class={styles.root} ref={props.ref}>
		<h1 className={`${badge} ${classes.tail}`}>{props.label as string}</h1>
		<p data-case="escaped" class={styles['escaped']} />
		<p data-case="empty" class={styles.empty} />
		<p data-case="computed" class={styles[props.selected]} />
		<p data-case="mutable" class={mutableStyles.current} />
		<div data-case="before-spread" class={styles.root} {...props.attrs} />
		<div data-case="after-spread" {...props.attrs} className={styles.root} />
		<Shadow root={props.shadow} />
		<ul>
			@for (const styles of props.rows; key styles.id) {
				<li class={styles.root}>{styles.id as string}</li>
			}
		</ul>
		<button class={badge + ' action'} onClick={props.onClick}>Go</button>
	</main>
}
