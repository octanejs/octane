import { createContext, useContext, type Context } from 'octane';
import { renderToStaticMarkup } from 'octane/server';

const MessageContext = createContext('unprovided');

export function ServerMessage(props: { context: Context<string> }) @{
	const message = useContext(props.context);
	<span>{message as string}</span>
}

function ServerApp(props: { component: typeof ServerMessage }) @{
	const Message = props.component;
	<MessageContext.Provider value="provided">
		<Message context={MessageContext} />
	</MessageContext.Provider>
}

export function run(component = ServerMessage) {
	return renderToStaticMarkup(ServerApp, { component });
}
