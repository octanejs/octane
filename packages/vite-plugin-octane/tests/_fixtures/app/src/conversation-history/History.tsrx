import { history$ } from './State.tsrx';

export function History() @{
	const frame = history$.get();
	<>
		<style>
			article {
				color: rgb(12, 54, 87);
				border-left: 3px solid currentColor;
				padding-left: 12px;
			}
		</style>
		<article
			data-history={frame.conversationId}
			data-revision={frame.revision}
			data-source={frame.source}
		>
			<h2>{'Fetched conversation ' + frame.conversationId}</h2>
			@if (frame.receipt !== null) {
				<p data-receipt={frame.receipt.operationId}>
					{'Accepted operation: ' + frame.receipt.status}
				</p>
			}
			<ol>
				@for (const turn of frame.turns; key turn.id) {
					<li data-turn={turn.id}>
						<p>{turn.prompt as string}</p>
						<p>{turn.answer as string}</p>
						<p>{turn.status as string}</p>
					</li>
				} @empty {
					<li>No turns yet.</li>
				}
			</ol>
		</article>
	</>
}
