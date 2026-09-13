/** @jsxImportSource octane */
import { useEffect, useRef, useState } from 'octane';
import type { ArrowPosition, SelectionLabelProps } from '../../types.js';
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
import { IconSubmit } from '../icons/icon-submit.jsx';
import { IconLoader } from '../icons/icon-loader.jsx';
import { Arrow } from './arrow.js';
import { TagBadge } from './tag-badge.js';
import { BottomSection } from './bottom-section.js';
import { Surface } from '../ui/surface.js';
import { DiscardPrompt } from './discard-prompt.js';
import { ErrorView } from './error-view.js';
import { CompletionView } from './completion-view.js';

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

export const SelectionLabel = (props: SelectionLabelProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const panelRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const isTagCurrentlyHovered = useRef(false);

	const [, setMeasuredWidth, measuredWidth] = useState(0);
	const [, setMeasuredHeight, measuredHeight] = useState(0);
	const [, setPanelWidth, panelWidth] = useState(0);
	const [, setViewportVersion] = useState(0);
	const [, setIsInternalFading, isInternalFading] = useState(false);
	const [, setIsShaking, isShaking] = useState(false);

	const canInteract = () =>
		props.status !== 'copying' &&
		props.status !== 'copied' &&
		props.status !== 'fading' &&
		props.status !== 'error';

	const isCompletedStatus = () => props.status === 'copied' || props.status === 'fading';

	const shouldEnablePointerEvents = (): boolean => {
		if (props.isPromptMode) return true;
		if (props.discardPrompt) return true;
		if (isCompletedStatus() && (props.onDismiss || props.onShowContextMenu)) {
			return true;
		}
		if (props.status === 'error' && (props.onAcknowledgeError || props.onRetry)) {
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

	const elementIdentity = () => `${props.tagName ?? ''}:${props.componentName ?? ''}`;

	// This reducer-style computation preserves position state across renders,
	// resetting to offscreen on element identity change and keeping the last
	// good position when measurements briefly fail (via hadValidBounds). It
	// replaces an earlier anti-pattern of deriving state via effects.
	// @see https://github.com/aidenybai/react-grab/pull/245
	const previousResultRef = useRef<PositionResult>({
		position: DEFAULT_OFFSCREEN_POSITION,
		computedArrowPosition: null,
		hadValidBounds: false,
		elementIdentity: '',
	});

	const computePosition = (): PositionResult => {
		const previousResult = previousResultRef.current;
		const currentElementIdentity = elementIdentity();
		const didReset = currentElementIdentity !== previousResult.elementIdentity;
		const cached: PositionResult = didReset
			? {
					position: DEFAULT_OFFSCREEN_POSITION,
					computedArrowPosition: null,
					hadValidBounds: false,
					elementIdentity: currentElementIdentity,
				}
			: previousResult;

		const bounds = props.selectionBounds;
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
			bounds.x + bounds.width > viewportLeft &&
			bounds.x < viewportRight &&
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
		const cursorX = props.mouseX ?? selectionCenterX;
		const selectionBottom = bounds.y + bounds.height;
		const selectionTop = bounds.y;

		const actualArrowHeight = props.hideArrow ? 0 : getArrowSize(panelWidth());

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
	};

	const positionResult = computePosition();
	previousResultRef.current = positionResult;

	const arrowPosition: ArrowPosition = positionResult.computedArrowPosition ?? 'bottom';
	const hadValidBounds = positionResult.hadValidBounds;

	const didMountShake = useRef(false);
	useEffect(() => {
		if (!didMountShake.current) {
			didMountShake.current = true;
			return;
		}
		setIsShaking(true);
	}, [props.selectionLabelShakeCount]);

	const handleKeyDown = (event: KeyboardEvent) => {
		if (isKeyboardEventComposing(event)) {
			return;
		}

		event.stopImmediatePropagation();

		const isEnterWithoutShift = event.code === 'Enter' && !event.shiftKey;
		const isEscape = event.code === 'Escape';

		if (isEnterWithoutShift) {
			event.preventDefault();
			props.onSubmit?.();
		} else if (isEscape) {
			event.preventDefault();
			props.onConfirmDismiss?.();
		}
	};

	const handleInput = (event: InputEvent) => {
		const inputTarget = event.target;
		if (!(inputTarget instanceof HTMLTextAreaElement)) {
			return;
		}
		autoResizeTextarea(inputTarget, TEXTAREA_MAX_HEIGHT_PX);
		props.onInputChange?.(inputTarget.value);
	};

	const tagDisplayResult = getTagDisplay({
		tagName: props.tagName,
		componentName: props.componentName,
		elementsCount: props.elementsCount,
	});

	const isSinglePanelLine = (): boolean => {
		if (props.error || props.discardPrompt) return false;
		if (canInteract() && props.isPromptMode) return false;
		return true;
	};

	const handleTagClick = (event: MouseEvent) => {
		event.stopImmediatePropagation();
		if (props.filePath && props.onOpen) {
			props.onOpen();
		}
	};

	const handleContainerPointerDown = (event: PointerEvent) => {
		event.stopImmediatePropagation();
		const isEditableInputVisible =
			canInteract() && props.isPromptMode && !props.discardPrompt && props.onSubmit;
		if (isEditableInputVisible && inputRef.current) {
			focusInOverlay(inputRef.current, { preventScroll: true });
		}
	};

	const shouldPersistDuringFade = () =>
		hadValidBounds && (isCompletedStatus() || props.status === 'error');

	const discardPrompt = props.discardPrompt;

	return (
		props.visible !== false &&
		(props.selectionBounds || shouldPersistDuringFade()) && (
			<div
				ref={containerRef}
				data-react-grab-ignore-events
				data-react-grab-selection-label
				class="fixed font-sans text-[13px] antialiased select-none"
				style={{
					top: `${positionResult.position.top}px`,
					left: `${positionResult.position.left}px`,
					transform: `translateX(calc(-50% + ${positionResult.position.edgeOffsetX}px))`,
					zIndex: Z_INDEX_OVERLAY,
					pointerEvents: shouldEnablePointerEvents() ? 'auto' : 'none',
					transition: `opacity ${FADE_DURATION_MS}ms ease-out, filter ${FADE_DURATION_MS}ms ease-out`,
					opacity: props.status === 'fading' || isInternalFading() ? 0 : 1,
					filter: `drop-shadow(${PANEL_SHADOW}) blur(${props.status === 'fading' || isInternalFading() ? '3px' : '0'})`,
				}}
				onPointerDown={handleContainerPointerDown}
				onClick={(event) => {
					event.stopImmediatePropagation();
				}}
				onMouseEnter={() => props.onHoverChange?.(true)}
				onMouseLeave={() => props.onHoverChange?.(false)}
			>
				{!props.hideArrow && (
					<Arrow
						position={arrowPosition}
						leftPercent={positionResult.position.arrowLeftPercent}
						leftOffsetPx={positionResult.position.arrowLeftOffset}
						labelWidth={panelWidth()}
					/>
				)}

				{isCompletedStatus() && !props.error && (
					<CompletionView
						statusText={props.statusText ?? 'Copied'}
						onDismiss={props.onDismiss}
						onFadingChange={setIsInternalFading}
						onShowContextMenu={props.onShowContextMenu}
					/>
				)}

				<Surface
					ref={(element) => {
						panelRef.current = element;
					}}
					shape={isSinglePanelLine() ? 'pill' : 'panel'}
					class={cn('flex items-center gap-[5px] w-fit h-fit p-0', isShaking() && 'animate-shake')}
					style={isCompletedStatus() && !props.error ? { display: 'none' } : undefined}
					onAnimationEnd={() => setIsShaking(false)}
				>
					{props.status === 'copying' && (
						<div class="contain-layout shrink-0 flex flex-col justify-center items-start w-fit h-fit max-w-[280px]">
							<div class="contain-layout shrink-0 flex items-center gap-1 py-1.5 px-2 w-full h-fit">
								<IconLoader size={13} class="text-[var(--rg-text-secondary)] shrink-0" />
								<span class="shimmer-text text-[13px] leading-4 font-sans font-medium h-fit tabular-nums overflow-hidden text-ellipsis whitespace-nowrap">
									{(props.statusText ?? 'Grabbing…') as string}
								</span>
							</div>
						</div>
					)}

					{canInteract() && !props.isPromptMode && !props.discardPrompt && (
						<div class="contain-layout shrink-0 flex flex-col items-start w-fit h-fit">
							<div class="contain-layout shrink-0 flex items-center gap-1 w-fit h-fit px-2 py-1.5">
								<TagBadge
									tagName={tagDisplayResult.tagName}
									componentName={tagDisplayResult.componentName}
									isClickable={Boolean(props.filePath && props.onOpen)}
									onClick={handleTagClick}
									onHoverChange={handleTagHoverChange}
									shrink
								/>
							</div>
						</div>
					)}

					{canInteract() && props.isPromptMode && !props.discardPrompt && (
						<div class="contain-layout shrink-0 flex flex-col justify-center items-start w-fit h-fit min-w-[150px] max-w-[280px]">
							<div class="contain-layout shrink-0 flex items-center gap-1 pt-1.5 pb-1 w-fit h-fit px-2 max-w-full">
								<TagBadge
									tagName={tagDisplayResult.tagName}
									componentName={tagDisplayResult.componentName}
									isClickable={Boolean(props.filePath && props.onOpen)}
									onClick={handleTagClick}
									onHoverChange={handleTagHoverChange}
								/>
							</div>
							<BottomSection>
								<div class="shrink-0 flex justify-between items-end w-full min-h-4">
									<textarea
										ref={(element) => {
											inputRef.current = element;
											// This ref fires during render commit when the surrounding
											// DOM tree isn't fully built yet, so focusing synchronously
											// can fail or cause a scroll jump.
											if (props.onSubmit && element) {
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
										value={props.inputValue ?? ''}
										onInput={handleInput}
										onKeyDown={handleKeyDown}
										placeholder="Add context"
										rows={1}
										readOnly={!props.onSubmit}
									/>
									{props.onSubmit && (
										<button
											data-react-grab-submit
											type="button"
											aria-label="Submit context"
											class="contain-layout shrink-0 flex items-center justify-center size-4 rounded-full bg-[var(--rg-submit-bg)] cursor-pointer ml-1 interactive-scale a11y-hitbox"
											onClick={() => props.onSubmit?.()}
										>
											<IconSubmit size={10} aria-hidden="true" class="text-[var(--rg-submit-fg)]" />
										</button>
									)}
								</div>
							</BottomSection>
						</div>
					)}

					{discardPrompt && (
						<DiscardPrompt
							label={discardPrompt.isKeyboardSelection ? 'Discard selection?' : discardPrompt.label}
							showCancel={!discardPrompt.isKeyboardSelection}
							cancelOnEscape={discardPrompt.cancelOnEscape}
							onConfirm={discardPrompt.onConfirm}
							onCopy={discardPrompt.onCopy}
							onCancel={() => {
								if (!discardPrompt.isKeyboardSelection) {
									discardPrompt.onCancel?.();
								}
								focusInOverlay(inputRef.current, { preventScroll: true });
							}}
						/>
					)}

					{props.error && (
						<ErrorView
							error={props.error}
							onAcknowledge={props.onAcknowledgeError}
							onRetry={props.onRetry}
						/>
					)}
				</Surface>
			</div>
		)
	);
};
