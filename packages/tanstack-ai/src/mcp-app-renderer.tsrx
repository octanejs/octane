import { useLayoutEffect, useRef, useState } from 'octane';
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

// Independently authored from the MCP Apps public host contract. Only the
// preloaded-resource surface consumed by MCPAppResource is needed here.
export interface AppRendererProps {
	toolName: string;
	sandbox: { url: URL };
	html?: string;
	toolResourceUri: string;
	toolInput?: Record<string, unknown>;
	onCallTool?: AppBridge['oncalltool'];
	onMessage?: AppBridge['onmessage'];
	onOpenLink?: AppBridge['onopenlink'];
}

export function AppRenderer(props: AppRendererProps) {
	const frame = useRef<HTMLIFrameElement | null>(null);
	const latest = useRef(props);
	latest.current = props;
	const [error, setError] = useState<string | null>(null);
	const resourceKey = JSON.stringify([props.sandbox.url.href, props.toolResourceUri, props.html]);
	const connection = useRef<{ sendInput: () => void } | null>(null);

	useLayoutEffect(() => {
		const iframe = frame.current;
		const target = iframe?.contentWindow;
		if (!iframe || !target) return;
		if (props.html === undefined) { setError('MCP resource does not contain HTML.'); return; }
		const html = props.html;
		setError(null);
		let active = true;
		let ready = false;
		let sentInput = false;
		const bridge = new AppBridge(null, { name: '@octanejs/tanstack-ai', version: '1.0.0' }, {
			serverTools: {}, message: {}, openLinks: {},
		});
		const reportError = (cause: Error) => {
			if (active) setError(cause.message);
		};
		bridge.onerror = reportError;
		bridge.oncalltool = (params, extra) => latest.current.onCallTool?.(params, extra)
			?? Promise.resolve({ content: [], isError: true });
		bridge.onmessage = (params, extra) => latest.current.onMessage?.(params, extra)
			?? Promise.resolve({});
		bridge.onopenlink = (params, extra) => latest.current.onOpenLink?.(params, extra)
			?? Promise.resolve({});
		bridge.onsandboxready = () => {
			if (active) void bridge.sendSandboxResourceReady({ html, sandbox: 'allow-scripts' }).catch(reportError);
		};
		const sendInput = () => {
			if (!active || !ready || sentInput || latest.current.toolInput === undefined) return;
			sentInput = true;
			void bridge.sendToolInput({ arguments: latest.current.toolInput }).catch(reportError);
		};
		bridge.oninitialized = () => { ready = true; sendInput(); };
		bridge.onsizechange = ({ height }) => {
			if (active && height !== undefined && Number.isFinite(height) && height >= 0) {
				iframe.style.height = `${height}px`;
			}
		};
		connection.current = { sendInput };
		void bridge.connect(new PostMessageTransport(target, target)).catch(reportError);
		return () => {
			active = false;
			connection.current = null;
			// Send the shutdown request before dropping the listener. A component
			// cleanup cannot await a guest that may never acknowledge teardown.
			if (ready) void bridge.teardownResource({}, { timeout: 1000 }).catch(() => {});
			void bridge.close().catch(() => {});
		};
	}, [resourceKey]);

	useLayoutEffect(() => { connection.current?.sendInput(); }, [props.toolInput]);
	return <div data-mcp-app-resource={props.toolResourceUri}>
		<iframe key={resourceKey} ref={frame} title={props.toolName} src={props.sandbox.url.href}
			sandbox="allow-scripts allow-same-origin" style={{ width: '100%', border: '0' }} />
		{error ? <p role="alert">{error as string}</p> : null}
	</div>;
}
