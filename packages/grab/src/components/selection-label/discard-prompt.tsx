/** @jsxImportSource octane */
import { useEffect, useMemo, useRef } from 'octane';
import type { DiscardPromptProps } from '../../types.js';
import { createConfirmationKeyboard } from '../../utils/create-confirmation-keyboard.js';
import { IconReturn } from '../icons/icon-return.jsx';
import { Button } from '../ui/button.js';
import { BottomSection } from './bottom-section.js';

export const DiscardPrompt = (props: DiscardPromptProps) => {
	const shouldShowCancel = () => props.showCancel ?? true;

	// React props are per-render objects, so route the long-lived keyboard
	// handlers through a ref that always holds the latest callbacks.
	const latestRef = useRef(props);
	latestRef.current = props;

	const controller = useMemo(
		() =>
			createConfirmationKeyboard({
				onEnter: (event) => {
					event.preventDefault();
					event.stopPropagation();
					const target = event.composedPath()[0];
					const targetElement = target instanceof HTMLElement ? target : null;
					if (targetElement?.closest('[data-react-grab-discard-copy]')) {
						latestRef.current.onCopy?.();
						return;
					}
					if (targetElement?.closest('[data-react-grab-discard-no]')) {
						latestRef.current.onCancel?.();
						return;
					}
					latestRef.current.onConfirm?.();
				},
				onEscape: (event) => {
					event.preventDefault();
					event.stopPropagation();
					// Escape confirms the discard by default ("yes, throw it away") rather
					// than canceling, which is intentionally opposite to most dialogs. The
					// cancelOnEscape prop flips this when the prompt itself should be
					// dismissible.
					if (latestRef.current.cancelOnEscape) {
						latestRef.current.onCancel?.();
					} else {
						latestRef.current.onConfirm?.();
					}
				},
			}),
		[],
	);
	const claimFocus = controller.claimFocus;
	useEffect(() => controller.register(), []);

	return (
		<div
			data-react-grab-discard-prompt
			class="contain-layout shrink-0 flex flex-col justify-center items-end w-fit h-fit"
			onPointerDown={claimFocus}
			onClick={claimFocus}
		>
			<div class="contain-layout shrink-0 flex items-center gap-1 pt-1.5 pb-1 px-2 w-full h-fit">
				<span class="text-[var(--rg-text-primary)] text-[13px] leading-4 shrink-0 font-sans font-medium w-fit h-fit">
					{(props.label ?? 'Discard?') as string}
				</span>
			</div>
			<BottomSection>
				<div class="contain-layout shrink-0 flex items-center justify-end gap-[5px] w-full h-fit">
					{shouldShowCancel() && (
						<Button data-react-grab-discard-no onClick={props.onCancel}>
							<span class="text-[var(--rg-text-primary)] text-[13px] leading-3.5 font-sans font-medium">
								No
							</span>
						</Button>
					)}
					{props.onCopy && (
						<Button data-react-grab-discard-copy onClick={props.onCopy}>
							<span class="text-[var(--rg-text-primary)] text-[13px] leading-3.5 font-sans font-medium">
								Copy
							</span>
						</Button>
					)}
					<Button
						variant="destructive"
						class="gap-0.5"
						data-react-grab-discard-yes
						onClick={props.onConfirm}
					>
						<span class="text-[var(--rg-error-text)] text-[13px] leading-3.5 font-sans font-medium">
							Yes
						</span>
						<IconReturn size={10} class="text-[var(--rg-error-text)] opacity-50" />
					</Button>
				</div>
			</BottomSection>
		</div>
	);
};
