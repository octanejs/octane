import type { CSSProperties } from 'octane';
import type { PrimaryActionSnapshot } from './primary-action-state.ts';

export function PrimaryAction(snapshot: PrimaryActionSnapshot) @{
	'use dom bindings';
	<button
		id="primary-action"
		type={snapshot.type}
		disabled={snapshot.disabled}
		aria-disabled={snapshot.visuallyDisabled}
		aria-label={snapshot.label}
		data-stop-generating={snapshot.stopRequested ? '' : null}
		data-visually-disabled={snapshot.visuallyDisabled ? '' : null}
		class={['primary-action', snapshot.active ? 'active' : 'ready']}
		style={{
			opacity: snapshot.visuallyDisabled ? 0.5 : 1,
			'--action-tone': snapshot.tone,
		} as CSSProperties & { '--action-tone': string }}
	>
		<span data-send-icon hidden={snapshot.active}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 4v16m-6-10 6-6 6 6" />
			</svg>
		</span>
		<span data-stop-icon hidden={!snapshot.active}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M6 6h12v12H6z" />
			</svg>
		</span>
	</button>
}
