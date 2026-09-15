/** @jsxImportSource octane */
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import * as Actual from '@octanejs/tanstack-ai';
import type * as Upstream from '@tanstack/ai-react';
import type * as UI from '@octanejs/tanstack-ai/ui';
import type * as ReactUI from '@tanstack/ai-react/ui';
import { MCPAppResource } from '@octanejs/tanstack-ai/mcp-apps';
import type { MCPAppResourceProps } from '@octanejs/tanstack-ai/mcp-apps';
import type { MCPAppResourceProps as ReactResourceProps } from '@tanstack/ai-react/mcp-apps';
import type { OctaneNode } from 'octane';

type RootExports = Assert<Equal<keyof typeof Actual, keyof typeof Upstream>>;
type NativeHooks = 'useChat' | 'createChatHook';
type RootContracts = Assert<
	Equal<Omit<typeof Actual, NativeHooks>, Omit<typeof Upstream, NativeHooks>>
>;
type ChatHook = Assert<Equal<typeof Actual.useChat<[]>, typeof Upstream.useChat<[]>>>;
type BoundChatHook = Assert<
	Equal<typeof Actual.createChatHook<[]>, typeof Upstream.createChatHook<[]>>
>;
type UIExports = Assert<Equal<keyof typeof UI, keyof typeof ReactUI>>;
type ResourceProps = Assert<Equal<MCPAppResourceProps, ReactResourceProps>>;
type ResourceParameter = Assert<Equal<Parameters<typeof MCPAppResource>[0], ReactResourceProps>>;
type Normalize<T> = { [K in keyof T]: T[K] };
type ChatProps = Assert<
	Equal<
		UI.ChatProps,
		Normalize<
			Omit<ReactUI.ChatProps, 'children' | 'tools'> & {
				children: OctaneNode;
				tools?: Record<string, import('octane').ComponentType<{ input: any; output?: any }>>;
			}
		>
	>
>;

// @ts-expect-error A connection must implement the transport contract.
Actual.useChat({ connection: 42 });
// @ts-expect-error Queue strategies are a closed union.
Actual.useChat({ connection: { connect: async function* () {} }, queue: 'invalid' });
// @ts-expect-error An MCP resource must be a structured UI resource part.
MCPAppResource({ part: 'invalid', sandbox: { url: new URL('https://sandbox.example.test') } });
