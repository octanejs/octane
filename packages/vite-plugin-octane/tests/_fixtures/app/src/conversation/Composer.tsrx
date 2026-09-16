import { isActionUncertain } from 'octane/signals';
import {
	conversation$,
	draftA$,
	draftB$,
	draftLength$,
	lastOperation$,
	notice$,
	reconcileReceipt,
	selectedConversation$,
	send,
} from './State.tsrx';

export function Composer() @{
	// Deliberately omit the $ suffix: the binding follows the actual writable
	// capability through aliases, not the identifier's spelling.
	const handle =
		selectedConversation$.get() === 'A' ? draftA$ : draftB$;
	<section aria-label="Composer">
		<label>
			Message
			<textarea name="draft" value={handle} maxLength={4_000} rows={4} />
		</label>
		<p>Characters: {draftLength$}</p>
		<button
			type="button"
			onClick={() => {
				const prompt = handle.get();
				if (!prompt.trim()) return;
				if (conversation$.snapshot().status !== 'ready') {
					notice$.set('Wait for conversation history before sending. Your draft is still here.');
					return;
				}
				// Clear synchronously for this user intent. An eventual receipt must
				// not clear a newer draft typed while generation is running.
				handle.set('');
				void send(prompt).then(
					() => notice$.set('Message accepted.'),
					(error: unknown) => notice$.set(
						isActionUncertain(error)
							? 'Acknowledgement uncertain. Check operation ' + error.operationId +
								'; do not resend.'
							: 'Message rejected. Your next draft has not changed.',
					),
				);
			}}
		>
			Send message
		</button>
		<button
			type="button"
			disabled={lastOperation$.get() === null}
			onClick={() => {
				const operation = lastOperation$.get();
				if (operation === null) return;
				const reads = reconcileReceipt(operation.operationId, operation.conversationId);
				void Promise.all([reads.receipt, reads.conversation]).then(([receipt, frame]) => {
					if (lastOperation$.get()?.operationId !== operation.operationId) return;
					notice$.set(
						receipt === null
							? 'No receipt found. No message was resent.'
							: 'Operation ' + receipt.status + ', conversation revision ' + frame.revision,
					);
				}, () => notice$.set('Receipt check failed. No message was resent.'));
			}}
		>
			Check last operation
		</button>
		<p role="status">{notice$}</p>
	</section>
}
