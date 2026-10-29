// Ported from react-hot-toast@2.6.1 src/components/toast-icon.tsx
// (https://github.com/timolins/react-hot-toast/tree/v2.6.1).
//
// Octane adaptations: goober's styled('div') becomes styledDiv, templates carry
// the published build's collapsed whitespace (see styled.tsrx), and the
// conditional status icon is an @if block.
import { keyframes } from '../goober.js';
import type { Toast } from '../core/types';
import { type CheckmarkTheme, CheckmarkIcon } from './checkmark';
import { type ErrorTheme, ErrorIcon } from './error';
import { type LoaderTheme, LoaderIcon } from './loader';
import { styledDiv } from './styled.tsrx';

const StatusWrapper = styledDiv` position: absolute; `;

const IndicatorWrapper = styledDiv` position: relative; display: flex; justify-content: center; align-items: center; min-width: 20px; min-height: 20px; `;

const enter = keyframes` from { transform: scale(0.6); opacity: 0.4; } to { transform: scale(1); opacity: 1; }`;

export const AnimatedIconWrapper = styledDiv` position: relative; transform: scale(0.6); opacity: 0.4; min-width: 20px; animation: ${enter} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; `;

export type IconThemes = Partial<{
	success: CheckmarkTheme;
	error: ErrorTheme;
	loading: LoaderTheme;
}>;

export function ToastIcon(props: { toast: Toast }) @{
	const { icon, type, iconTheme } = props.toast;
	if (icon !== undefined) {
		if (typeof icon === 'string') {
			return <AnimatedIconWrapper>{icon as string}</AnimatedIconWrapper>;
		} else {
			return icon;
		}
	}

	if (type === 'blank') {
		return null;
	}

	<IndicatorWrapper>
		<LoaderIcon {...iconTheme} />
		@if (type !== 'loading') {
			<StatusWrapper>
				@if (type === 'error') {
					<ErrorIcon {...iconTheme} />
				} @else {
					<CheckmarkIcon {...iconTheme} />
				}
			</StatusWrapper>
		}
	</IndicatorWrapper>
}
