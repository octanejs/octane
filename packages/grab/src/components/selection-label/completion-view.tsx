/** @jsxImportSource octane */
import { useEffect, useMemo, useRef, useState } from 'octane';
import type { CompletionViewProps } from '../../types.js';
import { FEEDBACK_DURATION_MS, FADE_DURATION_MS } from '../../constants.js';
import { createConfirmationKeyboard } from '../../utils/create-confirmation-keyboard.js';
import { isEventFromOverlay } from '../../utils/is-event-from-overlay.js';
import { IconReturn } from '../icons/icon-return.jsx';
import { IconEllipsis } from '../icons/icon-ellipsis.jsx';
import { cn } from '../../utils/cn.js';
import { Button, buttonVariants } from '../ui/button.js';
import { Surface } from '../ui/surface.js';
import { IconCheck } from '../icons/icon-check.jsx';

interface MoreOptionsButtonProps {
	onClick: () => void;
}

const MoreOptionsButton = (props: MoreOptionsButtonProps) => {
	return (
		<button
			type="button"
			data-react-grab-ignore-events
			data-react-grab-more-options
			aria-label="More options"
			class={cn(
				buttonVariants({ variant: 'ghost' }),
				'group size-4 text-[var(--rg-text-secondary)] hover:text-[var(--rg-text-primary)]',
			)}
			// stopImmediatePropagation beats both the delegated handlers and any
			// document-level capture listeners for this pointerdown/click.
			onPointerDown={(event) => {
				event.stopImmediatePropagation();
			}}
			onClick={(event) => {
				event.stopImmediatePropagation();
				props.onClick();
			}}
		>
			<IconEllipsis
				size={14}
				aria-hidden="true"
				class="opacity-50 group-hover:opacity-100 transition-opacity"
			/>
		</button>
	);
};

export const CompletionView = (props: CompletionViewProps) => {
	const fadeTimeoutRef = useRef<number | undefined>(undefined);
	const dismissTimeoutRef = useRef<number | undefined>(undefined);
	const [didCopy, setDidCopy, getDidCopy] = useState(false);
	const [isFading, setIsFading] = useState(false);
	const displayStatusText = () => (didCopy ? 'Copied' : props.statusText);

	const handleShowContextMenu = () => {
		if (fadeTimeoutRef.current !== undefined) window.clearTimeout(fadeTimeoutRef.current);
		if (dismissTimeoutRef.current !== undefined) window.clearTimeout(dismissTimeoutRef.current);
		setIsFading(true);
		props.onFadingChange?.(true);
		props.onShowContextMenu?.();
	};

	const handleAccept = () => {
		if (getDidCopy()) return;
		setDidCopy(true);
		fadeTimeoutRef.current = window.setTimeout(() => {
			setIsFading(true);
			props.onFadingChange?.(true);
			dismissTimeoutRef.current = window.setTimeout(() => {
				props.onDismiss?.();
			}, FADE_DURATION_MS);
		}, FEEDBACK_DURATION_MS - FADE_DURATION_MS);
	};

	// The keyboard controller outlives individual renders, so route its handlers
	// through a ref that always holds the latest closures.
	const latestRef = useRef({ handleShowContextMenu, handleAccept, onDismiss: props.onDismiss });
	latestRef.current = { handleShowContextMenu, handleAccept, onDismiss: props.onDismiss };

	const controller = useMemo(
		() =>
			createConfirmationKeyboard({
				onEnter: (event) => {
					if (isEventFromOverlay(event, 'data-react-grab-more-options')) {
						event.preventDefault();
						event.stopPropagation();
						latestRef.current.handleShowContextMenu();
						return;
					}
					if (isEventFromOverlay(event, 'data-react-grab-context-menu')) return;
					event.preventDefault();
					event.stopPropagation();
					latestRef.current.handleAccept();
				},
				onEscape: (event) => {
					event.preventDefault();
					event.stopPropagation();
					latestRef.current.onDismiss?.();
				},
			}),
		[],
	);
	const claimFocus = controller.claimFocus;

	useEffect(() => {
		const unregister = controller.register();
		return () => {
			unregister();
			if (fadeTimeoutRef.current !== undefined) window.clearTimeout(fadeTimeoutRef.current);
			if (dismissTimeoutRef.current !== undefined) window.clearTimeout(dismissTimeoutRef.current);
		};
	}, []);

	return (
		<Surface
			shape="pill"
			data-react-grab-completion
			role="status"
			aria-live="polite"
			aria-atomic="true"
			class="shrink-0 flex flex-col justify-center items-end w-fit h-fit max-w-[280px] transition-opacity duration-100 ease-out"
			style={{ opacity: isFading ? 0 : 1 }}
			onPointerDown={claimFocus}
			onClick={claimFocus}
		>
			{!didCopy && props.onDismiss && (
				<div class="contain-layout shrink-0 flex items-center justify-between gap-2 pt-1.5 pb-1 px-2 w-full h-fit">
					<span class="text-[var(--rg-text-primary)] text-[13px] leading-4 font-sans font-medium h-fit tabular-nums overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
						{displayStatusText() as string}
					</span>
					<div class="contain-layout shrink-0 flex items-center gap-2 h-fit">
						{props.onShowContextMenu && <MoreOptionsButton onClick={handleShowContextMenu} />}
						{/* onDismiss is already guaranteed by the enclosing `props.onDismiss &&`. */}
						<Button
							data-react-grab-dismiss
							class="gap-1"
							aria-keyshortcuts="Enter"
							onClick={handleAccept}
							disabled={didCopy}
							aria-disabled={didCopy}
						>
							<span class="text-[var(--rg-text-primary)] text-[13px] leading-3.5 font-sans font-medium">
								Keep
							</span>
							{!didCopy && <IconReturn size={10} class="text-[var(--rg-text-secondary)]" />}
						</Button>
					</div>
				</div>
			)}
			{(didCopy || !props.onDismiss) && (
				<div class="contain-layout shrink-0 flex items-center gap-0.5 py-1.5 px-2 w-full h-fit">
					<IconCheck
						size={14}
						aria-hidden="true"
						class="text-[var(--rg-text-primary-85)] shrink-0"
					/>
					<span class="text-[var(--rg-text-primary)] text-[13px] leading-4 font-sans font-medium h-fit tabular-nums overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
						{displayStatusText() as string}
					</span>
					{props.onShowContextMenu && <MoreOptionsButton onClick={handleShowContextMenu} />}
				</div>
			)}
		</Surface>
	);
};
