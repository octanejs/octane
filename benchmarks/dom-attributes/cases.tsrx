export function Attributes(props: { version: number; rows: number[] }) @{
	<section>
		@for (const id of props.rows; key id) {
			<a
				data-row={id}
				title={'title-' + props.version}
				href={'#v' + props.version}
				data-n={props.version}
			>
				<svg>
					<circle cx={props.version} strokeWidth={props.version} />
				</svg>
			</a>
		}
	</section>
}

export function Metadata(props: { version: number }) @{
	<>
		<title lang="en">{'title-' + props.version}</title>
		<meta name="description" content={'description-' + props.version} />
		<div>body</div>
	</>
}
