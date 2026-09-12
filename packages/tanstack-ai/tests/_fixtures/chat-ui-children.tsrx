// @ts-nocheck
import { Chat, ChatInput, ToolApproval, createChatUI } from '@octanejs/tanstack-ai/ui';

const options = { connection: { connect: async function* () {} } };
function Message({ Parts }) @{ <article><Parts /></article> }
function Layout({ Messages, Interrupts }) @{
	<>
		<Messages />
		<Interrupts />
	</>
}
function Text({ part }) @{ <span>{part.content as string}</span> }
const UI = createChatUI(options, {
	components: { layout: Layout, message: Message },
	partsComponents: { text: Text, fallback: () => null },
	interruptsComponents: { generic: { fallback: ({ interrupt }) => <i>{interrupt.reason as string}</i> } },
});

const message = { id: 'm1', role: 'assistant', parts: [{ type: 'text', content: 'Hello' }] };
const interrupt = { kind: 'generic', id: 'i1', reason: 'choose' };
const chat = {
	messages: [message],
	interrupts: [interrupt],
	queue: [],
	cancelQueued() {},
};

export function ChatUIChildren() @{
	<main>
		<UI.Provider chat={chat}>
			<UI.Messages>
				<span id="messages-template">messages-template</span>
			</UI.Messages>
			<UI.Messages>
				{(messages) => <output id="messages-callback">{String(messages.length)}</output>}
			</UI.Messages>
			<UI.Message message={message}>
				<span id="message-template">message-template</span>
			</UI.Message>
			<UI.Message message={message}>
				{(parts) => <output id="message-callback">{String(parts.length)}</output>}
			</UI.Message>
			<UI.Part part={message.parts[0]}>
				<span id="part-template">part-template</span>
			</UI.Part>
			<UI.Part part={message.parts[0]}>
				{(part) => <output id="part-callback">{part.key as string}</output>}
			</UI.Part>
			<UI.Interrupts>
				<span id="interrupts-template">interrupts-template</span>
			</UI.Interrupts>
			<UI.Interrupts>
				{(items) => <output id="interrupts-callback">{String(items.length)}</output>}
			</UI.Interrupts>
			<UI.Interrupt interrupt={interrupt}>
				<span id="interrupt-template">interrupt-template</span>
			</UI.Interrupt>
			<UI.Interrupt interrupt={interrupt}>
				{(item) => <output id="interrupt-callback">{item.reason as string}</output>}
			</UI.Interrupt>
		</UI.Provider>
		<Chat connection={options.connection}>
			<ChatInput>
				<span id="input-template">input-template</span>
			</ChatInput>
			<ChatInput>
				{(props) => <output id="input-callback">{props.disabled ? 'busy' : 'ready'}</output>}
			</ChatInput>
			<ToolApproval
				toolCallId="c1"
				toolName="buy"
				input={{ n: 1 }}
				approval={{ id: 'a1', needsApproval: true }}
			>
				<span id="approval-template">approval-template</span>
			</ToolApproval>
			<ToolApproval
				toolCallId="c2"
				toolName="sell"
				input={{ n: 2 }}
				approval={{ id: 'a2', needsApproval: true }}
			>
				{(props) => <output id="approval-callback">{props.toolName as string}</output>}
			</ToolApproval>
		</Chat>
	</main>
}
