/** @jsxImportSource octane */
import type { ReactGrabRendererProps } from '../types.js';
import { DEFAULT_ACTION_ID } from '../constants.js';
import { isElementConnected } from '../utils/is-element-connected.js';
import { OverlayCanvas } from './overlay-canvas.js';
import { FrozenGlow } from './frozen-glow.js';
import { SelectionLabel } from './selection-label/index.js';
import { Toolbar } from './toolbar/index.js';
import { ContextMenu } from './context-menu.js';
import { ToolbarMenu } from './toolbar/toolbar-menu.js';
import { HierarchyMenu } from './toolbar/hierarchy-menu.js';

export const ReactGrabRenderer = (props: ReactGrabRendererProps) => {
	const frozenAccessors = props.frozenLabelEntryAccessors ?? [];
	const labelAccessors = props.labelInstanceAccessors ?? [];

	return (
		<>
			<OverlayCanvas
				selectionVisible={props.selectionVisible}
				selectionBounds={props.selectionBounds}
				selectionBoundsMultiple={props.selectionBoundsMultiple}
				selectionShouldSnap={props.selectionShouldSnap}
				dragVisible={props.dragVisible}
				dragBounds={props.dragBounds}
				grabbedBoxes={props.grabbedBoxes}
				labelInstances={props.labelInstances}
			/>
			<FrozenGlow visible={props.isFrozen ?? false} />
			{props.selectionLabelVisible && frozenAccessors.length > 0
				? frozenAccessors.map((entryAccessor) => {
						const entry = entryAccessor.read();
						if (!entry) return null;
						return (
							<SelectionLabel
								tagName={entry.tagName}
								componentName={entry.componentName}
								selectionBounds={entry.bounds}
								mouseX={entry.mouseX}
								visible={true}
							/>
						);
					})
				: null}
			{props.selectionLabelVisible && props.pendingShiftPreviewEntry ? (
				<SelectionLabel
					tagName={props.pendingShiftPreviewEntry.tagName}
					componentName={props.pendingShiftPreviewEntry.componentName}
					selectionBounds={props.pendingShiftPreviewEntry.bounds}
					mouseX={props.pendingShiftPreviewEntry.mouseX}
					visible={true}
				/>
			) : null}
			{props.selectionLabelVisible && props.selectionBounds && frozenAccessors.length === 0 ? (
				<SelectionLabel
					tagName={props.selectionTagName}
					componentName={props.selectionComponentName}
					elementsCount={props.selectionElementsCount}
					selectionBounds={props.selectionBounds}
					mouseX={props.mouseX}
					visible={props.selectionLabelVisible}
					isPromptMode={props.isPromptMode}
					inputValue={props.inputValue}
					status={props.selectionLabelStatus}
					filePath={props.selectionFilePath}
					onInputChange={props.onInputChange}
					onSubmit={props.onInputSubmit}
					selectionLabelShakeCount={props.selectionLabelShakeCount}
					onConfirmDismiss={props.onConfirmDismiss}
					discardPrompt={props.discardPrompt}
					onOpen={props.onOpenSelectionFile}
				/>
			) : null}
			{labelAccessors.map((instanceAccessor) => {
				const instance = instanceAccessor.read();
				if (!instance) return null;
				const hasCompletedStatus = instance.status === 'copied' || instance.status === 'fading';
				const showContextMenu =
					hasCompletedStatus && isElementConnected(instance.element)
						? () => props.onShowContextMenuInstance?.(instance.id)
						: undefined;
				return (
					<SelectionLabel
						tagName={instance.tagName}
						componentName={instance.componentName}
						elementsCount={instance.elementsCount}
						selectionBounds={instance.bounds}
						mouseX={instance.mouseX}
						visible={true}
						status={instance.status}
						statusText={instance.statusText}
						isPromptMode={instance.isPromptMode}
						inputValue={instance.inputValue}
						error={instance.errorMessage}
						hideArrow={instance.hideArrow}
						onShowContextMenu={showContextMenu}
						onRetry={() => props.onRetryInstance?.(instance.id)}
						onAcknowledgeError={() => props.onAcknowledgeErrorInstance?.(instance.id)}
						onHoverChange={(isHovered) =>
							props.onLabelInstanceHoverChange?.(instance.id, isHovered)
						}
					/>
				);
			})}
			{props.toolbarVisible !== false ? (
				<Toolbar
					isActive={props.isActive}
					isContextMenuOpen={props.contextMenuPosition !== null}
					onToggle={props.onToggleActive}
					activeActionId={props.activeActionId}
					defaultActionId={props.defaultActionId}
					defaultActionLabel={props.defaultActionLabel}
					enabled={props.enabled}
					shakeCount={props.shakeCount}
					onStateChange={props.onToolbarStateChange}
					onSubscribeToStateChanges={props.onSubscribeToToolbarStateChanges}
					onSelectHoverChange={props.onToolbarSelectHoverChange}
					onContainerRef={props.onToolbarRef}
					onToggleToolbarMenu={props.onToggleToolbarMenu}
				/>
			) : null}
			<ContextMenu
				position={props.contextMenuPosition ?? null}
				selectionBounds={props.contextMenuBounds ?? null}
				tagName={props.contextMenuTagName}
				componentName={props.contextMenuComponentName}
				hasFilePath={props.contextMenuHasFilePath ?? false}
				actions={props.actions}
				actionContext={props.actionContext}
				onDismiss={props.onContextMenuDismiss ?? (() => {})}
				onHide={props.onContextMenuHide ?? (() => {})}
			/>
			<ToolbarMenu
				position={props.toolbarMenuPosition ?? null}
				actions={props.toolbarMenuActions ?? []}
				defaultActionId={props.defaultActionId ?? DEFAULT_ACTION_ID}
				onSetDefaultAction={props.onSetDefaultAction ?? (() => {})}
				onDismiss={props.onToolbarMenuDismiss ?? (() => {})}
			/>
			<HierarchyMenu position={props.hierarchyMenuPosition ?? null} state={props.hierarchyState} />
		</>
	);
};
