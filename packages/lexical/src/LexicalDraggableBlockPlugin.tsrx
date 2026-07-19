// Ported from @lexical/react/src/LexicalDraggableBlockPlugin.tsx. Renders a drag
// handle + drop-target line (portaled into anchorElem) to reorder top-level blocks.
// The DOM math helpers are framework-agnostic and copied as-is; the portal body is a
// component (DraggableContainer) so its <div> events wire through the template path.
import { useLexicalComposerContext } from './LexicalComposerContext';
import { eventFiles } from '@lexical/rich-text';
import { calculateZoomLevel } from '@lexical/utils';
import {
	$getNearestNodeFromDOMNode,
	$getNodeByKey,
	$getRoot,
	$getSelection,
	$onUpdate,
	BLUR_COMMAND,
	COMMAND_PRIORITY_HIGH,
	COMMAND_PRIORITY_LOW,
	DRAGOVER_COMMAND,
	DROP_COMMAND,
	getActiveElement,
	getActiveElementDeep,
	getComposedEventTarget,
	getParentElement,
	getRootOwnerDocument,
	IS_FIREFOX,
	isHTMLElement,
	mergeRegister,
} from 'lexical';
import type { LexicalEditor } from 'lexical';
import { createPortal, useCallback, useEffect, useRef, useState } from 'octane';
import type { OctaneNode } from 'octane';

import { Point } from './shared/point';
import { Rectangle } from './shared/rect';

const SPACE = 4;
const TARGET_LINE_HALF_HEIGHT = 2;
const DRAG_DATA_FORMAT = 'application/x-lexical-drag-block';
const TEXT_BOX_HORIZONTAL_PADDING = 28;

const Downward = 1;
const Upward = -1;
const Indeterminate = 0;

let prevIndex = Infinity;

function getCurrentIndex(keysLength: number): number {
	if (keysLength === 0) {
		return Infinity;
	}
	if (prevIndex >= 0 && prevIndex < keysLength) {
		return prevIndex;
	}
	return Math.floor(keysLength / 2);
}

function getTopLevelNodeKeys(editor: LexicalEditor): string[] {
	return editor.read('latest', () => $getRoot().getChildrenKeys());
}

function getCollapsedMargins(elem: HTMLElement): {
	marginTop: number;
	marginBottom: number;
} {
	const getMargin = (element: Element | null, margin: 'marginTop' | 'marginBottom'): number =>
		element ? parseFloat(window.getComputedStyle(element)[margin]) : 0;

	const { marginTop, marginBottom } = window.getComputedStyle(elem);
	const prevElemSiblingMarginBottom = getMargin(elem.previousElementSibling, 'marginBottom');
	const nextElemSiblingMarginTop = getMargin(elem.nextElementSibling, 'marginTop');
	const collapsedTopMargin = Math.max(parseFloat(marginTop), prevElemSiblingMarginBottom);
	const collapsedBottomMargin = Math.max(parseFloat(marginBottom), nextElemSiblingMarginTop);

	return { marginBottom: collapsedBottomMargin, marginTop: collapsedTopMargin };
}

function getBlockElement(
	anchorElem: HTMLElement,
	editor: LexicalEditor,
	event: MouseEvent,
	useEdgeAsDefault = false,
): HTMLElement | null {
	const anchorElementRect = anchorElem.getBoundingClientRect();
	const topLevelNodeKeys = getTopLevelNodeKeys(editor);

	let blockElem: HTMLElement | null = null;

	editor.read('latest', () => {
		if (useEdgeAsDefault) {
			const [firstNode, lastNode] = [
				editor.getElementByKey(topLevelNodeKeys[0]),
				editor.getElementByKey(topLevelNodeKeys[topLevelNodeKeys.length - 1]),
			];

			const [firstNodeRect, lastNodeRect] = [
				firstNode != null ? firstNode.getBoundingClientRect() : undefined,
				lastNode != null ? lastNode.getBoundingClientRect() : undefined,
			];

			if (firstNodeRect && lastNodeRect) {
				const firstNodeZoom = calculateZoomLevel(firstNode);
				const lastNodeZoom = calculateZoomLevel(lastNode);
				if (event.y / firstNodeZoom < firstNodeRect.top) {
					blockElem = firstNode;
				} else if (event.y / lastNodeZoom > lastNodeRect.bottom) {
					blockElem = lastNode;
				}

				if (blockElem) {
					return;
				}
			}
		}

		let index = getCurrentIndex(topLevelNodeKeys.length);
		let direction = Indeterminate;

		while (index >= 0 && index < topLevelNodeKeys.length) {
			const key = topLevelNodeKeys[index];
			const elem = editor.getElementByKey(key);
			if (elem === null) {
				break;
			}
			const zoom = calculateZoomLevel(elem);
			const point = new Point(event.x / zoom, event.y / zoom);
			const domRect = Rectangle.fromDOM(elem);
			const { marginTop, marginBottom } = getCollapsedMargins(elem);
			const rect = domRect.generateNewRect({
				bottom: domRect.bottom + marginBottom,
				left: anchorElementRect.left,
				right: anchorElementRect.right,
				top: domRect.top - marginTop,
			});

			const { result, reason: { isOnTopSide, isOnBottomSide } } = rect.contains(point);

			if (result) {
				blockElem = elem;
				prevIndex = index;
				break;
			}

			if (direction === Indeterminate) {
				if (isOnTopSide) {
					direction = Upward;
				} else if (isOnBottomSide) {
					direction = Downward;
				} else {
					direction = Infinity;
				}
			}

			index += direction;
		}
	});

	return blockElem;
}

function setMenuPosition(
	targetElem: HTMLElement | null,
	floatingElem: HTMLElement,
	anchorElem: HTMLElement,
	zoomLevel: number,
) {
	if (!targetElem) {
		floatingElem.style.display = 'none';
		return;
	}

	const targetRect = targetElem.getBoundingClientRect();
	const targetStyle = window.getComputedStyle(targetElem);
	const floatingElemRect = floatingElem.getBoundingClientRect();
	const anchorElementRect = anchorElem.getBoundingClientRect();

	let targetCalculateHeight = parseInt(targetStyle.lineHeight, 10);
	if (isNaN(targetCalculateHeight)) {
		targetCalculateHeight = targetRect.bottom - targetRect.top;
	}
	const top =
		(targetRect.top +
			(targetCalculateHeight - (floatingElemRect.height || targetCalculateHeight)) / 2 -
			anchorElementRect.top +
			anchorElem.scrollTop) /
		zoomLevel;

	const left = SPACE;

	floatingElem.style.display = 'flex';
	floatingElem.style.opacity = '1';
	floatingElem.style.transform = `translate(${left}px, ${top}px)`;
}

function setDragImage(dataTransfer: DataTransfer, draggableBlockElem: HTMLElement) {
	const { transform } = draggableBlockElem.style;

	draggableBlockElem.style.transform = 'translateZ(0)';
	dataTransfer.setDragImage(draggableBlockElem, 0, 0);

	setTimeout(() => {
		draggableBlockElem.style.transform = transform;
	});
}

function setTargetLine(
	targetLineElem: HTMLElement,
	targetBlockElem: HTMLElement,
	mouseY: number,
	anchorElem: HTMLElement,
) {
	const { top: targetBlockElemTop, height: targetBlockElemHeight } =
		targetBlockElem.getBoundingClientRect();
	const { top: anchorTop, width: anchorWidth } = anchorElem.getBoundingClientRect();
	const { marginTop, marginBottom } = getCollapsedMargins(targetBlockElem);
	let lineTop = targetBlockElemTop;
	if (mouseY >= targetBlockElemTop) {
		lineTop += targetBlockElemHeight + marginBottom / 2;
	} else {
		lineTop -= marginTop / 2;
	}

	const top = lineTop - anchorTop - TARGET_LINE_HALF_HEIGHT + anchorElem.scrollTop;
	const left = TEXT_BOX_HORIZONTAL_PADDING - SPACE;

	targetLineElem.style.transform = `translate(${left}px, ${top}px)`;
	targetLineElem.style.width = `${anchorWidth - (TEXT_BOX_HORIZONTAL_PADDING - SPACE) * 2}px`;
	targetLineElem.style.opacity = '.4';
}

function hideTargetLine(targetLineElem: HTMLElement | null) {
	if (targetLineElem) {
		targetLineElem.style.opacity = '0';
		targetLineElem.style.transform = 'translate(-10000px, -10000px)';
	}
}

type DraggableContainerProps = {
	onDragStart: (event: DragEvent) => void;
	onDragEnd: () => void;
	isEditable: boolean;
	menuComponent: OctaneNode;
	targetLineComponent: OctaneNode;
};

function DraggableContainer(props: DraggableContainerProps) @{
	<>
		<div draggable={true} onDragStart={props.onDragStart} onDragEnd={props.onDragEnd}>
			{props.isEditable ? props.menuComponent : null}
		</div>
		{props.targetLineComponent}
	</>
}

function useDraggableBlockMenu(
	editor: LexicalEditor,
	anchorElem: HTMLElement,
	menuRef: { current: HTMLElement | null },
	targetLineRef: { current: HTMLElement | null },
	isEditable: boolean,
	menuComponent: OctaneNode,
	targetLineComponent: OctaneNode,
	isOnMenu: (element: HTMLElement) => boolean,
	onElementChanged: ((element: HTMLElement | null) => void) | undefined,
): OctaneNode {
	const scrollerElem = getParentElement(anchorElem);

	const isDraggingBlockRef = useRef(false);
	const [draggableBlockElem, setDraggableBlockElemState] = useState<HTMLElement | null>(null);

	const setDraggableBlockElem = useCallback((elem: HTMLElement | null) => {
		setDraggableBlockElemState(elem);
		if (onElementChanged) {
			onElementChanged(elem);
		}
	}, [onElementChanged]);

	useEffect(() => {
		function onMouseMove(event: MouseEvent) {
			const target = getComposedEventTarget(event);
			if (!isHTMLElement(target)) {
				setDraggableBlockElem(null);
				return;
			}

			if (isOnMenu(target)) {
				return;
			}

			const _draggableBlockElem = getBlockElement(anchorElem, editor, event);
			setDraggableBlockElem(_draggableBlockElem);
		}

		function onMouseLeave() {
			setDraggableBlockElem(null);
		}

		if (scrollerElem != null) {
			scrollerElem.addEventListener('mousemove', onMouseMove);
			scrollerElem.addEventListener('mouseleave', onMouseLeave);
		}

		return () => {
			if (scrollerElem != null) {
				scrollerElem.removeEventListener('mousemove', onMouseMove);
				scrollerElem.removeEventListener('mouseleave', onMouseLeave);
			}
		};
	}, [scrollerElem, anchorElem, editor, isOnMenu, setDraggableBlockElem]);

	useEffect(() => {
		const zoomLevel = calculateZoomLevel(editor.getRootElement(), true);
		if (menuRef.current) {
			setMenuPosition(draggableBlockElem, menuRef.current, anchorElem, zoomLevel);
		}
	}, [editor, anchorElem, draggableBlockElem, menuRef]);

	useEffect(() => {
		function onDragover(event: DragEvent): boolean {
			if (!isDraggingBlockRef.current) {
				return false;
			}
			const [isFileTransfer] = eventFiles(event);
			if (isFileTransfer) {
				return false;
			}
			const pageY = event.pageY;
			const target = getComposedEventTarget(event);
			if (!isHTMLElement(target)) {
				return false;
			}
			const targetBlockElem = getBlockElement(anchorElem, editor, event, true);
			const targetLineElem = targetLineRef.current;
			if (targetBlockElem === null || targetLineElem === null) {
				return false;
			}
			setTargetLine(
				targetLineElem,
				targetBlockElem,
				pageY / calculateZoomLevel(target),
				anchorElem,
			);
			event.preventDefault();
			return true;
		}

		function $onDrop(event: DragEvent): boolean {
			if (!isDraggingBlockRef.current) {
				return false;
			}
			const [isFileTransfer] = eventFiles(event);
			if (isFileTransfer) {
				return false;
			}
			const { dataTransfer, pageY } = event;
			const target = getComposedEventTarget(event);
			const dragData =
				dataTransfer != null ? dataTransfer.getData(DRAG_DATA_FORMAT) : '';
			const draggedNode = $getNodeByKey(dragData);
			if (!draggedNode) {
				return false;
			}
			if (!isHTMLElement(target)) {
				return false;
			}
			const targetBlockElem = getBlockElement(anchorElem, editor, event, true);
			if (!targetBlockElem) {
				return false;
			}
			const targetNode = $getNearestNodeFromDOMNode(targetBlockElem);
			if (!targetNode) {
				return false;
			}
			if (targetNode === draggedNode) {
				if (IS_FIREFOX) {
					editor.focus();
				}
				return true;
			}
			const targetBlockElemTop = targetBlockElem.getBoundingClientRect().top;
			if (pageY / calculateZoomLevel(target) >= targetBlockElemTop) {
				targetNode.insertAfter(draggedNode);
			} else {
				targetNode.insertBefore(draggedNode);
			}
			setDraggableBlockElem(null);

			if (IS_FIREFOX) {
				$onUpdate(() => {
					editor.focus();
				});
			}

			return true;
		}

		return mergeRegister(
			editor.registerCommand(
				DRAGOVER_COMMAND,
				(event) => {
					return onDragover(event);
				},
				COMMAND_PRIORITY_LOW,
			),
			editor.registerCommand(
				DROP_COMMAND,
				(event) => {
					return $onDrop(event);
				},
				COMMAND_PRIORITY_HIGH,
			),
		);
	}, [anchorElem, editor, targetLineRef, setDraggableBlockElem]);

	useEffect(() => {
		if (!IS_FIREFOX || !isEditable) {
			return;
		}

		return mergeRegister(
			editor.registerRootListener((rootElement) => {
				function onBlur(event: FocusEvent) {
					const relatedTarget = event.relatedTarget;
					if (isHTMLElement(relatedTarget) && isOnMenu(relatedTarget)) {
						if (rootElement) {
							rootElement.focus({ preventScroll: true });
							editor.update(() => {
								const selection = $getSelection();
								if (selection !== null && !selection.dirty) {
									selection.dirty = true;
								}
							});
						}
						event.stopImmediatePropagation();
					}
				}

				if (rootElement) {
					rootElement.addEventListener('blur', onBlur, true);
					return () => rootElement.removeEventListener('blur', onBlur, true);
				}
			}),
			editor.registerCommand(
				BLUR_COMMAND,
				() => {
					const rootElement = editor.getRootElement();
					const activeElement = getActiveElementDeep(getRootOwnerDocument(rootElement));
					if (rootElement && isHTMLElement(activeElement) && isOnMenu(activeElement)) {
						rootElement.focus({ preventScroll: true });
						editor.update(() => {
							const selection = $getSelection();
							if (selection !== null && !selection.dirty) {
								selection.dirty = true;
							}
						});
						return true;
					}
					return false;
				},
				COMMAND_PRIORITY_HIGH,
			),
		);
	}, [editor, isEditable, isOnMenu]);

	function onDragStart(event: DragEvent) {
		const dataTransfer = event.dataTransfer;
		if (!dataTransfer || !draggableBlockElem) {
			return;
		}

		setDragImage(dataTransfer, draggableBlockElem);
		let nodeKey = '';
		editor.update(() => {
			const node = $getNearestNodeFromDOMNode(draggableBlockElem);
			if (node) {
				nodeKey = node.getKey();
			}
		});
		isDraggingBlockRef.current = true;
		dataTransfer.setData(DRAG_DATA_FORMAT, nodeKey);

		if (IS_FIREFOX) {
			const rootElement = editor.getRootElement();
			if (rootElement !== null && getActiveElement(rootElement) !== rootElement) {
				rootElement.focus({ preventScroll: true });
				editor.update(() => {
					const selection = $getSelection();
					if (selection !== null && !selection.dirty) {
						selection.dirty = true;
					}
				});
			}
		}
	}

	function onDragEnd() {
		isDraggingBlockRef.current = false;
		hideTargetLine(targetLineRef.current);

		if (IS_FIREFOX) {
			editor.focus();
		}
	}

	return createPortal(DraggableContainer, anchorElem, {
		onDragStart,
		onDragEnd,
		isEditable,
		menuComponent,
		targetLineComponent,
	});
}

type Props = {
	anchorElem?: HTMLElement;
	menuRef: { current: HTMLElement | null };
	targetLineRef: { current: HTMLElement | null };
	menuComponent: OctaneNode;
	targetLineComponent: OctaneNode;
	isOnMenu: (element: HTMLElement) => boolean;
	onElementChanged?: (element: HTMLElement | null) => void;
};

export function DraggableBlockPlugin_EXPERIMENTAL(props: Props) {
	const anchorElem = props.anchorElem ?? document.body;
	const [editor] = useLexicalComposerContext();
	return useDraggableBlockMenu(
		editor,
		anchorElem,
		props.menuRef,
		props.targetLineRef,
		editor._editable,
		props.menuComponent,
		props.targetLineComponent,
		props.isOnMenu,
		props.onElementChanged,
	);
}
