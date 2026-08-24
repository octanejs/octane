import {
	StickToBottom,
	useStickToBottomContext,
	type StickToBottomContext,
} from '@octanejs/stick-to-bottom';

export function HookProbe() @{
	useStickToBottomContext();
	<div />
}

export function StickProbe() @{
	<StickToBottom style={{ height: '80px' }}>
		<StickToBottom.Content scrollClassName="scroll" data-content="">
			<div>hello</div>
		</StickToBottom.Content>
	</StickToBottom>
}

export function RenderPropStickProbe() @{
	<StickToBottom style={{ height: '80px' }}>
		{(context: StickToBottomContext) => <StickToBottom.Content
			scrollClassName="scroll"
			data-content=""
		>
			<div>
				{context.isAtBottom ? 'bottom' : 'away'}
			</div>
		</StickToBottom.Content>}
	</StickToBottom>
}

export function ContentRenderPropStickProbe() @{
	<StickToBottom style={{ height: '80px' }}>
		<StickToBottom.Content scrollClassName="scroll" data-content="">
			{(context: StickToBottomContext) => <div>
				{context.isAtBottom ? 'content-bottom' : 'content-away'}
			</div>}
		</StickToBottom.Content>
	</StickToBottom>
}
