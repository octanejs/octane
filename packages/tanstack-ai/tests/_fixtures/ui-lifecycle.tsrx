import { createPortal, Suspense, use } from 'octane';
import { useChat } from '@octanejs/tanstack-ai';
import { createChatUI } from '@octanejs/tanstack-ai/ui';
import type { UIMessage } from '@tanstack/ai-client';

const options = { connection: { connect: async function* () {} } };
function Message({ Parts }) @{ <article><Parts /></article> }
function Layout({ Messages }) @{ <Messages /> }
function Text({ part }) @{ <span>{part.content as string}</span> }
const UI = createChatUI(options, {
	components: { layout: Layout, message: Message },
	partsComponents: { text: Text, fallback: () => null },
	interruptsComponents: { generic: { fallback: () => null } },
});
type Props = {
	threadId: string;
	initialMessages: UIMessage[];
	target: HTMLElement;
	ready: Promise<string>;
	fail: boolean;
};
function Reader(props: Props) @{
	const chat = UI.useChatContext();
	const state = use(props.ready);
	if (props.fail) throw new Error('chat widget failed');
	<section id="chat-widget" data-ready={state} data-count={chat.messages.length}>
		<UI.Messages />
	</section>
}
export function PortalChat(props: Props) @{
	const chat = useChat({ ...options, threadId: props.threadId, initialMessages: props.initialMessages });
	<UI.Provider chat={chat}>
		@try {
			<Suspense fallback={<output>Loading chat</output>}>
				{createPortal(<Reader {...props} />, props.target)}
			</Suspense>
		} @catch (error) {
			<output id="chat-error">{(error as Error).message as string}</output>
		}
	</UI.Provider>
}

export function HydratableChat(props: { threadId: string; initialMessages: UIMessage[] }) @{
	const chat = useChat({ ...options, ...props });
	<div id="hydrated-chat"><UI.Chat chat={chat} /></div>
}
