export function CustomMessage(props: { message: string }) @{
	<div class="py-2">
		<div class="italic">This is a custom message:</div>
		<p>{props.message}</p>
	</div>
}
