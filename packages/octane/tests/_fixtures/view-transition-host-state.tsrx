import { ViewTransition } from 'octane';

export function HostStateApp(props: {
	rows: string[];
	choice: string;
	className: string;
	color: string;
	html: string;
	onInput: (value: string) => void;
}) @{
	<ViewTransition>
		<section class={props.className} style={{ color: props.color }}>
			<form id="host-state-form">
				@for (const row of props.rows; key row) {
					<label data-row={row}>
						<input
							type="radio"
							name="choice"
							value={row}
							checked={props.choice === row}
							onInput={() => props.onInput(row)}
						/>
						{row as string}
					</label>
				}
			</form>
			<input
				data-external=""
				type="radio"
				form="host-state-form"
				name="choice"
				value="external"
				checked={props.choice === 'external'}
				onInput={() => props.onInput('external')}
			/>
			<div data-raw="" dangerouslySetInnerHTML={{ __html: props.html }} />
		</section>
	</ViewTransition>
}
