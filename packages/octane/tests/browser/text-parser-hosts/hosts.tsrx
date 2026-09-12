type Props = { readonly text: string };

export function TextareaHole({ text }: Props) @{
	<textarea id="target">{text as string}</textarea>
}

export function TableHole({ text }: Props) @{
	<table id="target">{text as string}</table>
}

export function BodyHole({ text }: Props) @{
	<table>
		<tbody id="target">{text as string}</tbody>
	</table>
}

export function RowHole({ text }: Props) @{
	<table>
		<tbody>
			<tr id="target">{text as string}</tr>
		</tbody>
	</table>
}

export function ColgroupHole({ text }: Props) @{
	<table>
		<colgroup id="target">{text as string}</colgroup>
	</table>
}

export function SelectHole({ text }: Props) @{
	<select id="target">{text as string}</select>
}

export function OptionHole({ text }: Props) @{
	<select>
		<option id="target">{text as string}</option>
	</select>
}

export function TablePair({ text }: Props) @{
	<>
		<table id="target">{text as string}</table>
		<aside id="tail">tail</aside>
	</>
}

export function BodyPair({ text }: Props) @{
	<>
		<table>
			<tbody id="target">{text as string}</tbody>
		</table>
		<aside id="tail">tail</aside>
	</>
}

export function ColgroupPair({ text }: Props) @{
	<>
		<table>
			<colgroup id="target">{text as string}</colgroup>
		</table>
		<aside id="tail">tail</aside>
	</>
}
