import { useEffect, useRef } from 'octane';
import {
	createSignal,
	resolveProp,
	runOnce,
	scoped,
	Show,
	useProp,
	type Component,
} from '../../reactive.js';
import type { CompletionViewProps } from '../../types.js';
import { FEEDBACK_DURATION_MS, FADE_DURATION_MS } from '../../constants.js';
import { createConfirmationKeyboard } from '../../utils/create-confirmation-keyboard.js';
import { isEventFromOverlay } from '../../utils/is-event-from-overlay.js';
import { IconReturn } from '../icons/icon-return.tsrx';
import { IconEllipsis } from '../icons/icon-ellipsis.tsrx';
import { cn } from '../../utils/cn.js';
import { Button, buttonVariants } from '../ui/button.tsrx';
import { Surface } from '../ui/surface.tsrx';
import { IconCheck } from '../icons/icon-check.tsrx';

interface MoreOptionsButtonProps {
	onClick: () => void;
}

const MoreOptionsButton: Component<MoreOptionsButtonProps> = (props) => {
	return <button
		type="button"
		data-react-grab-ignore-events
		data-react-grab-more-options
		aria-label="More options"
		class={cn(
			buttonVariants({ variant: 'ghost' }),
			'group size-4 text-[var(--rg-text-secondary)] hover:text-[var(--rg-text-primary)]',
		)}
		// The on: prefix attaches a native event listener (rather than using
		// SolidJS delegation) so stopImmediatePropagation can beat both
		// delegated handlers and document-level capture listeners.
		onPointerDown={(event) => {
			event.stopImmediatePropagation();
		}}
		onClick={(event) => {
			event.stopImmediatePropagation();
			resolveProp(props.onClick)();
		}}
	>
		<IconEllipsis
			size={14}
			aria-hidden="true"
			class="opacity-50 group-hover:opacity-100 transition-opacity"
		/>
	</button>;
};

export const CompletionView = scoped<CompletionViewProps>((props) => {
	const fadeTimeoutId = useRef<number | undefined>(undefined);
	const dismissTimeoutId = useRef<number | undefined>(undefined);
	const [didCopy, setDidCopy] = createSignal(false);
	const [isFading, setIsFading] = createSignal(false);
	const displayStatusText = useProp(() => (didCopy() ? 'Copied' : resolveProp(props.statusText)));
	const fading = useProp(isFading);
	const copied = useProp(didCopy);

	const handleShowContextMenu = () => {
		if (fadeTimeoutId.current !== undefined) window.clearTimeout(fadeTimeoutId.current);
		if (dismissTimeoutId.current !== undefined) window.clearTimeout(dismissTimeoutId.current);
		setIsFading(true);
		resolveProp(props.onFadingChange)?.(true);
		resolveProp(props.onShowContextMenu)?.();
	};

	const handleAccept = () => {
		if (didCopy()) return;
		setDidCopy(true);
		fadeTimeoutId.current = window.setTimeout(() => {
			setIsFading(true);
			resolveProp(props.onFadingChange)?.(true);
			dismissTimeoutId.current = window.setTimeout(() => {
				resolveProp(props.onDismiss)?.();
			}, FADE_DURATION_MS);
		}, FEEDBACK_DURATION_MS - FADE_DURATION_MS);
	};

	const { claimFocus } = runOnce(
		() => createConfirmationKeyboard({
			onEnter: (event) => {
				if (isEventFromOverlay(event, 'data-react-grab-more-options')) {
					event.preventDefault();
					event.stopPropagation();
					handleShowContextMenu();
					return;
				}
				if (isEventFromOverlay(event, 'data-react-grab-context-menu')) return;
				event.preventDefault();
				event.stopPropagation();
				handleAccept();
			},
			onEscape: (event) => {
				event.preventDefault();
				event.stopPropagation();
				resolveProp(props.onDismiss)?.();
			},
		}),
	);

	useEffect(() => {
		return () => {
			if (fadeTimeoutId.current !== undefined) window.clearTimeout(fadeTimeoutId.current);
			if (dismissTimeoutId.current !== undefined) window.clearTimeout(dismissTimeoutId.current);
		};
	}, []);

	return <Surface
		shape="pill"
		data-react-grab-completion
		role="status"
		aria-live="polite"
		aria-atomic="true"
		class="shrink-0 flex flex-col justify-center items-end w-fit h-fit max-w-[280px] transition-opacity duration-100 ease-out"
		style={{ opacity: fading ? 0 : 1 }}
		onPointerDown={claimFocus}
		onClick={claimFocus}
	>
		<Show when={() => !copied && Boolean(resolveProp(props.onDismiss))}>
			<div
				class="contain-layout shrink-0 flex items-center justify-between gap-2 pt-1.5 pb-1 px-2 w-full h-fit"
			>
				<span
					class="text-[var(--rg-text-primary)] text-[13px] leading-4 font-sans font-medium h-fit tabular-nums overflow-hidden text-ellipsis whitespace-nowrap min-w-0"
				>{displayStatusText}</span>
				<div class="contain-layout shrink-0 flex items-center gap-2 h-fit">
					<Show when={() => Boolean(resolveProp(props.onShowContextMenu))}>
						<MoreOptionsButton onClick={handleShowContextMenu} />
					</Show>
					<Show when={() => Boolean(resolveProp(props.onDismiss))}>
						<Button
							data-react-grab-dismiss
							class="gap-1"
							aria-keyshortcuts="Enter"
							onClick={handleAccept}
							disabled={copied}
							aria-disabled={copied}
						>
							<span
								class="text-[var(--rg-text-primary)] text-[13px] leading-3.5 font-sans font-medium"
							>
								Keep
							</span>
							<Show when={!copied}>
								<IconReturn size={10} class="text-[var(--rg-text-secondary)]" />
							</Show>
						</Button>
					</Show>
				</div>
			</div>
		</Show>
		<Show when={() => copied || !resolveProp(props.onDismiss)}>
			<div class="contain-layout shrink-0 flex items-center gap-0.5 py-1.5 px-2 w-full h-fit">
				<IconCheck size={14} aria-hidden="true" class="text-[var(--rg-text-primary-85)] shrink-0" />
				<span
					class="text-[var(--rg-text-primary)] text-[13px] leading-4 font-sans font-medium h-fit tabular-nums overflow-hidden text-ellipsis whitespace-nowrap min-w-0"
				>{displayStatusText}</span>
				<Show when={() => Boolean(resolveProp(props.onShowContextMenu))}>
					<MoreOptionsButton onClick={handleShowContextMenu} />
				</Show>
			</div>
		</Show>
	</Surface>;
});
