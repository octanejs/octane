/** @jsxImportSource octane */
import { useEffect, useMemo, useRef, useState } from 'octane';
import type {
	Position,
	OverlayBounds,
	ContextMenuAction,
	ContextMenuActionContext,
} from '../types.js';
import {
	ARROW_HEIGHT_PX,
	DROPDOWN_OFFSCREEN_POSITION,
	LABEL_GAP_PX,
	MENU_HIGHLIGHT_CORNER_SHAPE,
	MENU_PANEL_CORNER_RADIUS_PX,
	Z_INDEX_OVERLAY,
} from '../constants.js';
import { Arrow } from './selection-label/arrow.js';
import { TagBadge } from './selection-label/tag-badge.js';
import { BottomSection } from './selection-label/bottom-section.js';
import { Menu, createMenuStore } from './menu/index.js';
import { getTagDisplay } from '../utils/get-tag-display.js';
import { resolveActionEnabled } from '../utils/resolve-action-enabled.js';
import { nativeRequestAnimationFrame } from '../utils/native-raf.js';
import { suppressMenuEvent } from '../utils/suppress-menu-event.js';
import { registerOverlayDismiss } from '../utils/register-overlay-dismiss.js';
import { ignoreRealInput } from '../utils/runtime-mode.js';
import { findShortcutAction } from '../utils/action-shortcuts.js';
import { executeContextMenuAction } from '../utils/execute-context-menu-action.js';

interface ContextMenuProps {
	position: Position | null;
	selectionBounds: OverlayBounds | null;
	tagName?: string;
	componentName?: string;
	hasFilePath: boolean;
	actions?: ContextMenuAction[];
	actionContext?: ContextMenuActionContext;
	onDismiss: () => void;
	onHide: () => void;
}

interface ContextMenuRow {
	id: string;
	label: string;
	action: () => void;
	enabled: boolean;
	shortcut?: string;
	shortcutModifier?: boolean;
}

export const ContextMenu = (props: ContextMenuProps) => {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const menuContainerRef = useRef<HTMLDivElement | null>(null);
	const previouslyFocusedElement = useRef<Element | null>(null);
	// Octane props are per-render objects, unlike Solid's live getters, so keep
	// the latest props reachable from the mount-once keyboard/dismiss listeners.
	const propsRef = useRef(props);
	propsRef.current = props;

	// The menu store owns the active-row state and its visible highlight. We
	// never call .focus() on the row itself: that would steal DOM focus from
	// whatever the host page had focused (form inputs, comboboxes,
	// focus-trapped modals), dispatch blur/focus events at the wrong time, and
	// fight focus traps. Keyboard navigation is driven by a window-level
	// keydown listener instead, which fires regardless of where DOM focus is.
	const menuStore = useMemo(
		() =>
			createMenuStore({
				keyboardNavigation: true,
				highlight: {
					bottomCornerRadiusPx: MENU_PANEL_CORNER_RADIUS_PX,
					cornerShape: MENU_HIGHLIGHT_CORNER_SHAPE,
				},
			}),
		[],
	);
	useEffect(() => () => menuStore.dispose(), []);

	const [, setMeasuredWidth, measuredWidth] = useState(0);
	const [, setMeasuredHeight, measuredHeight] = useState(0);

	const isVisible = () => props.position !== null;

	const tagDisplayResult = getTagDisplay({
		tagName: props.tagName,
		componentName: props.componentName,
	});

	const measureContainer = () => {
		const container = containerRef.current;
		if (container) {
			const containerBounds = container.getBoundingClientRect();
			setMeasuredWidth(containerBounds.width);
			setMeasuredHeight(containerBounds.height);
		}
	};

	// Elements that were just mounted may not have been laid out yet, so without
	// deferring to the next frame the measured dimensions are zero and the menu
	// would flash at the wrong position before jumping to its correct spot.
	useEffect(() => {
		if (isVisible()) {
			nativeRequestAnimationFrame(measureContainer);
		}
	}, [isVisible()]);

	const computeMenuPosition = () => {
		const bounds = props.selectionBounds;
		const clickPosition = props.position;
		const labelWidth = measuredWidth();
		const labelHeight = measuredHeight();

		if (labelWidth === 0 || labelHeight === 0 || !bounds || !clickPosition) {
			return {
				left: DROPDOWN_OFFSCREEN_POSITION.left,
				top: DROPDOWN_OFFSCREEN_POSITION.top,
				arrowLeft: 0,
				arrowPosition: 'bottom' as const,
			};
		}

		const cursorX = clickPosition.x ?? bounds.x + bounds.width / 2;
		const positionLeft = Math.max(
			LABEL_GAP_PX,
			Math.min(cursorX - labelWidth / 2, window.innerWidth - labelWidth - LABEL_GAP_PX),
		);
		const arrowLeft = Math.max(
			ARROW_HEIGHT_PX,
			Math.min(cursorX - positionLeft, labelWidth - ARROW_HEIGHT_PX),
		);

		const positionBelow = bounds.y + bounds.height + ARROW_HEIGHT_PX + LABEL_GAP_PX;
		const positionAbove = bounds.y - labelHeight - ARROW_HEIGHT_PX - LABEL_GAP_PX;
		const wouldOverflowBottom = positionBelow + labelHeight > window.innerHeight;
		const hasSpaceAbove = positionAbove >= 0;

		const shouldFlipAbove = wouldOverflowBottom && hasSpaceAbove;
		let positionTop = shouldFlipAbove ? positionAbove : positionBelow;
		let arrowPosition: 'top' | 'bottom' = shouldFlipAbove ? 'top' : 'bottom';

		if (wouldOverflowBottom && !hasSpaceAbove) {
			const cursorY = clickPosition.y ?? bounds.y + bounds.height / 2;
			positionTop = Math.max(
				LABEL_GAP_PX,
				Math.min(cursorY + LABEL_GAP_PX, window.innerHeight - labelHeight - LABEL_GAP_PX),
			);
			arrowPosition = 'top';
		}

		return { left: positionLeft, top: positionTop, arrowLeft, arrowPosition };
	};

	const computedPosition = computeMenuPosition();

	const menuItems: ContextMenuRow[] = (props.actions ?? []).map((action) => {
		const context = props.actionContext;
		return {
			id: action.id,
			label: action.label,
			action: () => {
				if (context) {
					executeContextMenuAction(action, context);
				}
			},
			enabled: resolveActionEnabled(action, context),
			shortcut: action.shortcut,
			shortcutModifier: action.shortcutModifier,
		};
	});

	// Single, predictable focus move keyed strictly on visibility (not on
	// position): focus the menu container on open so aria-activedescendant
	// (driven by activeItemIndex) is announced by assistive tech. On close,
	// restore focus to whatever the host page had focused — but only if
	// nothing else has already claimed focus (e.g. the prompt-mode textarea
	// that an action opened), so we do not yank it back.
	useEffect(() => {
		if (isVisible()) {
			// document.activeElement returns the shadow host when focus is
			// inside the shadow root, so use the host's shadowRoot.activeElement
			// to detect a focused element that already lives in our own DOM
			// tree; we should not capture our own host as "previous".
			const hostShadowRoot = containerRef.current?.getRootNode();
			const focusInsideHost =
				hostShadowRoot instanceof ShadowRoot ? hostShadowRoot.activeElement : null;
			const pageActiveElement = document.activeElement;
			const wasFocusedOnPage =
				pageActiveElement instanceof HTMLElement &&
				focusInsideHost === null &&
				!(
					containerRef.current instanceof Element &&
					containerRef.current.contains(pageActiveElement)
				);
			previouslyFocusedElement.current = wasFocusedOnPage ? pageActiveElement : null;
			menuContainerRef.current?.focus({ preventScroll: true });
			return;
		}
		menuStore.setActiveItem(null);
		const restoreTarget = previouslyFocusedElement.current;
		previouslyFocusedElement.current = null;
		if (!(restoreTarget instanceof HTMLElement) || !document.contains(restoreTarget)) return;
		// Defer to the next frame so an action-triggered focus move (e.g.
		// the prompt textarea focusing itself via queueMicrotask) lands
		// first. If something other than the body has focus by then, the
		// action's side effect deserves to keep it.
		nativeRequestAnimationFrame(() => {
			const currentActive = document.activeElement;
			const isOrphanedFocus = currentActive === null || currentActive === document.body;
			if (!isOrphanedFocus) return;
			restoreTarget.focus({ preventScroll: true });
		});
	}, [isVisible()]);

	useEffect(() => {
		measureContainer();

		const handleKeyDown = (event: KeyboardEvent) => {
			if (propsRef.current.position === null) return;

			const isArrowDown = event.key === 'ArrowDown';
			const isArrowUp = event.key === 'ArrowUp';
			const isHome = event.key === 'Home';
			const isEnd = event.key === 'End';
			const isTab = event.key === 'Tab';

			if (isArrowDown || isArrowUp || isHome || isEnd || isTab) {
				event.preventDefault();
				event.stopPropagation();
				const moveForward = isArrowDown || (isTab && !event.shiftKey);
				if (isHome) {
					menuStore.selectFirst();
				} else if (isEnd) {
					menuStore.selectLast();
				} else if (moveForward) {
					menuStore.selectNext();
				} else {
					menuStore.selectPrevious();
				}
				return;
			}

			const pluginActions = propsRef.current.actions ?? [];
			const context = propsRef.current.actionContext;

			const runActionIfAllowed = (action: ContextMenuAction) => {
				if (!context) return;
				if (!executeContextMenuAction(action, context)) return;
				event.preventDefault();
				event.stopPropagation();
				propsRef.current.onHide();
			};

			// A highlighted row absorbs Enter: run its onSelect (which closes the
			// menu) when enabled, otherwise swallow the key. We must not fall through
			// to a global Enter shortcut while a row is active, or a disabled
			// selection would silently invoke a different action. Only with no active
			// row does Enter reach an action that binds Enter as its own shortcut.
			if (event.key === 'Enter') {
				const activeItem = menuStore.getActiveItem();
				if (activeItem) {
					event.preventDefault();
					event.stopPropagation();
					if (activeItem.isEnabled()) activeItem.onSelect();
					return;
				}
			}

			const shortcutAction = findShortcutAction(pluginActions, event, {
				includeModifierShortcuts: true,
			});
			if (shortcutAction) runActionIfAllowed(shortcutAction);
		};

		const unregisterOverlayDismiss = registerOverlayDismiss({
			isOpen: () => propsRef.current.position !== null,
			onDismiss: () => propsRef.current.onDismiss(),
			shouldIgnoreRightClick: true,
		});
		const gatedHandleKeyDown = ignoreRealInput(handleKeyDown);
		window.addEventListener('keydown', gatedHandleKeyDown, { capture: true });

		return () => {
			unregisterOverlayDismiss();
			window.removeEventListener('keydown', gatedHandleKeyDown, { capture: true });
		};
	}, []);

	const accessibleMenuLabel = () => {
		const { tagName, componentName } = tagDisplayResult;
		const displayName = componentName ? `${componentName}.${tagName}` : tagName;
		return `Actions for ${displayName}`;
	};

	return (
		isVisible() && (
			<div
				ref={containerRef}
				data-react-grab-ignore-events
				data-react-grab-context-menu
				class="fixed font-sans text-[13px] antialiased [filter:var(--rg-drop-shadow)] select-none"
				style={{
					top: `${computedPosition.top}px`,
					left: `${computedPosition.left}px`,
					zIndex: Z_INDEX_OVERLAY,
					pointerEvents: 'auto',
				}}
				onPointerDown={suppressMenuEvent}
				onMouseDown={suppressMenuEvent}
				onClick={suppressMenuEvent}
				onContextMenu={suppressMenuEvent}
			>
				<Arrow
					position={computedPosition.arrowPosition}
					leftPercent={0}
					leftOffsetPx={computedPosition.arrowLeft}
				/>

				<Menu.Panel class="justify-center items-start min-w-[100px]">
					<div class="contain-layout shrink-0 flex items-center gap-1 pt-1.5 pb-1 w-fit h-fit px-2">
						<TagBadge
							tagName={tagDisplayResult.tagName}
							componentName={tagDisplayResult.componentName}
							isClickable={props.hasFilePath}
							onClick={(event) => {
								event.stopPropagation();
								if (props.hasFilePath && props.actionContext) {
									const openAction = props.actions?.find((action) => action.id === 'open');
									if (openAction) {
										executeContextMenuAction(openAction, props.actionContext);
									}
								}
							}}
							shrink
						/>
					</div>
					<BottomSection>
						<Menu.Provider store={menuStore}>
							<Menu.List
								ref={(element) => {
									menuContainerRef.current = element;
								}}
								label={accessibleMenuLabel()}
								class="w-[calc(100%+16px)] -mx-2 -my-1.5 outline-none"
							>
								{menuItems.map((item) => (
									<Menu.Item
										key={item.id}
										value={item.id}
										dataId={item.label.toLowerCase()}
										disabled={!item.enabled}
										onSelect={() => {
											item.action();
											props.onHide();
										}}
									>
										<Menu.Label class="text-[var(--rg-text-primary)]" textContent={item.label} />
										{item.shortcut && (
											<Menu.Shortcut shortcut={item.shortcut} modifier={item.shortcutModifier} />
										)}
									</Menu.Item>
								))}
							</Menu.List>
						</Menu.Provider>
					</BottomSection>
				</Menu.Panel>
			</div>
		)
	);
};
