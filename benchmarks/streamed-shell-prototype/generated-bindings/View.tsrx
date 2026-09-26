// The host owns data and the subscription; this ordinary view has no directive.
export function ConversationStatus(props: {
	title: string;
	response: string;
	history: string;
	interactions: string;
}) @{
	<section id="automatic-status" aria-label="Conversation status">
		<h1>{props.title as string}</h1>
		<p id="automatic-response">{props.response as string}</p>
		<p id="automatic-history">{props.history as string}</p>
		<p id="automatic-interactions">{props.interactions as string}</p>
	</section>
}
