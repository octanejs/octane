/** @jsxImportSource octane */
// Pinned AI export consumers; generic tool tuples use readonly [] and full typed tools are covered by the upstream type suite.
// Every published export participates in a consumer assertion against the pinned npm types.
// Property presence and callable arity complement the recursive opacity audit,
// the complete upstream type suite, and the handwritten inference/negative examples.
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import type * as Native0 from '@octanejs/tanstack-ai';
import type * as Native1 from '@octanejs/tanstack-ai/mcp-apps';
import type * as Native2 from '@octanejs/tanstack-ai/ui';

type SharedKeys0 = 'callEndpoint' | 'chat' | 'fetchImpl' | 'onLink';
type SharedKeys1 = 'byok' | 'byokProvider' | 'devtools' | 'fetcher' | 'persistence';
type SharedKeys2 = 'connection' | 'onChunk';
type SharedKeys3 =
	| 'devtoolsBridgeFactory'
	| 'initialResumeSnapshot'
	| 'live'
	| 'onCustomEvent'
	| 'onInterruptStateChange'
	| 'outputSchema'
	| 'streamProcessor';
type SharedKeys4 = 'initialMessages' | 'onFinish' | 'onResponse';
type SharedKeys5 = 'interrupts' | 'queue';
type SharedKeys6 =
	| 'addToolApprovalResponse'
	| 'addToolResult'
	| 'append'
	| 'cancelInterrupts'
	| 'clear'
	| 'connectionStatus'
	| 'interruptErrors'
	| 'isSubscribed'
	| 'pendingInterrupts'
	| 'reload'
	| 'resolveInterrupts'
	| 'resumeInterrupts'
	| 'resumeInterruptsUnsafe'
	| 'resuming'
	| 'retryInterrupts'
	| 'sendMessage'
	| 'sessionGenerating'
	| 'setMessages';
type SharedKeys7 =
	| 'anchor'
	| 'at'
	| 'big'
	| 'blink'
	| 'bold'
	| 'charAt'
	| 'charCodeAt'
	| 'codePointAt'
	| 'concat'
	| 'endsWith'
	| 'fixed'
	| 'fontcolor'
	| 'fontsize'
	| 'includes'
	| 'indexOf'
	| 'isWellFormed'
	| 'italics'
	| 'lastIndexOf'
	| 'length'
	| 'link'
	| 'localeCompare'
	| 'match'
	| 'matchAll'
	| 'normalize'
	| 'padEnd'
	| 'padStart'
	| 'repeat'
	| 'replace'
	| 'replaceAll'
	| 'search'
	| 'slice'
	| 'small'
	| 'split'
	| 'startsWith'
	| 'strike'
	| 'sub'
	| 'substr'
	| 'substring'
	| 'sup'
	| 'toLocaleLowerCase'
	| 'toLocaleUpperCase'
	| 'toLowerCase'
	| 'toString'
	| 'toUpperCase'
	| 'toWellFormed'
	| 'trim'
	| 'trimEnd'
	| 'trimLeft'
	| 'trimRight'
	| 'trimStart'
	| 'valueOf'
	| typeof Symbol.iterator;
type SharedKeys8 = 'drain' | 'maxSize' | 'onOverflow';
type SharedKeys9 =
	| 'adapter'
	| 'autoCapture'
	| 'autoPlayback'
	| 'getToken'
	| 'instructions'
	| 'maxOutputTokens'
	| 'onConnect'
	| 'onDisconnect'
	| 'onGoAway'
	| 'onInterrupted'
	| 'onMessage'
	| 'onModeChange'
	| 'onStatusChange'
	| 'onUsage'
	| 'outputModalities'
	| 'semanticEagerness'
	| 'temperature'
	| 'vadMode';
type SharedKeys10 =
	| 'disconnect'
	| 'getInputFrequencyData'
	| 'getInputTimeDomainData'
	| 'getOutputFrequencyData'
	| 'getOutputTimeDomainData'
	| 'inputLevel'
	| 'mode'
	| 'outputLevel'
	| 'pendingAssistantTranscript'
	| 'pendingUserTranscript'
	| 'sendImage'
	| 'sendText'
	| 'startListening'
	| 'stopListening'
	| 'updateSession';
type SharedKeys11 = 'onProgress' | 'onResult';
type SharedKeys12 = 'generate' | 'reset';
type SharedKeys13 = 'onJobCreated' | 'onStatusUpdate';
type SharedKeys14 = 'mimeType' | 'onComplete';
type SharedKeys15 = 'isRecording' | 'isSupported' | 'recording' | 'start';
type SharedKeys16 =
	'captureStackTrace' | 'isError' | 'prepareStackTrace' | 'prototype' | 'stackTraceLimit';
type SharedKeys17 = 'getItem' | 'removeItem' | 'setItem';
type SharedKeys18 = 'deserialize' | 'serialize';
type SharedKeys19 = 'databaseName' | 'objectStoreName';
type SharedKeys20 = 'callTool' | 'openLink' | 'sendPrompt';
type SharedKeys21 = 'send' | 'subscribe';
type SharedKeys22 = 'credentials' | 'fetchClient';
type SharedKeys23 = 'withCredentials' | 'xhrFactory';
type SharedKeys24 = 'WebSocketImpl' | 'protocols';
type SharedKeys25 = string | symbol;
type SharedKeys26 =
	| 'binding'
	| 'canResolve'
	| 'clearResolution'
	| 'definitionId'
	| 'errors'
	| 'generation'
	| 'interruptId'
	| 'interruptedRunId'
	| 'key'
	| 'kind'
	| 'payload'
	| 'reason'
	| 'resolveInterrupt'
	| 'responseSchema';
type SharedKeys27 = 'format' | 'speed';
type SharedKeys28 = 'language' | 'responseFormat';
type SharedKeys29 = 'focus' | 'maxLength' | 'style';
type SharedKeys30 = 'bridge' | 'sandbox' | 'toolInput';
type SharedKeys31 = 'interruptsComponents' | 'partsComponents' | 'toolsComponents';
type SharedKeys32 = 'Input' | 'Interrupts' | 'Messages' | 'Queue';
type SharedKeys33 = 'chatContext' | 'interruptContext' | 'partContext' | 'useChatContext';
type SharedKeys34 = 'autoScroll' | 'emptyState' | 'errorState' | 'loadingState';
type SharedKeys35 = 'assistantClassName' | 'userClassName';
type SharedKeys36 =
	| 'defaultToolRenderer'
	| 'textPartRenderer'
	| 'thinkingPartRenderer'
	| 'toolResultRenderer'
	| 'toolsRenderer';
type SharedKeys37 = 'arguments' | 'output' | 'state';
type SharedKeys38 = 'placeholder' | 'submitOnEnter';
type SharedKeys39 = 'inputRef' | 'onChange' | 'onSubmit' | 'value';
type SharedKeys40 = 'input' | 'toolName';
type SharedKeys41 = 'approved' | 'hasResponded' | 'onApprove' | 'onDeny';
type SharedKeys42 = 'disableDefaultPlugins' | 'rehypePlugins' | 'remarkPlugins';
type PublishedKeys0 = SharedKeys0 | 'threadId';
type PublishedKeys1 = 'context' | 'onError' | 'toolOptions';
type PublishedKeys2 = 'sample';
type PublishedKeys3 =
	| 'threadId'
	| 'context'
	| 'onError'
	| 'body'
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| 'forwardedProps'
	| SharedKeys4
	| SharedKeys5
	| 'tools';
type PublishedKeys4 =
	| SharedKeys5
	| SharedKeys6
	| 'cancelQueued'
	| 'error'
	| 'isLoading'
	| 'messages'
	| 'runId'
	| 'status'
	| 'stop';
type PublishedKeys5 = 'createdAt' | 'id' | 'metadata' | 'name' | 'parts' | 'role';
type PublishedKeys6 = 'messages' | 'data';
type PublishedKeys7 = 'createdAt' | 'id' | 'content';
type PublishedKeys8 = 'body' | 'whenBusy';
type PublishedKeys9 = SharedKeys7 | number;
type PublishedKeys10 = 'whenBusy' | SharedKeys8;
type PublishedKeys11 = 'onError' | 'tools' | SharedKeys9 | 'voice';
type PublishedKeys12 = 'error' | 'messages' | 'status' | 'connect' | SharedKeys10 | 'interrupt';
type PublishedKeys13 =
	| 'threadId'
	| 'onError'
	| 'body'
	| SharedKeys1
	| SharedKeys2
	| 'hydrateGeneration'
	| 'joinRun'
	| SharedKeys11
	| 'reconstructResult';
type PublishedKeys14 =
	'error' | 'isLoading' | 'runId' | 'status' | 'stop' | SharedKeys12 | 'result';
type PublishedKeys15 =
	| 'threadId'
	| 'onError'
	| 'body'
	| SharedKeys1
	| SharedKeys2
	| 'hydrateGeneration'
	| 'joinRun'
	| SharedKeys11;
type PublishedKeys16 =
	| 'threadId'
	| 'onError'
	| 'body'
	| SharedKeys1
	| SharedKeys2
	| 'hydrateGeneration'
	| 'joinRun'
	| SharedKeys11
	| SharedKeys13;
type PublishedKeys17 =
	| 'error'
	| 'isLoading'
	| 'runId'
	| 'status'
	| 'stop'
	| SharedKeys12
	| 'result'
	| 'jobId'
	| 'videoStatus';
type PublishedKeys18 = 'onError' | 'audio' | SharedKeys14;
type PublishedKeys19 = 'stop' | 'cancel' | SharedKeys15;
type PublishedKeys20 = SharedKeys16;
type PublishedKeys21 = SharedKeys17;
type PublishedKeys22 = 'messages' | 'resume';
type PublishedKeys23 = SharedKeys18 | 'keyPrefix';
type PublishedKeys24 = 'keyPrefix' | SharedKeys19;
type PublishedKeys25 = SharedKeys20;
type PublishedKeys26 = 'threadId' | 'messages' | 'runId' | 'data' | 'resume' | 'parentRunId';
type PublishedKeys27 = 'headers' | 'signal';
type PublishedKeys28 = 'joinRun' | 'hydrate';
type PublishedKeys29 = 'connect' | 'hydrateGeneration' | 'joinRun' | 'hydrate';
type PublishedKeys30 = 'joinRun' | 'hydrate' | SharedKeys21;
type PublishedKeys31 =
	'threadId' | 'forwardedProps' | 'runId' | 'resume' | 'parentRunId' | 'headers' | 'clientTools';
type PublishedKeys32 = 'body' | 'headers' | 'signal' | SharedKeys22 | 'reconnect';
type PublishedKeys33 = 'body' | 'headers' | 'signal' | 'reconnect' | SharedKeys23;
type PublishedKeys34 = 'body' | 'reconnect' | SharedKeys24;
type PublishedKeys35 = number | SharedKeys25;
type PublishedKeys36 =
	| 'threadId'
	| 'error'
	| 'status'
	| 'id'
	| 'metadata'
	| 'cancel'
	| SharedKeys26
	| 'expiresAt'
	| 'message';
type PublishedKeys37 = 'modelOptions' | 'numberOfImages' | 'prompt' | 'size';
type PublishedKeys38 = 'modelOptions' | 'prompt' | 'duration';
type PublishedKeys39 = 'voice' | 'modelOptions' | SharedKeys27 | 'text';
type PublishedKeys40 = 'audio' | 'modelOptions' | 'prompt' | SharedKeys28;
type PublishedKeys41 = 'modelOptions' | 'text' | SharedKeys29;
type PublishedKeys42 = 'modelOptions' | 'prompt' | 'size' | 'duration';
type PublishedKeys43 = 'status' | 'jobId' | 'expiresAt' | 'artifacts' | 'url';
type PublishedKeys44 = 'error' | 'status' | 'jobId' | 'url' | 'progress';
type PublishedKeys45 = SharedKeys30 | 'part';
type PublishedKeys46 = 'components' | SharedKeys31;
type PublishedKeys47 = 'context' | 'components' | SharedKeys31;
type PublishedKeys48 = 'cancelQueued' | 'createdAt' | 'id' | 'content';
type PublishedKeys49 = '__ui';
type PublishedKeys50 = 'interrupt' | '__ui';
type PublishedKeys51 = '__ui' | SharedKeys32;
type PublishedKeys52 = 'message' | 'Parts';
type PublishedKeys53 = 'part';
type PublishedKeys54 = '__ui' | 'item';
type PublishedKeys55 = 'interrupt' | 'result' | 'part';
type PublishedKeys56 = SharedKeys33;
type PublishedKeys57 =
	'onError' | 'body' | SharedKeys2 | SharedKeys4 | 'tools' | 'id' | 'children' | 'className';
type PublishedKeys58 = 'children' | 'className' | SharedKeys34;
type PublishedKeys59 = 'message' | 'className' | SharedKeys35 | SharedKeys36;
type PublishedKeys60 = 'id' | 'name' | 'approval' | SharedKeys37;
type PublishedKeys61 = 'children' | 'className' | 'disabled' | SharedKeys38;
type PublishedKeys62 = 'isLoading' | 'disabled' | SharedKeys39;
type PublishedKeys63 = 'children' | 'className' | 'approval' | SharedKeys40 | 'toolCallId';
type PublishedKeys64 = SharedKeys40 | SharedKeys41;
type PublishedKeys65 =
	'role' | 'content' | 'components' | 'className' | SharedKeys35 | SharedKeys42;
type PublishedKeys66 = 'content' | 'className' | 'isComplete';

type Contract0 = Assert<Equal<Parameters<typeof Native0.useChat>['length'], 1>>;
type Contract1 = Assert<Equal<Parameters<typeof Native0.createChatHook>['length'], 1>>;
type Contract2 = Assert<Equal<Parameters<typeof Native0.useByok>['length'], 1>>;
type Contract3 = Assert<Equal<Parameters<typeof Native0.useRealtimeChat>['length'], 1>>;
type Contract4 = Assert<Equal<Parameters<typeof Native0.useMcpAppBridge>['length'], 1>>;
type Contract5 = Assert<
	Equal<keyof Pick<Native0.UseMcpAppBridgeOptions, PublishedKeys0>, PublishedKeys0>
>;
type Contract6 = Assert<Equal<Parameters<typeof Native0.useWebMCPTools>['length'], 1 | 2>>;
type Contract7 = Assert<
	Equal<keyof Pick<Native0.UseWebMCPToolsOptions<readonly []>, PublishedKeys1>, PublishedKeys1>
>;
type Contract8 = Assert<
	Equal<keyof Pick<Native0.DeepPartial<{ sample: string }>, PublishedKeys2>, PublishedKeys2>
>;
type Contract9 = Assert<Equal<keyof Pick<Native0.UseChatOptions, PublishedKeys3>, PublishedKeys3>>;
type Contract10 = Assert<Equal<keyof Pick<Native0.UseChatReturn, PublishedKeys4>, PublishedKeys4>>;
type Contract11 = Assert<Equal<keyof Pick<Native0.UIMessage, PublishedKeys5>, PublishedKeys5>>;
type Contract12 = Assert<
	Equal<keyof Pick<Native0.ChatRequestBody, PublishedKeys6>, PublishedKeys6>
>;
type Contract13 = Assert<Equal<keyof Pick<Native0.QueuedMessage, PublishedKeys7>, PublishedKeys7>>;
type Contract14 = Assert<
	Equal<keyof Pick<Native0.SendMessageOptions, PublishedKeys8>, PublishedKeys8>
>;
type Contract15 = Assert<Equal<keyof Pick<Native0.WhenBusy, PublishedKeys9>, PublishedKeys9>>;
type Contract16 = Assert<Equal<keyof Pick<Native0.QueueConfig, PublishedKeys10>, PublishedKeys10>>;
type Contract17 = Assert<Equal<Parameters<Native0.QueueStrategy>['length'], 1>>;
type Contract18 = Assert<Equal<keyof Native0.QueueOption, never>>;
type Contract19 = Assert<
	Equal<keyof Pick<Native0.UseRealtimeChatOptions, PublishedKeys11>, PublishedKeys11>
>;
type Contract20 = Assert<
	Equal<keyof Pick<Native0.UseRealtimeChatReturn, PublishedKeys12>, PublishedKeys12>
>;
type Contract21 = Assert<Equal<Parameters<typeof Native0.useGeneration>['length'], 1>>;
type Contract22 = Assert<
	Equal<
		keyof Pick<
			Native0.UseGenerationOptions<{ sample: string }, { sample: string }>,
			PublishedKeys13
		>,
		PublishedKeys13
	>
>;
type Contract23 = Assert<
	Equal<
		keyof Pick<Native0.UseGenerationReturn<{ sample: string }>, PublishedKeys14>,
		PublishedKeys14
	>
>;
type Contract24 = Assert<Equal<Parameters<typeof Native0.useGenerateImage>['length'], 1>>;
type Contract25 = Assert<
	Equal<keyof Pick<Native0.UseGenerateImageOptions, PublishedKeys15>, PublishedKeys15>
>;
type Contract26 = Assert<
	Equal<keyof Pick<Native0.UseGenerateImageReturn, PublishedKeys14>, PublishedKeys14>
>;
type Contract27 = Assert<Equal<Parameters<typeof Native0.useGenerateAudio>['length'], 1>>;
type Contract28 = Assert<
	Equal<keyof Pick<Native0.UseGenerateAudioOptions, PublishedKeys15>, PublishedKeys15>
>;
type Contract29 = Assert<
	Equal<keyof Pick<Native0.UseGenerateAudioReturn, PublishedKeys14>, PublishedKeys14>
>;
type Contract30 = Assert<Equal<Parameters<typeof Native0.useGenerateSpeech>['length'], 1>>;
type Contract31 = Assert<
	Equal<keyof Pick<Native0.UseGenerateSpeechOptions, PublishedKeys15>, PublishedKeys15>
>;
type Contract32 = Assert<
	Equal<keyof Pick<Native0.UseGenerateSpeechReturn, PublishedKeys14>, PublishedKeys14>
>;
type Contract33 = Assert<Equal<Parameters<typeof Native0.useTranscription>['length'], 1>>;
type Contract34 = Assert<
	Equal<keyof Pick<Native0.UseTranscriptionOptions, PublishedKeys15>, PublishedKeys15>
>;
type Contract35 = Assert<
	Equal<keyof Pick<Native0.UseTranscriptionReturn, PublishedKeys14>, PublishedKeys14>
>;
type Contract36 = Assert<Equal<Parameters<typeof Native0.useSummarize>['length'], 1>>;
type Contract37 = Assert<
	Equal<keyof Pick<Native0.UseSummarizeOptions, PublishedKeys15>, PublishedKeys15>
>;
type Contract38 = Assert<
	Equal<keyof Pick<Native0.UseSummarizeReturn, PublishedKeys14>, PublishedKeys14>
>;
type Contract39 = Assert<Equal<Parameters<typeof Native0.useGenerateVideo>['length'], 1>>;
type Contract40 = Assert<
	Equal<keyof Pick<Native0.UseGenerateVideoOptions, PublishedKeys16>, PublishedKeys16>
>;
type Contract41 = Assert<
	Equal<keyof Pick<Native0.UseGenerateVideoReturn, PublishedKeys17>, PublishedKeys17>
>;
type Contract42 = Assert<Equal<Parameters<typeof Native0.useAudioRecorder>['length'], 0 | 1>>;
type Contract43 = Assert<
	Equal<
		keyof Pick<Native0.UseAudioRecorderOptions<{ sample: string }>, PublishedKeys18>,
		PublishedKeys18
	>
>;
type Contract44 = Assert<
	Equal<
		keyof Pick<Native0.UseAudioRecorderReturn<{ sample: string }>, PublishedKeys19>,
		PublishedKeys19
	>
>;
type Contract45 = Assert<Equal<Parameters<typeof Native0.fetchServerSentEvents>['length'], 1 | 2>>;
type Contract46 = Assert<
	Equal<Parameters<typeof Native0.localStoragePersistence>['length'], 0 | 1>
>;
type Contract47 = Assert<
	Equal<Parameters<typeof Native0.sessionStoragePersistence>['length'], 0 | 1>
>;
type Contract48 = Assert<Equal<Parameters<typeof Native0.indexedDBPersistence>['length'], 0 | 1>>;
type Contract49 = Assert<
	Equal<keyof Pick<typeof Native0.StorageUnavailableError, PublishedKeys20>, PublishedKeys20>
>;
type Contract50 = Assert<
	Equal<keyof Pick<Native0.ChatClientPersistence, PublishedKeys21>, PublishedKeys21>
>;
type Contract51 = Assert<
	Equal<keyof Pick<Native0.ChatPersistedState, PublishedKeys22>, PublishedKeys22>
>;
type Contract52 = Assert<Equal<keyof Native0.ChatPersistenceOption, never>>;
type Contract53 = Assert<
	Equal<
		keyof Pick<Native0.ChatStorageAdapter<{ sample: string }>, PublishedKeys21>,
		PublishedKeys21
	>
>;
type Contract54 = Assert<
	Equal<keyof Pick<Native0.WebStoragePersistenceOptions, PublishedKeys23>, PublishedKeys23>
>;
type Contract55 = Assert<
	Equal<keyof Pick<Native0.IndexedDBPersistenceOptions, PublishedKeys24>, PublishedKeys24>
>;
type Contract56 = Assert<Equal<Parameters<typeof Native0.fetchHttpStream>['length'], 1 | 2>>;
type Contract57 = Assert<Equal<Parameters<typeof Native0.xhrServerSentEvents>['length'], 1 | 2>>;
type Contract58 = Assert<Equal<Parameters<typeof Native0.xhrHttpStream>['length'], 1 | 2>>;
type Contract59 = Assert<Equal<Parameters<typeof Native0.stream>['length'], 1 | 2>>;
type Contract60 = Assert<Equal<Parameters<typeof Native0.rpcStream>['length'], 1 | 2>>;
type Contract61 = Assert<Equal<Parameters<typeof Native0.webSocket>['length'], 1 | 2>>;
type Contract62 = Assert<Equal<Parameters<typeof Native0.createChatClientOptions>['length'], 1>>;
type Contract63 = Assert<Equal<Parameters<typeof Native0.createMcpAppBridge>['length'], 1>>;
type Contract64 = Assert<Equal<keyof Pick<Native0.McpAppBridge, PublishedKeys25>, PublishedKeys25>>;
type Contract65 = Assert<
	Equal<keyof Pick<Native0.CreateMcpAppBridgeOptions, PublishedKeys0>, PublishedKeys0>
>;
type Contract66 = Assert<Equal<Parameters<Native0.ChatFetcher>['length'], 2>>;
type Contract67 = Assert<
	Equal<keyof Pick<Native0.ChatFetcherInput, PublishedKeys26>, PublishedKeys26>
>;
type Contract68 = Assert<
	Equal<keyof Pick<Native0.ChatFetcherOptions, PublishedKeys27>, PublishedKeys27>
>;
type Contract69 = Assert<
	Equal<keyof Pick<Native0.ConnectionAdapter, PublishedKeys28>, PublishedKeys28>
>;
type Contract70 = Assert<
	Equal<keyof Pick<Native0.ConnectConnectionAdapter, PublishedKeys29>, PublishedKeys29>
>;
type Contract71 = Assert<
	Equal<keyof Pick<Native0.SubscribeConnectionAdapter, PublishedKeys30>, PublishedKeys30>
>;
type Contract72 = Assert<
	Equal<keyof Pick<Native0.RunAgentInputContext, PublishedKeys31>, PublishedKeys31>
>;
type Contract73 = Assert<
	Equal<keyof Pick<Native0.FetchConnectionOptions, PublishedKeys32>, PublishedKeys32>
>;
type Contract74 = Assert<
	Equal<keyof Pick<Native0.XhrConnectionOptions, PublishedKeys33>, PublishedKeys33>
>;
type Contract75 = Assert<
	Equal<keyof Pick<Native0.WebSocketConnectionOptions, PublishedKeys34>, PublishedKeys34>
>;
type Contract76 = Assert<
	Equal<keyof Pick<Native0.InferChatMessages<{ sample: string }>, PublishedKeys35>, PublishedKeys35>
>;
type Contract77 = Assert<
	Equal<
		keyof Pick<
			Native0.GenericInterrupt<
				import('@tanstack/ai').InterruptDefinition<'sample', undefined, undefined>
			>,
			PublishedKeys36
		>,
		PublishedKeys36
	>
>;
type Contract78 = Assert<
	Equal<
		keyof Pick<Native0.RegisteredGenericInterrupt<readonly []>, PublishedKeys35>,
		PublishedKeys35
	>
>;
type Contract79 = Assert<
	Equal<keyof Pick<Native0.GenerationClientState, PublishedKeys9>, PublishedKeys9>
>;
type Contract80 = Assert<
	Equal<keyof Pick<Native0.ImageGenerateInput, PublishedKeys37>, PublishedKeys37>
>;
type Contract81 = Assert<
	Equal<keyof Pick<Native0.AudioGenerateInput, PublishedKeys38>, PublishedKeys38>
>;
type Contract82 = Assert<
	Equal<keyof Pick<Native0.SpeechGenerateInput, PublishedKeys39>, PublishedKeys39>
>;
type Contract83 = Assert<
	Equal<keyof Pick<Native0.TranscriptionGenerateInput, PublishedKeys40>, PublishedKeys40>
>;
type Contract84 = Assert<
	Equal<keyof Pick<Native0.SummarizeGenerateInput, PublishedKeys41>, PublishedKeys41>
>;
type Contract85 = Assert<
	Equal<keyof Pick<Native0.VideoGenerateInput, PublishedKeys42>, PublishedKeys42>
>;
type Contract86 = Assert<
	Equal<keyof Pick<Native0.VideoGenerateResult, PublishedKeys43>, PublishedKeys43>
>;
type Contract87 = Assert<
	Equal<keyof Pick<Native0.VideoStatusInfo, PublishedKeys44>, PublishedKeys44>
>;
type Contract88 = Assert<
	Equal<keyof Pick<Native1.MCPAppResourceProps, PublishedKeys45>, PublishedKeys45>
>;
type Contract89 = Assert<Equal<Parameters<typeof Native1.MCPAppResource>['length'], 1>>;
type Contract90 = Assert<Equal<Parameters<typeof Native2.createChatUI>['length'], 2>>;
type Contract91 = Assert<
	Equal<keyof Pick<Native2.ChatUIComponents<{ sample: string }>, PublishedKeys46>, PublishedKeys46>
>;
type Contract92 = Assert<
	Equal<
		keyof Pick<Native2.ChatUIFactoryConfig<{ sample: string }>, PublishedKeys47>,
		PublishedKeys47
	>
>;
type Contract93 = Assert<Equal<keyof Pick<Native2.ChatUIHost, PublishedKeys4>, PublishedKeys4>>;
type Contract94 = Assert<
	Equal<keyof Pick<Native2.ChatUIQueueItem, PublishedKeys48>, PublishedKeys48>
>;
type Contract95 = Assert<
	Equal<keyof Pick<Native2.InputProps<{ sample: string }>, PublishedKeys49>, PublishedKeys49>
>;
type Contract96 = Assert<
	Equal<keyof Pick<Native2.InterruptProps<{ sample: string }>, PublishedKeys50>, PublishedKeys50>
>;
type Contract97 = Assert<
	Equal<keyof Pick<Native2.LayoutProps<{ sample: string }>, PublishedKeys51>, PublishedKeys51>
>;
type Contract98 = Assert<
	Equal<keyof Pick<Native2.MessageProps<{ sample: string }>, PublishedKeys52>, PublishedKeys52>
>;
type Contract99 = Assert<
	Equal<keyof Pick<Native2.PartProps<{ sample: string }>, PublishedKeys53>, PublishedKeys53>
>;
type Contract100 = Assert<
	Equal<keyof Pick<Native2.QueueProps<{ sample: string }>, PublishedKeys54>, PublishedKeys54>
>;
type Contract101 = Assert<
	Equal<keyof Pick<Native2.ToolProps<{ sample: string }>, PublishedKeys55>, PublishedKeys55>
>;
type Contract102 = Assert<Equal<Parameters<typeof Native2.createChatHook>['length'], 1>>;
type Contract103 = Assert<Equal<Parameters<typeof Native2.createChatHookContexts>['length'], 0>>;
type Contract104 = Assert<
	Equal<keyof Pick<Native2.ChatUIContexts, PublishedKeys56>, PublishedKeys56>
>;
type Contract105 = Assert<Equal<Parameters<typeof Native2.Chat>['length'], 1>>;
type Contract106 = Assert<Equal<Parameters<typeof Native2.useChatContext>['length'], 0>>;
type Contract107 = Assert<Equal<keyof Pick<Native2.ChatProps, PublishedKeys57>, PublishedKeys57>>;
type Contract108 = Assert<Equal<Parameters<typeof Native2.ChatMessages>['length'], 1>>;
type Contract109 = Assert<
	Equal<keyof Pick<Native2.ChatMessagesProps, PublishedKeys58>, PublishedKeys58>
>;
type Contract110 = Assert<Equal<Parameters<typeof Native2.ChatMessage>['length'], 1>>;
type Contract111 = Assert<
	Equal<keyof Pick<Native2.ChatMessageProps, PublishedKeys59>, PublishedKeys59>
>;
type Contract112 = Assert<
	Equal<keyof Pick<Native2.ToolCallRenderProps, PublishedKeys60>, PublishedKeys60>
>;
type Contract113 = Assert<Equal<Parameters<typeof Native2.ChatInput>['length'], 1>>;
type Contract114 = Assert<
	Equal<keyof Pick<Native2.ChatInputProps, PublishedKeys61>, PublishedKeys61>
>;
type Contract115 = Assert<
	Equal<keyof Pick<Native2.ChatInputRenderProps, PublishedKeys62>, PublishedKeys62>
>;
type Contract116 = Assert<Equal<Parameters<typeof Native2.ToolApproval>['length'], 1>>;
type Contract117 = Assert<
	Equal<keyof Pick<Native2.ToolApprovalProps, PublishedKeys63>, PublishedKeys63>
>;
type Contract118 = Assert<
	Equal<keyof Pick<Native2.ToolApprovalRenderProps, PublishedKeys64>, PublishedKeys64>
>;
type Contract119 = Assert<Equal<Parameters<typeof Native2.TextPart>['length'], 1>>;
type Contract120 = Assert<
	Equal<keyof Pick<Native2.TextPartProps, PublishedKeys65>, PublishedKeys65>
>;
type Contract121 = Assert<Equal<Parameters<typeof Native2.ThinkingPart>['length'], 1>>;
type Contract122 = Assert<
	Equal<keyof Pick<Native2.ThinkingPartProps, PublishedKeys66>, PublishedKeys66>
>;
