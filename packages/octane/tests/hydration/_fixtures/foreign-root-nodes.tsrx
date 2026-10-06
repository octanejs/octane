// Roots whose server content third parties add to where React tolerates it:
// the root container, and `<html>`, `<head>` and `<body>`.

export function Root(props: { label: string }) @{
	<main>
		<p>{props.label as string}</p>
	</main>
}

/** A root of another tag than Root's, for hydrating over Root's server HTML. */
export function Other(props: { label: string }) @{
	<section>{props.label as string}</section>
}

/** Root's markup after a range of its own, which the server frames with markers. */
export function Ranged(props: { label: string }) @{
	<>
		@if (props.label !== '') {
			<aside>{'ranged'}</aside>
		}
		<main>
			<p>{props.label as string}</p>
		</main>
	</>
}

export function Doc(props: { label: string }) @{
	<html lang="en">
		<head></head>
		<body>
			<p>{'before'}</p>
			<i>{props.label as string}</i>
		</body>
	</html>
}
