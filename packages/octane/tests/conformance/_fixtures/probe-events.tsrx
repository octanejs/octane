// TEMPORARY probe fixture — will be deleted/replaced.
export function NonBubbling(props: {
	log: (s: string) => void;
}) @{
	<div class="anc" onToggle={() => props.log('anc-toggle')} onPlay={() => props.log('anc-play')} onClose={() => props.log('anc-close')}>
		<details class="det" onToggle={() => props.log('det-toggle')}>{'d'}</details>
		<video class="vid" onPlay={() => props.log('vid-play')}></video>
		<dialog class="dlg" onClose={() => props.log('dlg-close')}></dialog>
	</div>
}

export function InvalidBubbles(props: { log: (s: string) => void }) @{
	<form class="frm" onInvalid={() => props.log('form-invalid')}>
		<input class="inp" onInvalid={() => props.log('input-invalid')} />
	</form>
}

export function ScrollTree(props: { log: (s: string) => void }) @{
	<div
		class="grand"
		onScroll={(e) => props.log('bubble:' + (e.currentTarget as Element).className)}
		onScrollCapture={(e) => props.log('capture:' + (e.currentTarget as Element).className)}
	>
		<div
			class="parent"
			onScroll={(e) => props.log('bubble:' + (e.currentTarget as Element).className)}
			onScrollCapture={(e) => props.log('capture:' + (e.currentTarget as Element).className)}
		>
			<div
				class="child"
				onScroll={(e) => props.log('bubble:' + (e.currentTarget as Element).className)}
				onScrollCapture={(e) => props.log('capture:' + (e.currentTarget as Element).className)}
			>{'c'}</div>
		</div>
	</div>
}

export function ThrowingChain(props: { log: (s: string) => void }) @{
	<div class="g" onClick={() => props.log('g')}>
		<div class="p" onClick={() => { props.log('p'); throw new Error('Handler interrupted'); }}>
			<div class="c" onClick={() => props.log('c')}>{'x'}</div>
		</div>
	</div>
}

export function BadListener(props: { log: (s: string) => void; bad: any }) @{
	<div class="anc" onClick={() => props.log('anc')}>
		<div class="target" onClick={props.bad}>{'x'}</div>
	</div>
}

export function CaptureNonBubbling(props: { log: (s: string) => void }) @{
	<div class="outer" onPlayCapture={(e) => props.log('cap:outer')}>
		<div class="mid" onPlayCapture={(e) => props.log('cap:mid')}>
			<div class="inner" onPlayCapture={(e) => props.log('cap:inner')}>{'x'}</div>
		</div>
	</div>
}
