import { useEffect, useRef } from 'octane';
import { createMemo, createSignal, resolveProp, scoped, Show, useProp } from '../../reactive.js';
import type { ArrowPosition, SelectionLabelProps, SelectionDiscardPrompt } from '../../types.js';
import {
	FADE_DURATION_MS,
	PANEL_SHADOW,
	VIEWPORT_MARGIN_PX,
	ARROW_CENTER_PERCENT,
	ARROW_LABEL_MARGIN_PX,
	LABEL_GAP_PX,
	SELECTION_LABEL_OFFSCREEN_PX,
	TEXTAREA_MAX_HEIGHT_PX,
	Z_INDEX_OVERLAY,
} from '../../constants.js';
import { autoResizeTextarea } from '../../utils/auto-resize-textarea.js';
import { focusInOverlay } from '../../utils/focus-in-overlay.js';
import { getArrowSize } from '../../utils/get-arrow-size.js';
import { getVisualViewport } from '../../utils/get-visual-viewport.js';
import { isKeyboardEventComposing } from '../../utils/is-keyboard-event-composing.js';
import { getScopeContainer } from '../../utils/runtime-mode.js';
import { cn } from '../../utils/cn.js';
import { getTagDisplay } from '../../utils/get-tag-display.js';
import { IconSubmit } from '../icons/icon-submit.tsrx';
import { IconLoader } from '../icons/icon-loader.tsrx';
import { Arrow } from './arrow.tsrx';
import { TagBadge } from './tag-badge.tsrx';
import { BottomSection } from './bottom-section.tsrx';
import { Surface } from '../ui/surface.tsrx';
import { DiscardPrompt } from './discard-prompt.tsrx';
import { ErrorView } from './error-view.tsrx';
import { CompletionView } from './completion-view.tsrx';

interface LabelPosition {
	left: number;
	top: number;
	arrowLeftPercent: number;
	arrowLeftOffset: number;
	edgeOffsetX: number;
}

const DEFAULT_OFFSCREEN_POSITION: LabelPosition = {
	left: SELECTION_LABEL_OFFSCREEN_PX,
	top: SELECTION_LABEL_OFFSCREEN_PX,
	arrowLeftPercent: ARROW_CENTER_PERCENT,
	arrowLeftOffset: 0,
	edgeOffsetX: 0,
};

interface PositionResult {
	position: LabelPosition;
	computedArrowPosition: ArrowPosition | null;
	hadValidBounds: boolean;
	elementIdentity: string;
}

export const SelectionLabel = scoped<SelectionLabelProps>((props) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const panelRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const isTagCurrentlyHovered = useRef(false);

	const [measuredWidth, setMeasuredWidth] = createSignal(0);
	const [measuredHeight, setMeasuredHeight] = createSignal(0);
	const [panelWidth, setPanelWidth] = createSignal(0);
	const [viewportVersion, setViewportVersion] = createSignal(0);
	const [isInternalFading, setIsInternalFading] = createSignal(false);
	const [isShaking, setIsShaking] = createSignal(false);

	const canInteract = () => {
		const status = resolveProp(props.status);
		return status !== 'copying' && status !== 'copied' && status !== 'fading' && status !== 'error';
	};

	const isCompletedStatus = () => {
		const status = resolveProp(props.status);
		return status === 'copied' || status === 'fading';
	};

	const shouldEnablePointerEvents = (): boolean => {
		if (resolveProp(props.isPromptMode)) return true;
		if (resolveProp(props.discardPrompt)) return true;
		if (
			isCompletedStatus() && (resolveProp(props.onDismiss) || resolveProp(props.onShowContextMenu))
		) {
			return true;
		}
		if (
			resolveProp(props.status) === 'error' &&
				(resolveProp(props.onAcknowledgeError) || resolveProp(props.onRetry))
		) {
			return true;
		}
		return false;
	};

	const handleTagHoverChange = (hovered: boolean) => {
		isTagCurrentlyHovered.current = hovered;
	};

	const handleViewportChange = () => {
		setViewportVersion((version) => version + 1);
	};

	useEffect(() => {
		const scopeContainer = getScopeContainer();
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const rect = entry.target.getBoundingClientRect();
				// Updates are skipped during tag hover to prevent a feedback loop
				// where hover changes the size, the size shifts the position, and the
				// shifted position changes what the cursor is over.
				if (entry.target === containerRef.current && !isTagCurrentlyHovered.current) {
					setMeasuredWidth(rect.width);
					setMeasuredHeight(rect.height);
				} else if (entry.target === panelRef.current) {
					setPanelWidth(rect.width);
				} else if (entry.target === scopeContainer) {
					// Scoped instances clamp to the container's box, so its resizes must
					// invalidate the position like a window resize does.
					handleViewportChange();
				}
			}
		});
		if (scopeContainer) resizeObserver.observe(scopeContainer);
		if (containerRef.current) {
			const rect = containerRef.current.getBoundingClientRect();
			setMeasuredWidth(rect.width);
			setMeasuredHeight(rect.height);
			resizeObserver.observe(containerRef.current);
		}
		if (panelRef.current) {
			setPanelWidth(panelRef.current.getBoundingClientRect().width);
			resizeObserver.observe(panelRef.current);
		}
		window.addEventListener('scroll', handleViewportChange, true);
		window.addEventListener('resize', handleViewportChange);
		window.visualViewport?.addEventListener('resize', handleViewportChange);
		window.visualViewport?.addEventListener('scroll', handleViewportChange);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener('scroll', handleViewportChange, true);
			window.removeEventListener('resize', handleViewportChange);
			window.visualViewport?.removeEventListener('resize', handleViewportChange);
			window.visualViewport?.removeEventListener('scroll', handleViewportChange);
		};
	}, []);

	const elementIdentity = () => `${resolveProp(props.tagName) ?? ''}:${
		resolveProp(props.componentName) ?? ''
	}`;

	// This reducer-style memo preserves position state across reactive updates,
	// resetting to offscreen on element identity change and keeping the last
	// good position when measurements briefly fail (via hadValidBounds). It
	// replaces an earlier anti-pattern of deriving state via effects.
	// @see https://github.com/aidenybai/react-grab/pull/245
	const positionComputation = createMemo((previousResult: PositionResult): PositionResult => {
		viewportVersion();
		const currentElementIdentity = elementIdentity();
		const didReset = currentElementIdentity !== previousResult.elementIdentity;
		const cached: PositionResult =
			didReset
				? {
						position: DEFAULT_OFFSCREEN_POSITION,
						computedArrowPosition: null,
						hadValidBounds: false,
						elementIdentity: currentElementIdentity,
					}
				: previousResult;

		const bounds = resolveProp(props.selectionBounds);
		const labelWidth = measuredWidth();
		const labelHeight = measuredHeight();
		const hasMeasurements = labelWidth > 0 && labelHeight > 0;
		const hasValidBounds = bounds && bounds.width > 0 && bounds.height > 0;

		if (!hasMeasurements || !hasValidBounds) {
			return {
				position: cached.hadValidBounds ? cached.position : DEFAULT_OFFSCREEN_POSITION,
				computedArrowPosition: cached.computedArrowPosition,
				hadValidBounds: cached.hadValidBounds,
				elementIdentity: currentElementIdentity,
			};
		}

		// Scope-aware: inside a scoped instance (demo showcases) the container's
		// box is the viewport, so the label stays within the showcase card
		// instead of spilling over the host page.
		const viewport = getVisualViewport();
		const viewportLeft = viewport.offsetLeft;
		const viewportTop = viewport.offsetTop;
		const viewportRight = viewportLeft + viewport.width;
		const viewportBottom = viewportTop + viewport.height;

		const isSelectionVisibleInViewport =
			bounds.x + bounds.width > viewportLeft && bounds.x < viewportRight &&
				bounds.y + bounds.height > viewportTop &&
				bounds.y < viewportBottom;

		if (!isSelectionVisibleInViewport) {
			return {
				position: DEFAULT_OFFSCREEN_POSITION,
				computedArrowPosition: cached.computedArrowPosition,
				hadValidBounds: cached.hadValidBounds,
				elementIdentity: currentElementIdentity,
			};
		}

		const selectionCenterX = bounds.x + bounds.width / 2;
		const cursorX = resolveProp(props.mouseX) ?? selectionCenterX;
		const selectionBottom = bounds.y + bounds.height;
		const selectionTop = bounds.y;

		const actualArrowHeight =
			resolveProp(props.hideArrow) ? 0 : getArrowSize(panelWidth());

		// The label is cursor-anchored: left stays at cursorX and
		// translateX(-50%) handles centering, so width changes from component
		// name resolution or status updates never shift the anchor point.
		// When the label would overflow the viewport, edgeOffsetX is added to
		// the transform to push it back on-screen without moving left.
		const anchorX = cursorX;
		let edgeOffsetX = 0;
		let positionTop = selectionBottom + actualArrowHeight + LABEL_GAP_PX;

		const labelLeft = anchorX - labelWidth / 2;
		const labelRight = anchorX + labelWidth / 2;

		if (labelRight > viewportRight - VIEWPORT_MARGIN_PX) {
			edgeOffsetX = viewportRight - VIEWPORT_MARGIN_PX - labelRight;
		}
		if (labelLeft + edgeOffsetX < viewportLeft + VIEWPORT_MARGIN_PX) {
			edgeOffsetX = viewportLeft + VIEWPORT_MARGIN_PX - labelLeft;
		}

		const totalHeightNeeded = labelHeight + actualArrowHeight + LABEL_GAP_PX;
		const fitsBelow = positionTop + labelHeight <= viewportBottom - VIEWPORT_MARGIN_PX;

		if (!fitsBelow) {
			positionTop = selectionTop - totalHeightNeeded;
		}

		if (positionTop < viewportTop + VIEWPORT_MARGIN_PX) {
			positionTop = viewportTop + VIEWPORT_MARGIN_PX;
		}

		const labelHalfWidth = labelWidth / 2;
		const arrowCenterPx = labelHalfWidth - edgeOffsetX;
		const arrowMinPx = Math.min(ARROW_LABEL_MARGIN_PX, labelHalfWidth);
		const arrowMaxPx = Math.max(labelWidth - ARROW_LABEL_MARGIN_PX, labelHalfWidth);
		const clampedArrowCenterPx = Math.max(arrowMinPx, Math.min(arrowMaxPx, arrowCenterPx));
		const arrowLeftOffset = clampedArrowCenterPx - labelHalfWidth;

		const computedArrowPosition: ArrowPosition = fitsBelow ? 'bottom' : 'top';

		return {
			position: {
				left: anchorX,
				top: positionTop,
				arrowLeftPercent: ARROW_CENTER_PERCENT,
				arrowLeftOffset,
				edgeOffsetX,
			},
			computedArrowPosition,
			hadValidBounds: true,
			elementIdentity: currentElementIdentity,
		};
	}, {
		position: DEFAULT_OFFSCREEN_POSITION,
		computedArrowPosition: null,
		hadValidBounds: false,
		elementIdentity: '',
	} satisfies PositionResult);

	const arrowPosition = () => positionComputation().computedArrowPosition ?? 'bottom';
	const hadValidBounds = () => positionComputation().hadValidBounds;

	const shakeCount = useProp(props.selectionLabelShakeCount);
	const didShake = useRef(false);
	useEffect(() => {
		// `defer: true` parity: the initial mount value must not trigger a shake.
		if (!didShake.current) {
			didShake.current = true;
			return;
		}
		setIsShaking(true);
	}, [shakeCount]);

	const handleKeyDown = (event: KeyboardEvent) => {
		if (isKeyboardEventComposing(event)) {
			return;
		}

		event.stopImmediatePropagation();

		const isEnterWithoutShift = event.code === 'Enter' && !event.shiftKey;
		const isEscape = event.code === 'Escape';

		if (isEnterWithoutShift) {
			event.preventDefault();
			resolveProp(props.onSubmit)?.();
		} else if (isEscape) {
			event.preventDefault();
			resolveProp(props.onConfirmDismiss)?.();
		}
	};

	const handleInput = (event: InputEvent) => {
		const inputTarget = event.target;
		if (!(inputTarget instanceof HTMLTextAreaElement)) {
			return;
		}
		autoResizeTextarea(inputTarget, TEXTAREA_MAX_HEIGHT_PX);
		resolveProp(props.onInputChange)?.(inputTarget.value);
	};

	const tagDisplayResult = useProp(
		() => getTagDisplay({
			tagName: resolveProp(props.tagName),
			componentName: resolveProp(props.componentName),
			elementsCount: resolveProp(props.elementsCount),
		}),
	);

	const isSinglePanelLine = createMemo(() => {
		if (resolveProp(props.error) || resolveProp(props.discardPrompt)) return false;
		if (canInteract() && resolveProp(props.isPromptMode)) return false;
		return true;
	});

	const handleTagClick = (event: MouseEvent) => {
		event.stopImmediatePropagation();
		if (resolveProp(props.filePath) && resolveProp(props.onOpen)) {
			resolveProp(props.onOpen)?.();
		}
	};

	const handleContainerPointerDown = (event: PointerEvent) => {
		event.stopImmediatePropagation();
		const isEditableInputVisible =
			canInteract() && resolveProp(props.isPromptMode) && !resolveProp(props.discardPrompt) &&
				resolveProp(props.onSubmit);
		if (isEditableInputVisible && inputRef.current) {
			focusInOverlay(inputRef.current, { preventScroll: true });
		}
	};

	const shouldPersistDuringFade = () =>
		hadValidBounds() && (isCompletedStatus() || resolveProp(props.status) === 'error');

	const positionComputationValue = useProp(positionComputation);
	const pointerEvents = useProp(() => (shouldEnablePointerEvents() ? 'auto' : 'none'));
	const status = useProp(props.status);
	const internalFading = useProp(isInternalFading);
	const shaking = useProp(isShaking);
	const singlePanelLine = useProp(isSinglePanelLine);
	const statusText = useProp(props.statusText);
	const error = useProp(props.error);
	const visible = useProp(props.visible);
	const selectionBounds = useProp(props.selectionBounds);
	const hideArrow = useProp(props.hideArrow);
	const isPromptMode = useProp(props.isPromptMode);
	const discardPrompt = useProp(props.discardPrompt);
	const inputValue = useProp(props.inputValue);
	const onSubmit = useProp(() => Boolean(resolveProp(props.onSubmit)));
	const filePath = useProp(props.filePath);
	const hasOpen = useProp(() => Boolean(resolveProp(props.onOpen)));
	const completed = useProp(() => isCompletedStatus());
	const interactive = useProp(() => canInteract());
	const arrowPos = useProp(arrowPosition);
	const panelW = useProp(panelWidth);

	const shouldShow = () => visible !== false && (selectionBounds || shouldPersistDuringFade());

	return <Show when={() => shouldShow()}>
		<div
			ref={(element) => {
				containerRef.current = element;
			}}
			data-react-grab-ignore-events
			data-react-grab-selection-label
			class="fixed font-sans text-[13px] antialiased select-none"
			style={{
				top: `${positionComputationValue.position.top}px`,
				left: `${positionComputationValue.position.left}px`,
				transform: `translateX(calc(-50% + ${positionComputationValue.position.edgeOffsetX}px))`,
				zIndex: `${Z_INDEX_OVERLAY}`,
				pointerEvents,
				transition: `opacity ${FADE_DURATION_MS}ms ease-out, filter ${FADE_DURATION_MS}ms ease-out`,
				opacity: status === 'fading' || internalFading ? 0 : 1,
				filter: `drop-shadow(${PANEL_SHADOW}) blur(${
					status === 'fading' || internalFading ? '3px' : '0'
				})`,
			}}
			onPointerDown={handleContainerPointerDown}
			onClick={(event) => {
				event.stopImmediatePropagation();
			}}
			onMouseEnter={() => resolveProp(props.onHoverChange)?.(true)}
			onMouseLeave={() => resolveProp(props.onHoverChange)?.(false)}
		>
			<Show when={!hideArrow}>
				<Arrow
					position={arrowPos}
					leftPercent={positionComputationValue.position.arrowLeftPercent}
					leftOffsetPx={positionComputationValue.position.arrowLeftOffset}
					labelWidth={panelW}
				/>
			</Show>

			<Show when={completed && !error}>
				<CompletionView
					statusText={statusText ?? 'Copied'}
					onDismiss={props.onDismiss}
					onFadingChange={setIsInternalFading}
					onShowContextMenu={props.onShowContextMenu}
				/>
			</Show>

			<Surface
				ref={(element: HTMLDivElement | null) => {
					panelRef.current = element;
				}}
				shape={singlePanelLine ? 'pill' : 'panel'}
				class={cn('flex items-center gap-[5px] w-fit h-fit p-0', shaking && 'animate-shake')}
				style={{
					display: completed && !error ? 'none' : undefined,
				}}
				onAnimationEnd={() => setIsShaking(false)}
			>
				<Show when={status === 'copying'}>
					<div
						class="contain-layout shrink-0 flex flex-col justify-center items-start w-fit h-fit max-w-[280px]"
					>
						<div class="contain-layout shrink-0 flex items-center gap-1 py-1.5 px-2 w-full h-fit">
							<IconLoader size={13} class="text-[var(--rg-text-secondary)] shrink-0" />
							<span
								class="shimmer-text text-[13px] leading-4 font-sans font-medium h-fit tabular-nums overflow-hidden text-ellipsis whitespace-nowrap"
							>
								{statusText ?? 'Grabbing…'}
							</span>
						</div>
					</div>
				</Show>

				<Show when={interactive && !isPromptMode && !discardPrompt}>
					<div class="contain-layout shrink-0 flex flex-col items-start w-fit h-fit">
						<div class="contain-layout shrink-0 flex items-center gap-1 w-fit h-fit px-2 py-1.5">
							<TagBadge
								tagName={tagDisplayResult.tagName}
								componentName={tagDisplayResult.componentName}
								isClickable={Boolean(filePath && hasOpen)}
								onClick={handleTagClick}
								onHoverChange={handleTagHoverChange}
								shrink
							/>
						</div>
					</div>
				</Show>

				<Show when={interactive && isPromptMode && !discardPrompt}>
					<div
						class="contain-layout shrink-0 flex flex-col justify-center items-start w-fit h-fit min-w-[150px] max-w-[280px]"
					>
						<div
							class="contain-layout shrink-0 flex items-center gap-1 pt-1.5 pb-1 w-fit h-fit px-2 max-w-full"
						>
							<TagBadge
								tagName={tagDisplayResult.tagName}
								componentName={tagDisplayResult.componentName}
								isClickable={Boolean(filePath && hasOpen)}
								onClick={handleTagClick}
								onHoverChange={handleTagHoverChange}
							/>
						</div>
						<BottomSection>
							<div class="shrink-0 flex justify-between items-end w-full min-h-4">
								<textarea
									ref={(element) => {
										inputRef.current = element;
										// This ref fires during Solid's render commit when the
										// surrounding DOM tree isn't fully built yet, so focusing
										// synchronously can fail or cause a scroll jump.
										if (element && resolveProp(props.onSubmit)) {
											queueMicrotask(() => {
												focusInOverlay(element, { preventScroll: true });
												autoResizeTextarea(element, TEXTAREA_MAX_HEIGHT_PX);
											});
										}
									}}
									data-react-grab-ignore-events
									data-react-grab-input
									aria-label="Add context for selected element"
									aria-keyshortcuts="Enter Escape"
									class="text-[var(--rg-text-primary)] text-[13px] leading-4 font-medium bg-transparent border-none resize-none flex-1 p-0 m-0 wrap-break-word overflow-y-auto"
									style={{
										fieldSizing: 'content',
										minHeight: '16px',
										maxHeight: `${TEXTAREA_MAX_HEIGHT_PX}px`,
										scrollbarWidth: 'none',
									}}
									value={inputValue ?? ''}
									onInput={handleInput}
									onKeyDown={handleKeyDown}
									placeholder="Add context"
									rows={1}
									readOnly={!onSubmit}
								/>
								<Show when={onSubmit}>
									<button
										data-react-grab-submit
										type="button"
										aria-label="Submit context"
										class="contain-layout shrink-0 flex items-center justify-center size-4 rounded-full bg-[var(--rg-submit-bg)] cursor-pointer ml-1 interactive-scale a11y-hitbox"
										onClick={() => resolveProp(props.onSubmit)?.()}
									>
										<IconSubmit size={10} aria-hidden="true" class="text-[var(--rg-submit-fg)]" />
									</button>
								</Show>
							</div>
						</BottomSection>
					</div>
				</Show>

				<Show when={discardPrompt} keyed>
					{(prompt: () => SelectionDiscardPrompt) => {
						const value = prompt();
						return <DiscardPrompt
							label={value.isKeyboardSelection ? 'Discard selection?' : value.label}
							showCancel={!value.isKeyboardSelection}
							cancelOnEscape={value.cancelOnEscape}
							onConfirm={value.onConfirm}
							onCopy={value.onCopy}
							onCancel={() => {
								if (!value.isKeyboardSelection) {
									value.onCancel?.();
								}
								if (inputRef.current) focusInOverlay(inputRef.current, { preventScroll: true });
							}}
						/>;
					}}
				</Show>

				<Show when={error}>
					<ErrorView
						error={error ?? ''}
						onAcknowledge={props.onAcknowledgeError}
						onRetry={props.onRetry}
					/>
				</Show>
			</Surface>
		</div>
	</Show>;
});
