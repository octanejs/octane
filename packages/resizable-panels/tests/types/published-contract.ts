/** @jsxImportSource octane */
// Seeded from scripts/react-port/generate-public-contract-tests.mjs; hook slots are explicit Octane contracts.
// Every published export participates in a consumer assertion against the pinned npm types.
// Property presence and callable arity complement the recursive opacity audit,
// the complete upstream type suite, and the handwritten inference/negative examples.
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import type * as Native0 from '@octanejs/resizable-panels';

type SharedKeys0 = 'getLayout' | 'setLayout';
type SharedKeys1 =
	| 'about'
	| 'accessKey'
	| 'aria-activedescendant'
	| 'aria-atomic'
	| 'aria-autocomplete'
	| 'aria-braillelabel'
	| 'aria-brailleroledescription'
	| 'aria-busy'
	| 'aria-checked'
	| 'aria-colcount'
	| 'aria-colindex'
	| 'aria-colindextext'
	| 'aria-colspan'
	| 'aria-controls'
	| 'aria-current'
	| 'aria-describedby'
	| 'aria-description'
	| 'aria-details'
	| 'aria-disabled'
	| 'aria-dropeffect'
	| 'aria-errormessage'
	| 'aria-expanded'
	| 'aria-flowto'
	| 'aria-grabbed'
	| 'aria-haspopup'
	| 'aria-hidden'
	| 'aria-invalid'
	| 'aria-keyshortcuts'
	| 'aria-label'
	| 'aria-labelledby'
	| 'aria-level'
	| 'aria-live'
	| 'aria-modal'
	| 'aria-multiline'
	| 'aria-multiselectable'
	| 'aria-orientation'
	| 'aria-owns'
	| 'aria-placeholder'
	| 'aria-posinset'
	| 'aria-pressed'
	| 'aria-readonly'
	| 'aria-relevant'
	| 'aria-required'
	| 'aria-roledescription'
	| 'aria-rowcount'
	| 'aria-rowindex'
	| 'aria-rowindextext'
	| 'aria-rowspan'
	| 'aria-selected'
	| 'aria-setsize'
	| 'aria-sort'
	| 'aria-valuemax'
	| 'aria-valuemin'
	| 'aria-valuenow'
	| 'aria-valuetext'
	| 'autoCapitalize'
	| 'autoCorrect'
	| 'autoFocus'
	| 'autoSave'
	| 'children'
	| 'className'
	| 'color'
	| 'content'
	| 'contentEditable'
	| 'contextMenu'
	| 'dangerouslySetInnerHTML'
	| 'datatype'
	| 'defaultChecked'
	| 'defaultValue'
	| 'dir'
	| 'disabled'
	| 'draggable'
	| 'elementRef'
	| 'enterKeyHint'
	| 'exportparts'
	| 'hidden'
	| 'id'
	| 'inlist'
	| 'inputMode'
	| 'is'
	| 'itemID'
	| 'itemProp'
	| 'itemRef'
	| 'itemScope'
	| 'itemType'
	| 'lang'
	| 'nonce'
	| 'onAbort'
	| 'onAbortCapture'
	| 'onAnimationEnd'
	| 'onAnimationEndCapture'
	| 'onAnimationIteration'
	| 'onAnimationIterationCapture'
	| 'onAnimationStart'
	| 'onAnimationStartCapture'
	| 'onAuxClick'
	| 'onAuxClickCapture'
	| 'onBeforeInput'
	| 'onBeforeInputCapture'
	| 'onBlur'
	| 'onBlurCapture'
	| 'onCanPlay'
	| 'onCanPlayCapture'
	| 'onCanPlayThrough'
	| 'onCanPlayThroughCapture'
	| 'onChange'
	| 'onChangeCapture'
	| 'onClick'
	| 'onClickCapture'
	| 'onCompositionEnd'
	| 'onCompositionEndCapture'
	| 'onCompositionStart'
	| 'onCompositionStartCapture'
	| 'onCompositionUpdate'
	| 'onCompositionUpdateCapture'
	| 'onContextMenu'
	| 'onContextMenuCapture'
	| 'onCopy'
	| 'onCopyCapture'
	| 'onCut'
	| 'onCutCapture'
	| 'onDoubleClick'
	| 'onDoubleClickCapture'
	| 'onDrag'
	| 'onDragCapture'
	| 'onDragEnd'
	| 'onDragEndCapture'
	| 'onDragEnter'
	| 'onDragEnterCapture'
	| 'onDragExit'
	| 'onDragExitCapture'
	| 'onDragLeave'
	| 'onDragLeaveCapture'
	| 'onDragOver'
	| 'onDragOverCapture'
	| 'onDragStart'
	| 'onDragStartCapture'
	| 'onDrop'
	| 'onDropCapture'
	| 'onDurationChange'
	| 'onDurationChangeCapture'
	| 'onEmptied'
	| 'onEmptiedCapture'
	| 'onEncrypted'
	| 'onEncryptedCapture'
	| 'onEnded'
	| 'onEndedCapture'
	| 'onError'
	| 'onErrorCapture'
	| 'onFocus'
	| 'onFocusCapture'
	| 'onGotPointerCapture'
	| 'onGotPointerCaptureCapture'
	| 'onInput'
	| 'onInputCapture'
	| 'onInvalid'
	| 'onInvalidCapture'
	| 'onKeyDown'
	| 'onKeyDownCapture'
	| 'onKeyPress'
	| 'onKeyPressCapture'
	| 'onKeyUp'
	| 'onKeyUpCapture'
	| 'onLoad'
	| 'onLoadCapture'
	| 'onLoadStart'
	| 'onLoadStartCapture'
	| 'onLoadedData'
	| 'onLoadedDataCapture'
	| 'onLoadedMetadata'
	| 'onLoadedMetadataCapture'
	| 'onLostPointerCapture'
	| 'onLostPointerCaptureCapture'
	| 'onMouseDown'
	| 'onMouseDownCapture'
	| 'onMouseEnter'
	| 'onMouseLeave'
	| 'onMouseMove'
	| 'onMouseMoveCapture'
	| 'onMouseOut'
	| 'onMouseOutCapture'
	| 'onMouseOver'
	| 'onMouseOverCapture'
	| 'onMouseUp'
	| 'onMouseUpCapture'
	| 'onPaste'
	| 'onPasteCapture'
	| 'onPause'
	| 'onPauseCapture'
	| 'onPlay'
	| 'onPlayCapture'
	| 'onPlaying'
	| 'onPlayingCapture'
	| 'onPointerCancel'
	| 'onPointerCancelCapture'
	| 'onPointerDown'
	| 'onPointerDownCapture'
	| 'onPointerEnter'
	| 'onPointerLeave'
	| 'onPointerMove'
	| 'onPointerMoveCapture'
	| 'onPointerOut'
	| 'onPointerOutCapture'
	| 'onPointerOver'
	| 'onPointerOverCapture'
	| 'onPointerUp'
	| 'onPointerUpCapture'
	| 'onProgress'
	| 'onProgressCapture'
	| 'onRateChange'
	| 'onRateChangeCapture'
	| 'onReset'
	| 'onResetCapture'
	| 'onScroll'
	| 'onScrollCapture'
	| 'onSeeked'
	| 'onSeekedCapture'
	| 'onSeeking'
	| 'onSeekingCapture'
	| 'onSelect'
	| 'onSelectCapture'
	| 'onStalled'
	| 'onStalledCapture'
	| 'onSubmit'
	| 'onSubmitCapture'
	| 'onSuspend'
	| 'onSuspendCapture'
	| 'onTimeUpdate'
	| 'onTimeUpdateCapture'
	| 'onTouchCancel'
	| 'onTouchCancelCapture'
	| 'onTouchEnd'
	| 'onTouchEndCapture'
	| 'onTouchMove'
	| 'onTouchMoveCapture'
	| 'onTouchStart'
	| 'onTouchStartCapture'
	| 'onTransitionEnd'
	| 'onTransitionEndCapture'
	| 'onVolumeChange'
	| 'onVolumeChangeCapture'
	| 'onWaiting'
	| 'onWaitingCapture'
	| 'onWheel'
	| 'onWheelCapture'
	| 'part'
	| 'prefix'
	| 'property'
	| 'radioGroup'
	| 'rel'
	| 'resource'
	| 'results'
	| 'rev'
	| 'security'
	| 'slot'
	| 'spellCheck'
	| 'style'
	| 'suppressContentEditableWarning'
	| 'suppressHydrationWarning'
	| 'title'
	| 'translate'
	| 'typeof'
	| 'unselectable'
	| 'vocab';
type SharedKeys2 =
	| 'defaultLayout'
	| 'disableCursor'
	| 'groupRef'
	| 'onLayoutChange'
	| 'onLayoutChanged'
	| 'orientation'
	| 'resizeTargetMinimumSize';
type SharedKeys3 = 'role' | 'tabIndex';
type SharedKeys4 = 'getItem' | 'setItem';
type SharedKeys5 =
	| 'anchor'
	| 'at'
	| 'big'
	| 'blink'
	| 'bold'
	| 'charAt'
	| 'charCodeAt'
	| 'codePointAt'
	| 'concat'
	| 'endsWith'
	| 'fixed'
	| 'fontcolor'
	| 'fontsize'
	| 'includes'
	| 'indexOf'
	| 'isWellFormed'
	| 'italics'
	| 'lastIndexOf'
	| 'length'
	| 'link'
	| 'localeCompare'
	| 'match'
	| 'matchAll'
	| 'normalize'
	| 'padEnd'
	| 'padStart'
	| 'repeat'
	| 'replace'
	| 'replaceAll'
	| 'search'
	| 'slice'
	| 'small'
	| 'split'
	| 'startsWith'
	| 'strike'
	| 'sub'
	| 'substr'
	| 'substring'
	| 'sup'
	| 'toLocaleLowerCase'
	| 'toLocaleUpperCase'
	| 'toLowerCase'
	| 'toString'
	| 'toUpperCase'
	| 'toWellFormed'
	| 'trim'
	| 'trimEnd'
	| 'trimLeft'
	| 'trimRight'
	| 'trimStart'
	| 'valueOf'
	| typeof Symbol.iterator;
type SharedKeys6 = 'collapse' | 'expand' | 'getSize' | 'isCollapsed' | 'resize';
type SharedKeys7 =
	| 'collapsedSize'
	| 'collapsible'
	| 'defaultSize'
	| 'groupResizeBehavior'
	| 'maxSize'
	| 'minSize'
	| 'onResize'
	| 'panelRef';
type SharedKeys8 = 'asPercentage' | 'inPixels';
type PublishedKeys0 = SharedKeys0;
type PublishedKeys1 = SharedKeys1 | SharedKeys2 | SharedKeys3;
type PublishedKeys2 = number | string;
type PublishedKeys3 = 'isUserInteraction';
type PublishedKeys4 = SharedKeys4;
type PublishedKeys5 = number | SharedKeys5;
type PublishedKeys6 = SharedKeys6;
type PublishedKeys7 = SharedKeys1 | SharedKeys3 | SharedKeys7;
type PublishedKeys8 = SharedKeys8;
type PublishedKeys9 = SharedKeys1 | 'disableDoubleClick';

type Contract0 = Assert<Equal<Parameters<typeof Native0.Group>['length'], 1>>;
type Contract1 = Assert<Equal<Parameters<typeof Native0.Panel>['length'], 1>>;
type Contract2 = Assert<Equal<Parameters<typeof Native0.Separator>['length'], 1>>;
// Native custom hooks accept an optional compiler-assigned symbol after their public arguments.
type Contract3 = Assert<Equal<Parameters<typeof Native0.useGroupCallbackRef>['length'], 0 | 1>>;
type Contract4 = Assert<Equal<Parameters<typeof Native0.useGroupRef>['length'], 0 | 1>>;
type Contract5 = Assert<Equal<Parameters<typeof Native0.useDefaultLayout>['length'], 1 | 2>>;
type Contract6 = Assert<Equal<Parameters<typeof Native0.usePanelCallbackRef>['length'], 0 | 1>>;
type Contract7 = Assert<Equal<Parameters<typeof Native0.usePanelRef>['length'], 0 | 1>>;
type Contract8 = Assert<Equal<Parameters<typeof Native0.isCoarsePointer>['length'], 0>>;
type Contract9 = Assert<
	Equal<keyof Pick<Native0.GroupImperativeHandle, PublishedKeys0>, PublishedKeys0>
>;
type Contract10 = Assert<Equal<keyof Pick<Native0.GroupProps, PublishedKeys1>, PublishedKeys1>>;
type Contract11 = Assert<Equal<keyof Pick<Native0.Layout, PublishedKeys2>, PublishedKeys2>>;
type Contract12 = Assert<
	Equal<keyof Pick<Native0.LayoutChangedMeta, PublishedKeys3>, PublishedKeys3>
>;
type Contract13 = Assert<Equal<keyof Pick<Native0.LayoutStorage, PublishedKeys4>, PublishedKeys4>>;
type Contract14 = Assert<Equal<keyof Native0.OnGroupLayoutChange, never>>;
type Contract15 = Assert<Equal<keyof Pick<Native0.Orientation, PublishedKeys5>, PublishedKeys5>>;
type Contract16 = Assert<Equal<keyof Native0.OnPanelResize, never>>;
type Contract17 = Assert<
	Equal<keyof Pick<Native0.PanelImperativeHandle, PublishedKeys6>, PublishedKeys6>
>;
type Contract18 = Assert<Equal<keyof Pick<Native0.PanelProps, PublishedKeys7>, PublishedKeys7>>;
type Contract19 = Assert<Equal<keyof Pick<Native0.PanelSize, PublishedKeys8>, PublishedKeys8>>;
type Contract20 = Assert<Equal<keyof Pick<Native0.SizeUnit, PublishedKeys5>, PublishedKeys5>>;
type Contract21 = Assert<Equal<keyof Pick<Native0.SeparatorProps, PublishedKeys9>, PublishedKeys9>>;

type Slot_useGroupCallbackRef = Assert<
	Equal<Parameters<typeof Native0.useGroupCallbackRef>[0], symbol | undefined>
>;

type Slot_useGroupRef = Assert<
	Equal<Parameters<typeof Native0.useGroupRef>[0], symbol | undefined>
>;

type Slot_usePanelCallbackRef = Assert<
	Equal<Parameters<typeof Native0.usePanelCallbackRef>[0], symbol | undefined>
>;

type Slot_usePanelRef = Assert<
	Equal<Parameters<typeof Native0.usePanelRef>[0], symbol | undefined>
>;

type DefaultLayoutSlot = Assert<
	Equal<Parameters<typeof Native0.useDefaultLayout>[1], symbol | undefined>
>;
