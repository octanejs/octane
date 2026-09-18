import { For, resolveProp, Show, useProp, type Component } from '../reactive.js';
import type { ReactGrabRendererProps, FrozenLabelEntry, SelectionLabelInstance } from '../types.js';
import { DEFAULT_ACTION_ID } from '../constants.js';
import { isElementConnected } from '../utils/is-element-connected.js';
import { OverlayCanvas } from './overlay-canvas.tsrx';
import { FrozenGlow } from './frozen-glow.tsrx';
import { SelectionLabel } from './selection-label/index.tsrx';
import { Toolbar } from './toolbar/index.tsrx';
import { ContextMenu } from './context-menu.tsrx';
import { ToolbarMenu } from './toolbar/toolbar-menu.tsrx';
import { HierarchyMenu } from './toolbar/hierarchy-menu.tsrx';

const noop = (): void => {};

export const ReactGrabRenderer: Component<ReactGrabRendererProps> = (props) => {
	const isFrozen = useProp(props.isFrozen);
	const selectionLabelVisible = useProp(props.selectionLabelVisible);
	const frozenLabelEntryAccessors = useProp(props.frozenLabelEntryAccessors);
	const pendingShiftPreviewEntry = useProp(props.pendingShiftPreviewEntry);
	const selectionBounds = useProp(props.selectionBounds);
	const labelInstanceAccessors = useProp(props.labelInstanceAccessors);
	const toolbarVisible = useProp(props.toolbarVisible);
	const contextMenuPosition = useProp(props.contextMenuPosition);

	return <>
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
		<FrozenGlow visible={isFrozen ?? false} />
		<Show when={() => selectionLabelVisible && (frozenLabelEntryAccessors?.length ?? 0) > 0}>
			<For each={frozenLabelEntryAccessors ?? []}>
				{(entryAccessor) => <Show when={() => entryAccessor.read()}>
					{(entry: () => FrozenLabelEntry) =>
						<SelectionLabel
							tagName={entry().tagName}
							componentName={entry().componentName}
							selectionBounds={entry().bounds}
							mouseX={entry().mouseX}
							visible={true}
						/>}
				</Show>}
			</For>
		</Show>
		<Show when={selectionLabelVisible && pendingShiftPreviewEntry}>
			{(pendingEntry: () => FrozenLabelEntry) =>
				<SelectionLabel
					tagName={pendingEntry().tagName}
					componentName={pendingEntry().componentName}
					selectionBounds={pendingEntry().bounds}
					mouseX={pendingEntry().mouseX}
					visible={true}
				/>}
		</Show>
		<Show
			when={selectionLabelVisible && selectionBounds &&
				(frozenLabelEntryAccessors?.length ?? 0) === 0}
		>
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
		</Show>
		<For each={labelInstanceAccessors ?? []}>
			{(instanceAccessor) => <Show when={() => instanceAccessor.read()}>
				{(instance: () => SelectionLabelInstance) => <SelectionLabel
					tagName={instance().tagName}
					componentName={instance().componentName}
					elementsCount={instance().elementsCount}
					selectionBounds={instance().bounds}
					mouseX={instance().mouseX}
					visible={true}
					status={instance().status}
					statusText={instance().statusText}
					isPromptMode={instance().isPromptMode}
					inputValue={instance().inputValue}
					error={instance().errorMessage}
					hideArrow={instance().hideArrow}
					onShowContextMenu={(() => {
						const currentInstance = instance();
						const hasCompletedStatus =
							currentInstance.status === 'copied' || currentInstance.status === 'fading';
						if (!hasCompletedStatus || !isElementConnected(currentInstance.element)) {
							return undefined;
						}
						return () => resolveProp(props.onShowContextMenuInstance)?.(currentInstance.id);
					})()}
					onRetry={() => resolveProp(props.onRetryInstance)?.(instance().id)}
					onAcknowledgeError={() => resolveProp(props.onAcknowledgeErrorInstance)?.(instance().id)}
					onHoverChange={(isHovered: boolean) => resolveProp(props.onLabelInstanceHoverChange)?.(
						instance().id,
						isHovered,
					)}
				/>}
			</Show>}
		</For>
		<Show when={toolbarVisible !== false}>
			<Toolbar
				isActive={props.isActive}
				isContextMenuOpen={contextMenuPosition !== null}
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
		</Show>
		<ContextMenu
			position={props.contextMenuPosition ?? null}
			selectionBounds={props.contextMenuBounds ?? null}
			tagName={props.contextMenuTagName}
			componentName={props.contextMenuComponentName}
			hasFilePath={props.contextMenuHasFilePath ?? false}
			actions={props.actions}
			actionContext={props.actionContext}
			onDismiss={props.onContextMenuDismiss ?? noop}
			onHide={props.onContextMenuHide ?? noop}
		/>
		<ToolbarMenu
			position={props.toolbarMenuPosition ?? null}
			actions={props.toolbarMenuActions ?? []}
			defaultActionId={props.defaultActionId ?? DEFAULT_ACTION_ID}
			onSetDefaultAction={props.onSetDefaultAction ?? noop}
			onDismiss={props.onToolbarMenuDismiss ?? noop}
		/>
		<HierarchyMenu position={props.hierarchyMenuPosition ?? null} state={props.hierarchyState} />
	</>;
};
