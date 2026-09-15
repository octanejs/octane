/** @jsxImportSource octane */
// Consumer assertions derived from the pinned npm declarations.
// Every published export participates in a consumer assertion against the pinned npm types.
// Property presence and callable arity complement the recursive opacity audit,
// the complete upstream type suite, and the handwritten inference/negative examples.
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import type * as Native0 from 'framer-motion';

type SharedKeys0 = 'peak' | 'strength';
type SharedKeys1 = 'autoplay' | 'driver' | 'elapsed';
type SharedKeys2 = 'bounce' | 'visualDuration';
type SharedKeys3 = 'bounceDamping' | 'bounceStiffness';
type SharedKeys4 = 'damping' | 'mass' | 'stiffness';
type SharedKeys5 = 'delayChildren' | 'staggerChildren' | 'staggerDirection' | 'when';
type SharedKeys6 = 'max' | 'min';
type SharedKeys7 = 'modifyTarget' | 'power' | 'timeConstant';
type SharedKeys8 = 'repeatDelay' | 'repeatType';
type SharedKeys9 = 'restDelta' | 'restSpeed';
type SharedKeys10 =
	| 'addEventListener'
	| 'animationCommitId'
	| 'animationValues'
	| 'applyProjectionStyles'
	| 'applyTransform'
	| 'blockUpdate'
	| 'calcProjection'
	| 'checkUpdateFailed'
	| 'clearMeasurements'
	| 'clearSnapshot'
	| 'currentAnimation'
	| 'didUpdate'
	| 'finishAnimation'
	| 'getClosestProjectingParent'
	| 'getStack'
	| 'hasCheckedOptimisedAppear'
	| 'hasListeners'
	| 'hasTreeAnimated'
	| 'hide'
	| 'instance'
	| 'isAnimationBlocked'
	| 'isLayoutDirty'
	| 'isLead'
	| 'isProjecting'
	| 'isProjectionDirty'
	| 'isSharedProjectionDirty'
	| 'isTransformDirty'
	| 'isTreeAnimating'
	| 'isTreeAnimationBlocked'
	| 'isUpdateBlocked'
	| 'isUpdating'
	| 'isVisible'
	| 'layoutVersion'
	| 'linkedParentVersion'
	| 'measure'
	| 'measurePageBox'
	| 'needsReset'
	| 'notifyListeners'
	| 'preserveOpacity'
	| 'prevTransformTemplateValue'
	| 'projectionDeltaWithTransform'
	| 'promote'
	| 'registerSharedNode'
	| 'relativeParent'
	| 'relativeTarget'
	| 'relativeTargetOrigin'
	| 'relegate'
	| 'resetSkewAndRotation'
	| 'resetTree'
	| 'resolveTargetDelta'
	| 'resolvedRelativeTargetAt'
	| 'resumeFrom'
	| 'resumingFrom'
	| 'scheduleCheckAfterUnmount'
	| 'scheduleRender'
	| 'scheduleUpdateProjection'
	| 'scroll'
	| 'setAnimationOrigin'
	| 'setOptions'
	| 'setTargetDelta'
	| 'sharedNodes'
	| 'shouldResetTransform'
	| 'show'
	| 'startAnimation'
	| 'startUpdate'
	| 'targetDelta'
	| 'targetWithTransforms'
	| 'unblockUpdate'
	| 'unmount'
	| 'updateBlockedByResize'
	| 'updateLayout'
	| 'updateManuallyBlocked'
	| 'updateScroll'
	| 'updateSnapshot'
	| 'willUpdate';
type SharedKeys11 = 'projectionDelta' | 'treeScale';
type SharedKeys12 = 'animateVisualElement' | 'interpolateProjection';
type SharedKeys13 =
	| 'anchor'
	| 'blink'
	| 'bold'
	| 'charAt'
	| 'charCodeAt'
	| 'codePointAt'
	| 'endsWith'
	| 'fixed'
	| 'fontcolor'
	| 'fontsize'
	| 'isWellFormed'
	| 'italics'
	| 'localeCompare'
	| 'match'
	| 'matchAll'
	| 'padEnd'
	| 'padStart'
	| 'replace'
	| 'replaceAll'
	| 'startsWith'
	| 'strike'
	| 'substr'
	| 'substring'
	| 'toLocaleLowerCase'
	| 'toLocaleUpperCase'
	| 'toLowerCase'
	| 'toUpperCase'
	| 'toWellFormed'
	| 'trim'
	| 'trimEnd'
	| 'trimLeft'
	| 'trimRight'
	| 'trimStart';
type SharedKeys14 = 'big' | 'link' | 'search' | 'small' | 'sub' | 'sup';
type SharedKeys15 = 'concat' | 'includes' | 'indexOf' | 'lastIndexOf' | 'slice';
type SharedKeys16 = 'delete' | 'has' | typeof Symbol.toStringTag;
type SharedKeys17 = 'WillChange' | 'instantAnimations' | 'mix' | 'useManualTiming';
type SharedKeys18 = 'anchorX' | 'anchorY' | 'presenceAffectsLayout';
type SharedKeys19 =
	'copyWithin' | 'pop' | 'push' | 'reverse' | 'shift' | 'sort' | 'splice' | 'unshift';
type SharedKeys20 = 'entries' | 'forEach' | 'keys';
type SharedKeys21 =
	| 'every'
	| 'find'
	| 'findIndex'
	| 'findLast'
	| 'findLastIndex'
	| 'flat'
	| 'flatMap'
	| 'join'
	| 'reduce'
	| 'reduceRight'
	| 'some'
	| 'toReversed'
	| 'toSorted'
	| 'toSpliced'
	| 'with'
	| typeof Symbol.unscopables;
type SharedKeys22 =
	| 'a'
	| 'abbr'
	| 'address'
	| 'area'
	| 'article'
	| 'aside'
	| 'audio'
	| 'b'
	| 'base'
	| 'bdi'
	| 'bdo'
	| 'blockquote'
	| 'body'
	| 'br'
	| 'button'
	| 'canvas'
	| 'caption'
	| 'center'
	| 'cite'
	| 'code'
	| 'col'
	| 'colgroup'
	| 'data'
	| 'datalist'
	| 'dd'
	| 'del'
	| 'details'
	| 'dfn'
	| 'dialog'
	| 'div'
	| 'dl'
	| 'dt'
	| 'em'
	| 'embed'
	| 'fieldset'
	| 'figcaption'
	| 'figure'
	| 'footer'
	| 'form'
	| 'h1'
	| 'h2'
	| 'h3'
	| 'h4'
	| 'h5'
	| 'h6'
	| 'head'
	| 'header'
	| 'hgroup'
	| 'hr'
	| 'html'
	| 'i'
	| 'iframe'
	| 'img'
	| 'input'
	| 'ins'
	| 'kbd'
	| 'keygen'
	| 'label'
	| 'legend'
	| 'li'
	| 'main'
	| 'mark'
	| 'menu'
	| 'menuitem'
	| 'meta'
	| 'meter'
	| 'nav'
	| 'noindex'
	| 'noscript'
	| 'object'
	| 'ol'
	| 'optgroup'
	| 'option'
	| 'output'
	| 'p'
	| 'param'
	| 'picture'
	| 'pre'
	| 'progress'
	| 'q'
	| 'rp'
	| 'rt'
	| 'ruby'
	| 's'
	| 'samp'
	| 'script'
	| 'section'
	| 'select'
	| 'span'
	| 'strong'
	| 'summary'
	| 'table'
	| 'tbody'
	| 'td'
	| 'template'
	| 'textarea'
	| 'tfoot'
	| 'th'
	| 'thead'
	| 'tr'
	| 'track'
	| 'u'
	| 'ul'
	| 'video'
	| 'wbr'
	| 'webview';
type SharedKeys23 =
	| 'circle'
	| 'defs'
	| 'desc'
	| 'ellipse'
	| 'feBlend'
	| 'feColorMatrix'
	| 'feComponentTransfer'
	| 'feComposite'
	| 'feConvolveMatrix'
	| 'feDiffuseLighting'
	| 'feDisplacementMap'
	| 'feDistantLight'
	| 'feDropShadow'
	| 'feFlood'
	| 'feFuncA'
	| 'feFuncB'
	| 'feFuncG'
	| 'feFuncR'
	| 'feGaussianBlur'
	| 'feImage'
	| 'feMerge'
	| 'feMergeNode'
	| 'feMorphology'
	| 'feOffset'
	| 'fePointLight'
	| 'feSpecularLighting'
	| 'feSpotLight'
	| 'feTile'
	| 'feTurbulence'
	| 'foreignObject'
	| 'g'
	| 'image'
	| 'line'
	| 'linearGradient'
	| 'metadata'
	| 'pattern'
	| 'polygon'
	| 'polyline'
	| 'radialGradient'
	| 'rect'
	| 'svg'
	| 'switch'
	| 'symbol'
	| 'text'
	| 'textPath'
	| 'tspan'
	| 'use'
	| 'view';
type SharedKeys24 = 'clipPath' | 'mask';
type SharedKeys25 = 'slot' | 'title';
type SharedKeys26 = 'focus' | 'hover' | 'inView' | 'pan';
type SharedKeys27 = 'Feature' | 'MeasureLayout' | 'ProjectionNode';
type SharedKeys28 =
	| '_dragX'
	| '_dragY'
	| 'dragConstraints'
	| 'dragControls'
	| 'dragDirectionLock'
	| 'dragElastic'
	| 'dragListener'
	| 'dragMomentum'
	| 'dragPropagation'
	| 'dragSnapToOrigin'
	| 'dragTransition'
	| 'onMeasureDragConstraints'
	| 'whileDrag';
type SharedKeys29 =
	| 'about'
	| 'accessKey'
	| 'autoCapitalize'
	| 'autoCorrect'
	| 'autoFocus'
	| 'autoSave'
	| 'contentEditable'
	| 'contextMenu'
	| 'datatype'
	| 'defaultChecked'
	| 'defaultValue'
	| 'dir'
	| 'draggable'
	| 'hidden'
	| 'inlist'
	| 'inputMode'
	| 'is'
	| 'itemID'
	| 'itemProp'
	| 'itemRef'
	| 'itemScope'
	| 'itemType'
	| 'key'
	| 'prefix'
	| 'property'
	| 'radioGroup'
	| 'ref'
	| 'rel'
	| 'resource'
	| 'results'
	| 'rev'
	| 'security'
	| 'spellCheck'
	| 'suppressContentEditableWarning'
	| 'typeof'
	| 'unselectable'
	| 'vocab';
type SharedKeys30 =
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
	| 'className'
	| 'dangerouslySetInnerHTML'
	| 'lang'
	| 'onAbort'
	| 'onAbortCapture'
	| 'onAnimationEnd'
	| 'onAnimationEndCapture'
	| 'onAnimationIteration'
	| 'onAnimationIterationCapture'
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
	| 'onDragCapture'
	| 'onDragEndCapture'
	| 'onDragEnter'
	| 'onDragEnterCapture'
	| 'onDragExit'
	| 'onDragExitCapture'
	| 'onDragLeave'
	| 'onDragLeaveCapture'
	| 'onDragOver'
	| 'onDragOverCapture'
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
	| 'onResize'
	| 'onResizeCapture'
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
	| 'role'
	| 'suppressHydrationWarning'
	| 'tabIndex';
type SharedKeys31 = 'data-framer-appear-id' | 'ignoreStrict' | 'transformTemplate';
type SharedKeys32 = 'data-framer-portal-id' | 'layoutCrossfade';
type SharedKeys33 = 'globalTapTarget' | 'onTap' | 'onTapCancel' | 'onTapStart' | 'whileTap';
type SharedKeys34 =
	'layoutAnchor' | 'layoutDependency' | 'layoutId' | 'layoutRoot' | 'layoutScroll';
type SharedKeys35 = 'onAnimationComplete' | 'onAnimationStart';
type SharedKeys36 = 'onBeforeLayoutMeasure' | 'onLayoutMeasure';
type SharedKeys37 =
	'onDirectionLock' | 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onDragTransitionEnd';
type SharedKeys38 = 'onHoverEnd' | 'onHoverStart' | 'whileHover';
type SharedKeys39 = 'onLayoutAnimationComplete' | 'onLayoutAnimationStart';
type SharedKeys40 = 'onPan' | 'onPanEnd' | 'onPanSessionStart' | 'onPanStart';
type SharedKeys41 = 'onViewportEnter' | 'onViewportLeave' | 'viewport' | 'whileInView';
type SharedKeys42 = 'features' | 'strict';
type SharedKeys43 = 'isStatic' | 'reducedMotion' | 'transformPagePoint';
type SharedKeys44 =
	| 'KhtmlBoxAlign'
	| 'KhtmlBoxDirection'
	| 'KhtmlBoxFlex'
	| 'KhtmlBoxFlexGroup'
	| 'KhtmlBoxLines'
	| 'KhtmlBoxOrdinalGroup'
	| 'KhtmlBoxOrient'
	| 'KhtmlBoxPack'
	| 'KhtmlLineBreak'
	| 'KhtmlOpacity'
	| 'KhtmlUserSelect'
	| 'MozAnimation'
	| 'MozAnimationDelay'
	| 'MozAnimationDirection'
	| 'MozAnimationDuration'
	| 'MozAnimationFillMode'
	| 'MozAnimationIterationCount'
	| 'MozAnimationName'
	| 'MozAnimationPlayState'
	| 'MozAnimationTimingFunction'
	| 'MozAppearance'
	| 'MozBackfaceVisibility'
	| 'MozBackgroundClip'
	| 'MozBackgroundOrigin'
	| 'MozBackgroundSize'
	| 'MozBinding'
	| 'MozBorderBottomColors'
	| 'MozBorderEndColor'
	| 'MozBorderEndStyle'
	| 'MozBorderEndWidth'
	| 'MozBorderImage'
	| 'MozBorderLeftColors'
	| 'MozBorderRadius'
	| 'MozBorderRadiusBottomleft'
	| 'MozBorderRadiusBottomright'
	| 'MozBorderRadiusTopleft'
	| 'MozBorderRadiusTopright'
	| 'MozBorderRightColors'
	| 'MozBorderStartColor'
	| 'MozBorderStartStyle'
	| 'MozBorderTopColors'
	| 'MozBoxAlign'
	| 'MozBoxDirection'
	| 'MozBoxFlex'
	| 'MozBoxOrdinalGroup'
	| 'MozBoxOrient'
	| 'MozBoxPack'
	| 'MozBoxShadow'
	| 'MozBoxSizing'
	| 'MozColumnCount'
	| 'MozColumnFill'
	| 'MozColumnRule'
	| 'MozColumnRuleColor'
	| 'MozColumnRuleStyle'
	| 'MozColumnRuleWidth'
	| 'MozColumnWidth'
	| 'MozColumns'
	| 'MozContextProperties'
	| 'MozFloatEdge'
	| 'MozFontFeatureSettings'
	| 'MozFontLanguageOverride'
	| 'MozForceBrokenImageIcon'
	| 'MozHyphens'
	| 'MozMarginEnd'
	| 'MozMarginStart'
	| 'MozOpacity'
	| 'MozOrient'
	| 'MozOsxFontSmoothing'
	| 'MozOutline'
	| 'MozOutlineColor'
	| 'MozOutlineRadius'
	| 'MozOutlineRadiusBottomleft'
	| 'MozOutlineRadiusBottomright'
	| 'MozOutlineRadiusTopleft'
	| 'MozOutlineRadiusTopright'
	| 'MozOutlineStyle'
	| 'MozOutlineWidth'
	| 'MozPaddingEnd'
	| 'MozPaddingStart'
	| 'MozPerspective'
	| 'MozPerspectiveOrigin'
	| 'MozStackSizing'
	| 'MozTabSize'
	| 'MozTextAlignLast'
	| 'MozTextBlink'
	| 'MozTextDecorationColor'
	| 'MozTextDecorationLine'
	| 'MozTextDecorationStyle'
	| 'MozTextSizeAdjust'
	| 'MozTransform'
	| 'MozTransformOrigin'
	| 'MozTransformStyle'
	| 'MozTransition'
	| 'MozTransitionDelay'
	| 'MozTransitionDuration'
	| 'MozTransitionProperty'
	| 'MozTransitionTimingFunction'
	| 'MozUserFocus'
	| 'MozUserInput'
	| 'MozUserModify'
	| 'MozUserSelect'
	| 'MozWindowDragging'
	| 'MozWindowShadow'
	| 'OAnimation'
	| 'OAnimationDelay'
	| 'OAnimationDirection'
	| 'OAnimationDuration'
	| 'OAnimationFillMode'
	| 'OAnimationIterationCount'
	| 'OAnimationName'
	| 'OAnimationPlayState'
	| 'OAnimationTimingFunction'
	| 'OBackgroundSize'
	| 'OBorderImage'
	| 'OObjectFit'
	| 'OObjectPosition'
	| 'OTabSize'
	| 'OTextOverflow'
	| 'OTransform'
	| 'OTransformOrigin'
	| 'OTransition'
	| 'OTransitionDelay'
	| 'OTransitionDuration'
	| 'OTransitionProperty'
	| 'OTransitionTimingFunction'
	| 'WebkitAlignContent'
	| 'WebkitAlignItems'
	| 'WebkitAlignSelf'
	| 'WebkitAnimation'
	| 'WebkitAnimationDelay'
	| 'WebkitAnimationDirection'
	| 'WebkitAnimationDuration'
	| 'WebkitAnimationFillMode'
	| 'WebkitAnimationIterationCount'
	| 'WebkitAnimationName'
	| 'WebkitAnimationPlayState'
	| 'WebkitAnimationTimingFunction'
	| 'WebkitAppearance'
	| 'WebkitBackdropFilter'
	| 'WebkitBackfaceVisibility'
	| 'WebkitBackgroundClip'
	| 'WebkitBackgroundOrigin'
	| 'WebkitBackgroundSize'
	| 'WebkitBorderBefore'
	| 'WebkitBorderBeforeColor'
	| 'WebkitBorderBeforeStyle'
	| 'WebkitBorderBeforeWidth'
	| 'WebkitBorderBottomLeftRadius'
	| 'WebkitBorderBottomRightRadius'
	| 'WebkitBorderImage'
	| 'WebkitBorderImageSlice'
	| 'WebkitBorderRadius'
	| 'WebkitBorderTopLeftRadius'
	| 'WebkitBorderTopRightRadius'
	| 'WebkitBoxAlign'
	| 'WebkitBoxDecorationBreak'
	| 'WebkitBoxDirection'
	| 'WebkitBoxFlex'
	| 'WebkitBoxFlexGroup'
	| 'WebkitBoxLines'
	| 'WebkitBoxOrdinalGroup'
	| 'WebkitBoxOrient'
	| 'WebkitBoxPack'
	| 'WebkitBoxReflect'
	| 'WebkitBoxShadow'
	| 'WebkitBoxSizing'
	| 'WebkitClipPath'
	| 'WebkitColumnCount'
	| 'WebkitColumnFill'
	| 'WebkitColumnRule'
	| 'WebkitColumnRuleColor'
	| 'WebkitColumnRuleStyle'
	| 'WebkitColumnRuleWidth'
	| 'WebkitColumnSpan'
	| 'WebkitColumnWidth'
	| 'WebkitColumns'
	| 'WebkitFilter'
	| 'WebkitFlex'
	| 'WebkitFlexBasis'
	| 'WebkitFlexDirection'
	| 'WebkitFlexFlow'
	| 'WebkitFlexGrow'
	| 'WebkitFlexShrink'
	| 'WebkitFlexWrap'
	| 'WebkitFontFeatureSettings'
	| 'WebkitFontKerning'
	| 'WebkitFontSmoothing'
	| 'WebkitFontVariantLigatures'
	| 'WebkitHyphenateCharacter'
	| 'WebkitHyphens'
	| 'WebkitInitialLetter'
	| 'WebkitJustifyContent'
	| 'WebkitLineBreak'
	| 'WebkitLineClamp'
	| 'WebkitLogicalHeight'
	| 'WebkitLogicalWidth'
	| 'WebkitMarginEnd'
	| 'WebkitMarginStart'
	| 'WebkitMask'
	| 'WebkitMaskAttachment'
	| 'WebkitMaskBoxImage'
	| 'WebkitMaskBoxImageOutset'
	| 'WebkitMaskBoxImageRepeat'
	| 'WebkitMaskBoxImageSlice'
	| 'WebkitMaskBoxImageSource'
	| 'WebkitMaskBoxImageWidth'
	| 'WebkitMaskClip'
	| 'WebkitMaskComposite'
	| 'WebkitMaskImage'
	| 'WebkitMaskOrigin'
	| 'WebkitMaskPosition'
	| 'WebkitMaskPositionX'
	| 'WebkitMaskPositionY'
	| 'WebkitMaskRepeat'
	| 'WebkitMaskRepeatX'
	| 'WebkitMaskRepeatY'
	| 'WebkitMaskSize'
	| 'WebkitMaxInlineSize'
	| 'WebkitOrder'
	| 'WebkitOverflowScrolling'
	| 'WebkitPaddingEnd'
	| 'WebkitPaddingStart'
	| 'WebkitPerspective'
	| 'WebkitPerspectiveOrigin'
	| 'WebkitPrintColorAdjust'
	| 'WebkitRubyPosition'
	| 'WebkitScrollSnapType'
	| 'WebkitShapeMargin'
	| 'WebkitTapHighlightColor'
	| 'WebkitTextCombine'
	| 'WebkitTextDecorationColor'
	| 'WebkitTextDecorationLine'
	| 'WebkitTextDecorationSkip'
	| 'WebkitTextDecorationStyle'
	| 'WebkitTextEmphasis'
	| 'WebkitTextEmphasisColor'
	| 'WebkitTextEmphasisPosition'
	| 'WebkitTextEmphasisStyle'
	| 'WebkitTextFillColor'
	| 'WebkitTextOrientation'
	| 'WebkitTextSizeAdjust'
	| 'WebkitTextStroke'
	| 'WebkitTextStrokeColor'
	| 'WebkitTextStrokeWidth'
	| 'WebkitTextUnderlinePosition'
	| 'WebkitTouchCallout'
	| 'WebkitTransform'
	| 'WebkitTransformOrigin'
	| 'WebkitTransformStyle'
	| 'WebkitTransition'
	| 'WebkitTransitionDelay'
	| 'WebkitTransitionDuration'
	| 'WebkitTransitionProperty'
	| 'WebkitTransitionTimingFunction'
	| 'WebkitUserModify'
	| 'WebkitUserSelect'
	| 'WebkitWritingMode'
	| 'alignTracks'
	| 'anchorName'
	| 'anchorScope'
	| 'animationRange'
	| 'animationRangeEnd'
	| 'animationRangeStart'
	| 'animationTimeline'
	| 'boxAlign'
	| 'boxDirection'
	| 'boxFlex'
	| 'boxFlexGroup'
	| 'boxLines'
	| 'boxOrdinalGroup'
	| 'boxOrient'
	| 'boxPack'
	| 'caret'
	| 'caretShape'
	| 'colorAdjust'
	| 'fieldSizing'
	| 'fontLanguageOverride'
	| 'fontSmooth'
	| 'fontSynthesisPosition'
	| 'fontVariantEmoji'
	| 'fontWidth'
	| 'hangingPunctuation'
	| 'imageResolution'
	| 'imeMode'
	| 'initialLetter'
	| 'initialLetterAlign'
	| 'insetArea'
	| 'interpolateSize'
	| 'justifyTracks'
	| 'lineClamp'
	| 'lineHeightStep'
	| 'marginTrim'
	| 'maskBorder'
	| 'maskBorderMode'
	| 'maskBorderOutset'
	| 'maskBorderRepeat'
	| 'maskBorderSlice'
	| 'maskBorderSource'
	| 'maskBorderWidth'
	| 'masonryAutoFlow'
	| 'mathShift'
	| 'maxLines'
	| 'motion'
	| 'motionDistance'
	| 'motionPath'
	| 'motionRotation'
	| 'msAccelerator'
	| 'msBlockProgression'
	| 'msContentZoomChaining'
	| 'msContentZoomLimit'
	| 'msContentZoomLimitMax'
	| 'msContentZoomLimitMin'
	| 'msContentZoomSnap'
	| 'msContentZoomSnapPoints'
	| 'msContentZoomSnapType'
	| 'msContentZooming'
	| 'msFilter'
	| 'msFlex'
	| 'msFlexDirection'
	| 'msFlexPositive'
	| 'msFlowFrom'
	| 'msFlowInto'
	| 'msGridColumns'
	| 'msGridRows'
	| 'msHighContrastAdjust'
	| 'msHyphenateLimitChars'
	| 'msHyphenateLimitLines'
	| 'msHyphenateLimitZone'
	| 'msHyphens'
	| 'msImeAlign'
	| 'msImeMode'
	| 'msLineBreak'
	| 'msOrder'
	| 'msOverflowStyle'
	| 'msOverflowX'
	| 'msOverflowY'
	| 'msScrollChaining'
	| 'msScrollLimit'
	| 'msScrollLimitXMax'
	| 'msScrollLimitXMin'
	| 'msScrollLimitYMax'
	| 'msScrollLimitYMin'
	| 'msScrollRails'
	| 'msScrollSnapPointsX'
	| 'msScrollSnapPointsY'
	| 'msScrollSnapType'
	| 'msScrollSnapX'
	| 'msScrollSnapY'
	| 'msScrollTranslation'
	| 'msScrollbar3dlightColor'
	| 'msScrollbarArrowColor'
	| 'msScrollbarBaseColor'
	| 'msScrollbarDarkshadowColor'
	| 'msScrollbarFaceColor'
	| 'msScrollbarHighlightColor'
	| 'msScrollbarShadowColor'
	| 'msScrollbarTrackColor'
	| 'msTextAutospace'
	| 'msTextCombineHorizontal'
	| 'msTextOverflow'
	| 'msTouchAction'
	| 'msTouchSelect'
	| 'msTransform'
	| 'msTransformOrigin'
	| 'msTransition'
	| 'msTransitionDelay'
	| 'msTransitionDuration'
	| 'msTransitionProperty'
	| 'msTransitionTimingFunction'
	| 'msUserSelect'
	| 'msWordBreak'
	| 'msWrapFlow'
	| 'msWrapMargin'
	| 'msWrapThrough'
	| 'msWritingMode'
	| 'objectViewBox'
	| 'offsetBlock'
	| 'offsetBlockEnd'
	| 'offsetBlockStart'
	| 'offsetInline'
	| 'offsetInlineEnd'
	| 'offsetInlineStart'
	| 'offsetRotation'
	| 'overflowClipBox'
	| 'overlay'
	| 'positionAnchor'
	| 'positionArea'
	| 'positionTry'
	| 'positionTryFallbacks'
	| 'positionTryOptions'
	| 'positionTryOrder'
	| 'positionVisibility'
	| 'rubyMerge'
	| 'rubyOverhang'
	| 'scrollInitialTarget'
	| 'scrollSnapCoordinate'
	| 'scrollSnapDestination'
	| 'scrollSnapMargin'
	| 'scrollSnapMarginBottom'
	| 'scrollSnapMarginLeft'
	| 'scrollSnapMarginRight'
	| 'scrollSnapMarginTop'
	| 'scrollSnapPointsX'
	| 'scrollSnapPointsY'
	| 'scrollSnapTypeX'
	| 'scrollSnapTypeY'
	| 'scrollTimeline'
	| 'scrollTimelineAxis'
	| 'scrollTimelineName'
	| 'speakAs'
	| 'strokeColor'
	| 'textAutospace'
	| 'textDecorationSkip'
	| 'textJustify'
	| 'textSizeAdjust'
	| 'textSpacingTrim'
	| 'timelineScope'
	| 'viewTimeline'
	| 'viewTimelineAxis'
	| 'viewTimelineInset'
	| 'viewTimelineName';
type SharedKeys45 =
	| 'accentColor'
	| 'alignContent'
	| 'alignItems'
	| 'alignSelf'
	| 'all'
	| 'animationComposition'
	| 'animationDelay'
	| 'animationDirection'
	| 'animationDuration'
	| 'animationFillMode'
	| 'animationIterationCount'
	| 'animationName'
	| 'animationPlayState'
	| 'animationTimingFunction'
	| 'appearance'
	| 'aspectRatio'
	| 'backdropFilter'
	| 'backfaceVisibility'
	| 'background'
	| 'backgroundAttachment'
	| 'backgroundBlendMode'
	| 'backgroundClip'
	| 'backgroundColor'
	| 'backgroundImage'
	| 'backgroundOrigin'
	| 'backgroundPosition'
	| 'backgroundPositionX'
	| 'backgroundPositionY'
	| 'backgroundRepeat'
	| 'backgroundSize'
	| 'blockSize'
	| 'border'
	| 'borderBlock'
	| 'borderBlockColor'
	| 'borderBlockEnd'
	| 'borderBlockEndColor'
	| 'borderBlockEndStyle'
	| 'borderBlockEndWidth'
	| 'borderBlockStart'
	| 'borderBlockStartColor'
	| 'borderBlockStartStyle'
	| 'borderBlockStartWidth'
	| 'borderBlockStyle'
	| 'borderBlockWidth'
	| 'borderBottom'
	| 'borderBottomColor'
	| 'borderBottomLeftRadius'
	| 'borderBottomRightRadius'
	| 'borderBottomStyle'
	| 'borderBottomWidth'
	| 'borderCollapse'
	| 'borderColor'
	| 'borderEndEndRadius'
	| 'borderEndStartRadius'
	| 'borderImage'
	| 'borderImageOutset'
	| 'borderImageRepeat'
	| 'borderImageSlice'
	| 'borderImageSource'
	| 'borderImageWidth'
	| 'borderInline'
	| 'borderInlineColor'
	| 'borderInlineEnd'
	| 'borderInlineEndColor'
	| 'borderInlineEndStyle'
	| 'borderInlineEndWidth'
	| 'borderInlineStart'
	| 'borderInlineStartColor'
	| 'borderInlineStartStyle'
	| 'borderInlineStartWidth'
	| 'borderInlineStyle'
	| 'borderInlineWidth'
	| 'borderLeft'
	| 'borderLeftColor'
	| 'borderLeftStyle'
	| 'borderLeftWidth'
	| 'borderRadius'
	| 'borderRight'
	| 'borderRightColor'
	| 'borderRightStyle'
	| 'borderRightWidth'
	| 'borderSpacing'
	| 'borderStartEndRadius'
	| 'borderStartStartRadius'
	| 'borderStyle'
	| 'borderTop'
	| 'borderTopColor'
	| 'borderTopLeftRadius'
	| 'borderTopRightRadius'
	| 'borderTopStyle'
	| 'borderTopWidth'
	| 'borderWidth'
	| 'boxDecorationBreak'
	| 'boxShadow'
	| 'boxSizing'
	| 'breakAfter'
	| 'breakBefore'
	| 'breakInside'
	| 'captionSide'
	| 'caretColor'
	| 'colorScheme'
	| 'columnCount'
	| 'columnFill'
	| 'columnGap'
	| 'columnRule'
	| 'columnRuleColor'
	| 'columnRuleStyle'
	| 'columnRuleWidth'
	| 'columnSpan'
	| 'columnWidth'
	| 'columns'
	| 'contain'
	| 'containIntrinsicBlockSize'
	| 'containIntrinsicHeight'
	| 'containIntrinsicInlineSize'
	| 'containIntrinsicSize'
	| 'containIntrinsicWidth'
	| 'containerName'
	| 'containerType'
	| 'contentVisibility'
	| 'counterIncrement'
	| 'counterReset'
	| 'counterSet'
	| 'emptyCells'
	| 'flex'
	| 'flexBasis'
	| 'flexDirection'
	| 'flexFlow'
	| 'flexGrow'
	| 'flexShrink'
	| 'flexWrap'
	| 'float'
	| 'font'
	| 'fontFeatureSettings'
	| 'fontKerning'
	| 'fontOpticalSizing'
	| 'fontPalette'
	| 'fontSynthesis'
	| 'fontSynthesisSmallCaps'
	| 'fontSynthesisStyle'
	| 'fontSynthesisWeight'
	| 'fontVariantAlternates'
	| 'fontVariantCaps'
	| 'fontVariantEastAsian'
	| 'fontVariantLigatures'
	| 'fontVariantNumeric'
	| 'fontVariantPosition'
	| 'fontVariationSettings'
	| 'forcedColorAdjust'
	| 'gap'
	| 'grid'
	| 'gridArea'
	| 'gridAutoColumns'
	| 'gridAutoFlow'
	| 'gridAutoRows'
	| 'gridColumn'
	| 'gridColumnEnd'
	| 'gridColumnGap'
	| 'gridColumnStart'
	| 'gridGap'
	| 'gridRow'
	| 'gridRowEnd'
	| 'gridRowGap'
	| 'gridRowStart'
	| 'gridTemplate'
	| 'gridTemplateAreas'
	| 'gridTemplateColumns'
	| 'gridTemplateRows'
	| 'hyphenateCharacter'
	| 'hyphenateLimitChars'
	| 'hyphens'
	| 'imageOrientation'
	| 'inlineSize'
	| 'inset'
	| 'insetBlock'
	| 'insetBlockEnd'
	| 'insetBlockStart'
	| 'insetInline'
	| 'insetInlineEnd'
	| 'insetInlineStart'
	| 'isolation'
	| 'justifyContent'
	| 'justifyItems'
	| 'justifySelf'
	| 'lineBreak'
	| 'lineHeight'
	| 'listStyle'
	| 'listStyleImage'
	| 'listStylePosition'
	| 'listStyleType'
	| 'marginBlock'
	| 'marginBlockEnd'
	| 'marginBlockStart'
	| 'marginBottom'
	| 'marginInline'
	| 'marginInlineEnd'
	| 'marginInlineStart'
	| 'marginLeft'
	| 'marginRight'
	| 'marginTop'
	| 'maskClip'
	| 'maskComposite'
	| 'maskImage'
	| 'maskMode'
	| 'maskOrigin'
	| 'maskPosition'
	| 'maskRepeat'
	| 'maskSize'
	| 'maskType'
	| 'mathDepth'
	| 'mathStyle'
	| 'maxBlockSize'
	| 'maxHeight'
	| 'maxInlineSize'
	| 'maxWidth'
	| 'minBlockSize'
	| 'minHeight'
	| 'minInlineSize'
	| 'minWidth'
	| 'mixBlendMode'
	| 'objectFit'
	| 'objectPosition'
	| 'offsetAnchor'
	| 'offsetDistance'
	| 'offsetPath'
	| 'offsetPosition'
	| 'offsetRotate'
	| 'orphans'
	| 'outline'
	| 'outlineColor'
	| 'outlineOffset'
	| 'outlineStyle'
	| 'outlineWidth'
	| 'overflowAnchor'
	| 'overflowBlock'
	| 'overflowClipMargin'
	| 'overflowInline'
	| 'overflowWrap'
	| 'overflowX'
	| 'overflowY'
	| 'overscrollBehavior'
	| 'overscrollBehaviorBlock'
	| 'overscrollBehaviorInline'
	| 'overscrollBehaviorX'
	| 'overscrollBehaviorY'
	| 'padding'
	| 'paddingBlock'
	| 'paddingBlockEnd'
	| 'paddingBlockStart'
	| 'paddingBottom'
	| 'paddingInline'
	| 'paddingInlineEnd'
	| 'paddingInlineStart'
	| 'paddingLeft'
	| 'paddingRight'
	| 'paddingTop'
	| 'page'
	| 'pageBreakAfter'
	| 'pageBreakBefore'
	| 'pageBreakInside'
	| 'perspectiveOrigin'
	| 'placeContent'
	| 'placeItems'
	| 'placeSelf'
	| 'position'
	| 'printColorAdjust'
	| 'quotes'
	| 'resize'
	| 'rowGap'
	| 'rubyAlign'
	| 'rubyPosition'
	| 'scrollBehavior'
	| 'scrollMargin'
	| 'scrollMarginBlock'
	| 'scrollMarginBlockEnd'
	| 'scrollMarginBlockStart'
	| 'scrollMarginBottom'
	| 'scrollMarginInline'
	| 'scrollMarginInlineEnd'
	| 'scrollMarginInlineStart'
	| 'scrollMarginLeft'
	| 'scrollMarginRight'
	| 'scrollMarginTop'
	| 'scrollPadding'
	| 'scrollPaddingBlock'
	| 'scrollPaddingBlockEnd'
	| 'scrollPaddingBlockStart'
	| 'scrollPaddingBottom'
	| 'scrollPaddingInline'
	| 'scrollPaddingInlineEnd'
	| 'scrollPaddingInlineStart'
	| 'scrollPaddingLeft'
	| 'scrollPaddingRight'
	| 'scrollPaddingTop'
	| 'scrollSnapAlign'
	| 'scrollSnapStop'
	| 'scrollSnapType'
	| 'scrollbarColor'
	| 'scrollbarGutter'
	| 'scrollbarWidth'
	| 'shapeImageThreshold'
	| 'shapeMargin'
	| 'shapeOutside'
	| 'tabSize'
	| 'tableLayout'
	| 'textAlign'
	| 'textAlignLast'
	| 'textBox'
	| 'textBoxEdge'
	| 'textBoxTrim'
	| 'textCombineUpright'
	| 'textDecorationColor'
	| 'textDecorationLine'
	| 'textDecorationSkipInk'
	| 'textDecorationStyle'
	| 'textDecorationThickness'
	| 'textEmphasis'
	| 'textEmphasisColor'
	| 'textEmphasisPosition'
	| 'textEmphasisStyle'
	| 'textIndent'
	| 'textOrientation'
	| 'textOverflow'
	| 'textShadow'
	| 'textTransform'
	| 'textUnderlineOffset'
	| 'textUnderlinePosition'
	| 'textWrap'
	| 'textWrapMode'
	| 'textWrapStyle'
	| 'touchAction'
	| 'transformBox'
	| 'transformStyle'
	| 'transitionBehavior'
	| 'transitionDelay'
	| 'transitionDuration'
	| 'transitionProperty'
	| 'transitionTimingFunction'
	| 'userSelect'
	| 'verticalAlign'
	| 'viewTransitionClass'
	| 'viewTransitionName'
	| 'whiteSpace'
	| 'whiteSpaceCollapse'
	| 'widows'
	| 'willChange'
	| 'wordBreak'
	| 'wordWrap'
	| 'zIndex'
	| 'zoom';
type SharedKeys46 =
	| 'alignmentBaseline'
	| 'baselineShift'
	| 'clip'
	| 'clipRule'
	| 'colorInterpolation'
	| 'colorInterpolationFilters'
	| 'cursor'
	| 'cx'
	| 'cy'
	| 'd'
	| 'display'
	| 'dominantBaseline'
	| 'fillOpacity'
	| 'fillRule'
	| 'floodColor'
	| 'floodOpacity'
	| 'fontFamily'
	| 'fontSize'
	| 'fontSizeAdjust'
	| 'fontStretch'
	| 'fontStyle'
	| 'fontVariant'
	| 'fontWeight'
	| 'imageRendering'
	| 'letterSpacing'
	| 'lightingColor'
	| 'markerEnd'
	| 'markerMid'
	| 'markerStart'
	| 'opacity'
	| 'order'
	| 'overflow'
	| 'paintOrder'
	| 'pointerEvents'
	| 'r'
	| 'rx'
	| 'ry'
	| 'shapeRendering'
	| 'stopColor'
	| 'stopOpacity'
	| 'stroke'
	| 'strokeDasharray'
	| 'strokeDashoffset'
	| 'strokeLinecap'
	| 'strokeLinejoin'
	| 'strokeMiterlimit'
	| 'strokeOpacity'
	| 'strokeWidth'
	| 'textAnchor'
	| 'textDecoration'
	| 'textRendering'
	| 'unicodeBidi'
	| 'vectorEffect'
	| 'visibility'
	| 'wordSpacing'
	| 'writingMode';
type SharedKeys47 = 'bottom' | 'left' | 'right' | 'top';
type SharedKeys48 = 'colorRendering' | 'glyphOrientationVertical';
type SharedKeys49 = 'height' | 'width';
type SharedKeys50 = 'originX' | 'originY' | 'originZ';
type SharedKeys51 = 'pathOffset' | 'pathSpacing';
type SharedKeys52 =
	| 'perspective'
	| 'rotateX'
	| 'rotateY'
	| 'rotateZ'
	| 'scaleX'
	| 'scaleY'
	| 'scaleZ'
	| 'skewX'
	| 'skewY'
	| 'transformPerspective'
	| 'translateX'
	| 'translateY'
	| 'translateZ';
type SharedKeys53 = 'x' | 'y';
type SharedKeys54 = 'Group' | 'Item';
type SharedKeys55 =
	| 'accentHeight'
	| 'accumulate'
	| 'additive'
	| 'allowReorder'
	| 'alphabetic'
	| 'amplitude'
	| 'arabicForm'
	| 'ascent'
	| 'attributeName'
	| 'attributeType'
	| 'autoReverse'
	| 'azimuth'
	| 'baseFrequency'
	| 'baseProfile'
	| 'bbox'
	| 'begin'
	| 'bias'
	| 'by'
	| 'calcMode'
	| 'capHeight'
	| 'clipPathUnits'
	| 'colorProfile'
	| 'contentScriptType'
	| 'contentStyleType'
	| 'decelerate'
	| 'descent'
	| 'diffuseConstant'
	| 'divisor'
	| 'dur'
	| 'dx'
	| 'dy'
	| 'edgeMode'
	| 'elevation'
	| 'enableBackground'
	| 'end'
	| 'exponent'
	| 'externalResourcesRequired'
	| 'filterRes'
	| 'filterUnits'
	| 'focusable'
	| 'format'
	| 'fr'
	| 'fx'
	| 'fy'
	| 'g1'
	| 'g2'
	| 'glyphName'
	| 'glyphOrientationHorizontal'
	| 'glyphRef'
	| 'gradientTransform'
	| 'gradientUnits'
	| 'hanging'
	| 'horizAdvX'
	| 'horizOriginX'
	| 'href'
	| 'ideographic'
	| 'in'
	| 'in2'
	| 'intercept'
	| 'k'
	| 'k1'
	| 'k2'
	| 'k3'
	| 'k4'
	| 'kernelMatrix'
	| 'kernelUnitLength'
	| 'kerning'
	| 'keyPoints'
	| 'keySplines'
	| 'keyTimes'
	| 'lengthAdjust'
	| 'limitingConeAngle'
	| 'local'
	| 'markerHeight'
	| 'markerUnits'
	| 'markerWidth'
	| 'maskContentUnits'
	| 'maskUnits'
	| 'mathematical'
	| 'numOctaves'
	| 'operator'
	| 'orient'
	| 'orientation'
	| 'overlinePosition'
	| 'overlineThickness'
	| 'panose1'
	| 'patternContentUnits'
	| 'patternTransform'
	| 'patternUnits'
	| 'points'
	| 'pointsAtX'
	| 'pointsAtY'
	| 'pointsAtZ'
	| 'preserveAlpha'
	| 'preserveAspectRatio'
	| 'primitiveUnits'
	| 'radius'
	| 'refX'
	| 'refY'
	| 'renderingIntent'
	| 'repeatCount'
	| 'repeatDur'
	| 'requiredExtensions'
	| 'requiredFeatures'
	| 'restart'
	| 'result'
	| 'seed'
	| 'slope'
	| 'spacing'
	| 'specularConstant'
	| 'specularExponent'
	| 'spreadMethod'
	| 'startOffset'
	| 'stdDeviation'
	| 'stemh'
	| 'stemv'
	| 'stitchTiles'
	| 'strikethroughPosition'
	| 'strikethroughThickness'
	| 'string'
	| 'surfaceScale'
	| 'systemLanguage'
	| 'tableValues'
	| 'targetX'
	| 'targetY'
	| 'textLength'
	| 'to'
	| 'u1'
	| 'u2'
	| 'underlinePosition'
	| 'underlineThickness'
	| 'unicode'
	| 'unicodeRange'
	| 'unitsPerEm'
	| 'vAlphabetic'
	| 'vHanging'
	| 'vIdeographic'
	| 'vMathematical'
	| 'version'
	| 'vertAdvY'
	| 'vertOriginX'
	| 'vertOriginY'
	| 'viewBox'
	| 'viewTarget'
	| 'widths'
	| 'x1'
	| 'x2'
	| 'xChannelSelector'
	| 'xHeight'
	| 'xlinkActuate'
	| 'xlinkArcrole'
	| 'xlinkHref'
	| 'xlinkRole'
	| 'xlinkShow'
	| 'xlinkTitle'
	| 'xlinkType'
	| 'xmlBase'
	| 'xmlLang'
	| 'xmlSpace'
	| 'xmlns'
	| 'xmlnsXlink'
	| 'y1'
	| 'y2'
	| 'yChannelSelector'
	| 'zoomAndPan';
type SharedKeys56 = 'crossOrigin' | 'media' | 'method';
type SharedKeys57 = 'scrollX' | 'scrollXProgress' | 'scrollY' | 'scrollYProgress';
type SharedKeys58 = 'axis' | 'trackContentSize';
type SharedKeys59 = 'onMount' | 'renderState';
type SharedKeys60 = 'factory' | 'isTransformed';
type SharedKeys61 =
	'attachTimeline' | 'complete' | 'finished' | 'iterationDuration' | 'pause' | 'play' | 'state';
type SharedKeys62 = 'onRepeat' | 'onStop';
type SharedKeys63 = 'animateChanges' | 'getState' | 'reset' | 'setActive' | 'setAnimateFunction';
type SharedKeys64 =
	'isActive' | 'needsAnimating' | 'prevProp' | 'prevResolvedValues' | 'protectedKeys';
type SharedKeys65 =
	'postRender' | 'preRender' | 'preUpdate' | 'render' | 'resolveKeyframes' | 'setup' | 'update';
type SharedKeys66 =
	| 'baselineSource'
	| 'cssFloat'
	| 'cssText'
	| 'webkitAlignContent'
	| 'webkitAlignItems'
	| 'webkitAlignSelf'
	| 'webkitAnimation'
	| 'webkitAnimationDelay'
	| 'webkitAnimationDirection'
	| 'webkitAnimationDuration'
	| 'webkitAnimationFillMode'
	| 'webkitAnimationIterationCount'
	| 'webkitAnimationName'
	| 'webkitAnimationPlayState'
	| 'webkitAnimationTimingFunction'
	| 'webkitAppearance'
	| 'webkitBackfaceVisibility'
	| 'webkitBackgroundClip'
	| 'webkitBackgroundOrigin'
	| 'webkitBackgroundSize'
	| 'webkitBorderBottomLeftRadius'
	| 'webkitBorderBottomRightRadius'
	| 'webkitBorderRadius'
	| 'webkitBorderTopLeftRadius'
	| 'webkitBorderTopRightRadius'
	| 'webkitBoxAlign'
	| 'webkitBoxFlex'
	| 'webkitBoxOrdinalGroup'
	| 'webkitBoxOrient'
	| 'webkitBoxPack'
	| 'webkitBoxShadow'
	| 'webkitBoxSizing'
	| 'webkitFilter'
	| 'webkitFlex'
	| 'webkitFlexBasis'
	| 'webkitFlexDirection'
	| 'webkitFlexFlow'
	| 'webkitFlexGrow'
	| 'webkitFlexShrink'
	| 'webkitFlexWrap'
	| 'webkitJustifyContent'
	| 'webkitLineClamp'
	| 'webkitMask'
	| 'webkitMaskBoxImage'
	| 'webkitMaskBoxImageOutset'
	| 'webkitMaskBoxImageRepeat'
	| 'webkitMaskBoxImageSlice'
	| 'webkitMaskBoxImageSource'
	| 'webkitMaskBoxImageWidth'
	| 'webkitMaskClip'
	| 'webkitMaskComposite'
	| 'webkitMaskImage'
	| 'webkitMaskOrigin'
	| 'webkitMaskPosition'
	| 'webkitMaskRepeat'
	| 'webkitMaskSize'
	| 'webkitOrder'
	| 'webkitPerspective'
	| 'webkitPerspectiveOrigin'
	| 'webkitTextFillColor'
	| 'webkitTextSizeAdjust'
	| 'webkitTextStroke'
	| 'webkitTextStrokeColor'
	| 'webkitTextStrokeWidth'
	| 'webkitTransform'
	| 'webkitTransformOrigin'
	| 'webkitTransformStyle'
	| 'webkitTransition'
	| 'webkitTransitionDelay'
	| 'webkitTransitionDuration'
	| 'webkitTransitionProperty'
	| 'webkitTransitionTimingFunction'
	| 'webkitUserSelect';
type SharedKeys67 = 'indexes' | 'types';
type SharedKeys68 = 'attrScale' | 'attrX' | 'attrY';
type SharedKeys69 = 'allowFlatten' | 'element';
type SharedKeys70 = 'allowProjection' | 'enableHardwareAcceleration';
type SharedKeys71 = 'isProcessing' | 'timestamp';
type SharedKeys72 = 'hue' | 'lightness' | 'saturation';
type SharedKeys73 = 'clamp' | 'mixer';
type SharedKeys74 = 'calculatedDuration' | 'next';
type SharedKeys75 = 'calculatedProjections' | 'calculatedTargetDeltas';
type SharedKeys76 = 'hasLayoutChanged' | 'hasRelativeLayoutChanged' | 'layoutDelta';
type SharedKeys77 = 'layoutBox' | 'measuredBox';
type SharedKeys78 = 'animationCancel' | 'animationComplete' | 'animationStart' | 'change';
type SharedKeys79 = 'finalKeyframe' | 'isHandoff' | 'motionValue';
type SharedKeys80 = 'stopPropagation' | 'useGlobalTarget';
type SharedKeys81 =
	'attachResizeListener' | 'checkIsScrollRoot' | 'defaultParent' | 'measureScroll';
type SharedKeys82 =
	| 'alwaysMeasureLayout'
	| 'animationType'
	| 'crossfade'
	| 'initialPromotionConfig'
	| 'visualElement';
type SharedKeys83 = 'blue' | 'green' | 'red';
type SharedKeys84 = 'applyTo' | 'correct' | 'isCSSVariable';
type SharedKeys85 = 'isRoot' | 'phase' | 'wasRoot';
type SharedKeys86 = 'process' | 'schedule';
type SharedKeys87 = 'observe' | 'rangeEnd' | 'rangeStart' | 'timeline';
type SharedKeys88 = 'enter' | 'new' | 'old';
type SharedKeys89 =
	| 'AnimationComplete'
	| 'AnimationStart'
	| 'BeforeLayoutMeasure'
	| 'LayoutAnimationComplete'
	| 'LayoutAnimationStart'
	| 'LayoutMeasure'
	| 'LayoutUpdate'
	| 'SetAxisTarget'
	| 'Unmount'
	| 'Update';
type SharedKeys90 =
	| 'blockInitialAnimation'
	| 'isSVG'
	| 'presenceContext'
	| 'reducedMotionConfig'
	| 'variantParent'
	| 'visualState';
type SharedKeys91 =
	| 'accelerate'
	| 'addDependent'
	| 'attach'
	| 'clearListeners'
	| 'getPrevious'
	| 'getVelocity'
	| 'hasAnimated'
	| 'isAnimating'
	| 'isEffectActive'
	| 'jump'
	| 'liveStyle'
	| 'on'
	| 'prevUpdatedAt'
	| 'removeDependent'
	| 'setCurrent'
	| 'setPrevFrameValue'
	| 'setWithVelocity'
	| 'updateAndNotify'
	| 'updatedAt';
type SharedKeys92 =
	| 'difference'
	| 'intersection'
	| 'isDisjointFrom'
	| 'isSubsetOf'
	| 'isSupersetOf'
	| 'symmetricDifference'
	| 'union';
type SharedKeys93 = 'hasAnimatedSinceResize' | 'hasEverUpdated';
type SharedKeys94 = 'toExponential' | 'toFixed' | 'toPrecision';
type SharedKeys95 =
	'backIn' | 'backOut' | 'circIn' | 'circOut' | 'easeIn' | 'easeInOut' | 'easeOut' | 'linear';
type PublishedKeys0 = 'direction' | SharedKeys0 | 'rotate';
type PublishedKeys1 = 'prototype';
type PublishedKeys2 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'skipInitialAnimation'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity';
type PublishedKeys3 =
	| 'path'
	| SharedKeys10
	| 'animationId'
	| 'children'
	| 'depth'
	| 'id'
	| 'isPresent'
	| 'latestValues'
	| 'layout'
	| 'mount'
	| 'nodes'
	| 'options'
	| 'parent'
	| SharedKeys11
	| 'resetTransform'
	| 'root'
	| 'snapshot'
	| 'target';
type PublishedKeys4 = SharedKeys12;
type PublishedKeys5 = number | string;
type PublishedKeys6 =
	| 'repeat'
	| number
	| SharedKeys13
	| 'at'
	| SharedKeys14
	| SharedKeys15
	| 'length'
	| 'normalize'
	| 'split'
	| 'toString'
	| 'valueOf'
	| typeof Symbol.iterator;
type PublishedKeys7 = SharedKeys16 | 'get' | 'set';
type PublishedKeys8 = 'skipAnimations' | SharedKeys17;
type PublishedKeys9 = 'at' | 'easing' | 'value';
type PublishedKeys10 =
	'root' | SharedKeys18 | 'custom' | 'initial' | 'mode' | 'onExitComplete' | 'propagate';
type PublishedKeys11 =
	| number
	| 'at'
	| SharedKeys15
	| 'length'
	| 'toString'
	| typeof Symbol.iterator
	| SharedKeys19
	| SharedKeys20
	| SharedKeys21
	| 'fill'
	| 'filter'
	| 'map'
	| 'toLocaleString'
	| 'values';
type PublishedKeys12 = 'at';
type PublishedKeys13 =
	| number
	| 'at'
	| SharedKeys15
	| 'length'
	| 'toString'
	| typeof Symbol.iterator
	| SharedKeys19
	| SharedKeys20
	| SharedKeys21
	| 'fill'
	| 'filter'
	| 'map'
	| 'toLocaleString'
	| 'values'
	| '0'
	| '1';
type PublishedKeys14 =
	| 'path'
	| SharedKeys14
	| 'filter'
	| 'map'
	| SharedKeys22
	| 'animate'
	| SharedKeys23
	| SharedKeys24
	| 'marker'
	| SharedKeys25
	| 'source'
	| 'stop'
	| 'style'
	| 'time'
	| 'var';
type PublishedKeys15 =
	| number
	| 'at'
	| SharedKeys15
	| 'length'
	| 'toString'
	| typeof Symbol.iterator
	| SharedKeys19
	| SharedKeys20
	| SharedKeys21
	| 'fill'
	| 'filter'
	| 'map'
	| 'toLocaleString'
	| 'values'
	| '0'
	| '1'
	| '2';
type PublishedKeys16 = 'Provider';
type PublishedKeys17 = 'layout' | 'animation' | 'drag' | 'exit' | SharedKeys26 | 'renderer' | 'tap';
type PublishedKeys18 = SharedKeys27 | 'isEnabled';
type PublishedKeys19 = 'layout' | 'animation' | 'drag' | 'exit' | SharedKeys26 | 'tap';
type PublishedKeys20 = SharedKeys27;
type PublishedKeys21 =
	| number
	| 'at'
	| SharedKeys15
	| 'length'
	| 'toString'
	| typeof Symbol.iterator
	| SharedKeys19
	| SharedKeys20
	| SharedKeys21
	| 'fill'
	| 'filter'
	| 'map'
	| 'toLocaleString'
	| 'values'
	| '0';
type PublishedKeys22 =
	SharedKeys14 | 'map' | SharedKeys22 | SharedKeys25 | 'source' | 'style' | 'time' | 'var';
type PublishedKeys23 =
	| 'inherit'
	| 'children'
	| 'id'
	| 'layout'
	| 'custom'
	| 'initial'
	| 'propagate'
	| 'values'
	| 'animate'
	| SharedKeys25
	| 'style'
	| 'drag'
	| 'exit'
	| SharedKeys28
	| SharedKeys29
	| SharedKeys30
	| 'color'
	| 'content'
	| SharedKeys31
	| SharedKeys32
	| SharedKeys33
	| SharedKeys34
	| 'nonce'
	| SharedKeys35
	| SharedKeys36
	| 'onChange'
	| SharedKeys37
	| SharedKeys38
	| SharedKeys39
	| SharedKeys40
	| 'onPlay'
	| 'onUpdate'
	| SharedKeys41
	| 'transition'
	| 'translate'
	| 'variants'
	| 'whileFocus';
type PublishedKeys24 = 'children' | SharedKeys42;
type PublishedKeys25 = 'skipAnimations' | 'nonce' | 'transition' | SharedKeys43 | 'isValidProp';
type PublishedKeys26 =
	'skipAnimations' | 'children' | 'nonce' | 'transition' | SharedKeys43 | 'isValidProp';
type PublishedKeys27 =
	| 'inherit'
	| 'children'
	| 'layout'
	| 'custom'
	| 'initial'
	| 'propagate'
	| 'values'
	| 'animate'
	| 'style'
	| 'drag'
	| 'exit'
	| SharedKeys28
	| SharedKeys31
	| SharedKeys32
	| SharedKeys33
	| SharedKeys34
	| SharedKeys35
	| SharedKeys36
	| SharedKeys37
	| SharedKeys38
	| SharedKeys39
	| SharedKeys40
	| 'onUpdate'
	| SharedKeys41
	| 'transition'
	| 'variants'
	| 'whileFocus';
type PublishedKeys28 =
	| 'direction'
	| 'rotate'
	| 'fill'
	| 'filter'
	| SharedKeys24
	| 'marker'
	| 'animation'
	| 'color'
	| 'content'
	| 'transition'
	| 'translate'
	| SharedKeys44
	| SharedKeys45
	| SharedKeys46
	| SharedKeys47
	| 'clear'
	| SharedKeys48
	| 'container'
	| SharedKeys49
	| 'margin'
	| 'offset'
	| SharedKeys50
	| 'pathLength'
	| SharedKeys51
	| SharedKeys52
	| 'scale'
	| 'skew'
	| 'transform'
	| 'transformOrigin'
	| SharedKeys53
	| 'z';
type PublishedKeys29 =
	'rotate' | SharedKeys50 | SharedKeys52 | 'scale' | 'skew' | SharedKeys53 | 'z';
type PublishedKeys30 = SharedKeys54;
type PublishedKeys31 = 'transition' | 'keyframes';
type PublishedKeys32 =
	| typeof Symbol.iterator
	| SharedKeys16
	| 'get'
	| 'set'
	| SharedKeys20
	| 'values'
	| 'clear'
	| 'size';
type PublishedKeys33 =
	| 'direction'
	| 'rotate'
	| 'from'
	| SharedKeys6
	| 'path'
	| 'type'
	| 'id'
	| 'target'
	| 'mode'
	| 'fill'
	| 'filter'
	| SharedKeys24
	| SharedKeys30
	| 'color'
	| 'onChange'
	| 'onPlay'
	| SharedKeys46
	| SharedKeys48
	| SharedKeys49
	| 'offset'
	| 'pathLength'
	| 'scale'
	| 'transform'
	| SharedKeys53
	| 'z'
	| SharedKeys55
	| SharedKeys56
	| 'name'
	| 'origin'
	| 'speed';
type PublishedKeys34 =
	| 'direction'
	| 'rotate'
	| 'from'
	| 'inherit'
	| SharedKeys6
	| 'path'
	| 'type'
	| 'children'
	| 'id'
	| 'layout'
	| 'target'
	| 'custom'
	| 'initial'
	| 'mode'
	| 'propagate'
	| 'fill'
	| 'filter'
	| 'values'
	| 'animate'
	| SharedKeys24
	| 'style'
	| 'drag'
	| 'exit'
	| SharedKeys28
	| SharedKeys30
	| 'color'
	| SharedKeys31
	| SharedKeys32
	| SharedKeys33
	| SharedKeys34
	| SharedKeys35
	| SharedKeys36
	| 'onChange'
	| SharedKeys37
	| SharedKeys38
	| SharedKeys39
	| SharedKeys40
	| 'onPlay'
	| 'onUpdate'
	| SharedKeys41
	| 'transition'
	| 'variants'
	| 'whileFocus'
	| SharedKeys46
	| SharedKeys48
	| SharedKeys49
	| 'offset'
	| 'pathLength'
	| 'scale'
	| 'transform'
	| SharedKeys53
	| 'z'
	| SharedKeys55
	| SharedKeys56
	| 'name'
	| 'origin'
	| 'speed';
type PublishedKeys35 = SharedKeys57;
type PublishedKeys36 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'at'
	| 'reduceMotion';
type PublishedKeys37 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'at';
type PublishedKeys38 = 'at' | 'name';
type PublishedKeys39 =
	| 'delay'
	| 'duration'
	| 'repeat'
	| SharedKeys8
	| 'skipAnimations'
	| 'reduceMotion'
	| 'defaultTransition'
	| 'onComplete';
type PublishedKeys40 = 'toString' | 'valueOf';
type PublishedKeys41 = 'transition' | 'deregister' | 'register' | 'shouldPreserveFollowOpacity';
type PublishedKeys42 = 'root' | 'initial' | 'margin' | 'amount' | 'once';
type PublishedKeys43 = 'target' | 'container' | 'offset' | SharedKeys58;
type PublishedKeys44 =
	number | 'at' | SharedKeys15 | 'length' | 'toString' | typeof Symbol.iterator;
type PublishedKeys45 = 'latestValues' | SharedKeys59;
type PublishedKeys46 = 'valueOf';
type PublishedKeys47 = 'duration' | 'ease' | 'times' | 'keyframes' | SharedKeys60;
type PublishedKeys48 =
	'duration' | 'startTime' | 'stop' | 'time' | 'speed' | SharedKeys61 | 'cancel';
type PublishedKeys49 = 'value' | 'addProjectionMetrics';
type PublishedKeys50 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'onPlay'
	| 'onUpdate'
	| 'reduceMotion'
	| 'onComplete'
	| SharedKeys62;
type PublishedKeys51 = 'delay' | SharedKeys5;
type PublishedKeys52 =
	'duration' | 'startTime' | 'stop' | 'time' | 'speed' | SharedKeys61 | 'cancel' | 'then';
type PublishedKeys53 = 'onPlay' | 'onUpdate' | 'onComplete' | SharedKeys62;
type PublishedKeys54 = 'repeat' | SharedKeys8;
type PublishedKeys55 = 'animations' | 'current';
type PublishedKeys56 = SharedKeys63;
type PublishedKeys57 = SharedKeys64;
type PublishedKeys58 = SharedKeys65 | 'read';
type PublishedKeys59 =
	| 'rotate'
	| 'length'
	| 'fill'
	| 'filter'
	| SharedKeys24
	| 'marker'
	| 'animation'
	| 'color'
	| 'content'
	| 'translate'
	| SharedKeys45
	| SharedKeys46
	| SharedKeys47
	| 'clear'
	| 'container'
	| SharedKeys49
	| 'margin'
	| 'offset'
	| SharedKeys50
	| SharedKeys52
	| 'scale'
	| 'transform'
	| 'transformOrigin'
	| SharedKeys53
	| 'z'
	| SharedKeys66;
type PublishedKeys60 = 'alpha';
type PublishedKeys61 = 'split' | 'values' | SharedKeys67;
type PublishedKeys62 =
	| 'direction'
	| 'rotate'
	| 'path'
	| 'length'
	| 'mode'
	| 'fill'
	| 'filter'
	| 'values'
	| SharedKeys24
	| 'marker'
	| 'animation'
	| 'color'
	| 'content'
	| 'translate'
	| SharedKeys45
	| SharedKeys46
	| SharedKeys47
	| 'clear'
	| SharedKeys48
	| 'container'
	| SharedKeys49
	| 'margin'
	| 'offset'
	| SharedKeys50
	| 'pathLength'
	| SharedKeys51
	| SharedKeys52
	| 'scale'
	| 'transform'
	| 'transformOrigin'
	| SharedKeys53
	| 'z'
	| SharedKeys55
	| 'origin'
	| 'speed'
	| SharedKeys66
	| SharedKeys68
	| `--${string}`;
type PublishedKeys63 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'onPlay'
	| 'onUpdate'
	| 'keyframes'
	| 'name'
	| 'onComplete'
	| SharedKeys62
	| SharedKeys69
	| 'pseudoElement';
type PublishedKeys64 = SharedKeys70;
type PublishedKeys65 = SharedKeys7 | SharedKeys9 | 'velocity' | 'keyframes';
type PublishedKeys66 = 'drag' | SharedKeys28 | SharedKeys37;
type PublishedKeys67 = SharedKeys2 | 'duration';
type PublishedKeys68 = string;
type PublishedKeys69 = 'read' | 'step' | 'test';
type PublishedKeys70 = 'point';
type PublishedKeys71 = 'once' | 'passive';
type PublishedKeys72 = 'delta' | SharedKeys71;
type PublishedKeys73 = 'alpha' | SharedKeys72;
type PublishedKeys74 = 'style' | 'transform' | 'transformOrigin' | 'vars';
type PublishedKeys75 =
	SharedKeys3 | SharedKeys6 | SharedKeys7 | SharedKeys9 | 'velocity' | 'keyframes';
type PublishedKeys76 = 'transition' | 'shouldPreserveFollowOpacity';
type PublishedKeys77 = 'ease' | SharedKeys73;
type PublishedKeys78 = 'velocity' | 'toString' | SharedKeys74;
type PublishedKeys79 = 'duration' | 'ease' | 'times';
type PublishedKeys80 = SharedKeys36;
type PublishedKeys81 = 'nodes' | SharedKeys75;
type PublishedKeys82 = 'layout' | 'snapshot' | 'delta' | SharedKeys76;
type PublishedKeys83 = 'mount' | 'set' | 'stop' | 'start' | 'subscribe';
type PublishedKeys84 = 'animationId' | 'latestValues' | 'source' | SharedKeys77;
type PublishedKeys85 = 'skipAnimations' | 'nonce' | 'transition' | SharedKeys43;
type PublishedKeys86 = 'inherit' | 'custom' | 'values' | SharedKeys31;
type PublishedKeys87 = 'initial' | 'animate' | 'exit' | 'transition' | 'variants';
type PublishedKeys88 = SharedKeys37;
type PublishedKeys89 = 'drag' | SharedKeys28;
type PublishedKeys90 = SharedKeys35 | SharedKeys36 | SharedKeys39 | 'onUpdate';
type PublishedKeys91 = 'whileFocus';
type PublishedKeys92 = SharedKeys38;
type PublishedKeys93 = 'layout' | SharedKeys32 | SharedKeys34 | SharedKeys39;
type PublishedKeys94 =
	| 'inherit'
	| 'layout'
	| 'custom'
	| 'initial'
	| 'propagate'
	| 'values'
	| 'animate'
	| 'drag'
	| 'exit'
	| SharedKeys28
	| SharedKeys31
	| SharedKeys32
	| SharedKeys33
	| SharedKeys34
	| SharedKeys35
	| SharedKeys36
	| SharedKeys37
	| SharedKeys38
	| SharedKeys39
	| SharedKeys40
	| 'onUpdate'
	| SharedKeys41
	| 'transition'
	| 'variants'
	| 'whileFocus';
type PublishedKeys95 = SharedKeys40;
type PublishedKeys96 = SharedKeys33;
type PublishedKeys97 = SharedKeys41;
type PublishedKeys98 = SharedKeys78 | 'destroy';
type PublishedKeys99 = 'owner';
type PublishedKeys100 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'onPlay'
	| 'onUpdate'
	| 'keyframes'
	| 'name'
	| 'onComplete'
	| SharedKeys62
	| SharedKeys69
	| 'pseudoElement'
	| SharedKeys79;
type PublishedKeys101 = 'add' | 'dirty' | 'remove';
type PublishedKeys102 = 'current' | 'getProps';
type PublishedKeys103 = 'velocity' | 'offset' | 'point' | 'delta';
type PublishedKeys104 = 'rotate' | SharedKeys53;
type PublishedKeys105 = SharedKeys53;
type PublishedKeys106 = 'once' | 'passive' | SharedKeys80;
type PublishedKeys107 = 'id' | 'isPresent' | 'custom' | 'initial' | 'onExitComplete' | 'register';
type PublishedKeys108 = 'success';
type PublishedKeys109 = 'cancel' | 'currentTime';
type PublishedKeys110 = 'resetTransform' | SharedKeys81;
type PublishedKeys111 =
	'layout' | 'onExitComplete' | 'animate' | SharedKeys34 | 'transition' | SharedKeys82;
type PublishedKeys112 = 'tap';
type PublishedKeys113 = 'alpha' | SharedKeys83;
type PublishedKeys114 = 'toString';
type PublishedKeys115 =
	| 'direction'
	| 'rotate'
	| 'from'
	| 'path'
	| 'mode'
	| 'fill'
	| 'filter'
	| 'values'
	| SharedKeys24
	| SharedKeys46
	| SharedKeys48
	| 'offset'
	| 'pathLength'
	| 'scale'
	| 'transform'
	| SharedKeys53
	| 'z'
	| SharedKeys55
	| 'origin'
	| 'speed';
type PublishedKeys116 = SharedKeys68;
type PublishedKeys117 =
	| 'direction'
	| 'rotate'
	| 'path'
	| 'mode'
	| 'fill'
	| 'filter'
	| 'values'
	| SharedKeys24
	| SharedKeys46
	| SharedKeys48
	| 'offset'
	| 'pathLength'
	| 'scale'
	| 'transform'
	| SharedKeys53
	| 'z'
	| SharedKeys55
	| 'origin'
	| 'speed';
type PublishedKeys118 = 'pathLength' | SharedKeys51;
type PublishedKeys119 = 'style' | 'transform' | 'transformOrigin' | 'vars' | 'attrs';
type PublishedKeys120 = SharedKeys11 | 'target';
type PublishedKeys121 = SharedKeys84;
type PublishedKeys122 = 'animationId' | 'offset' | SharedKeys85;
type PublishedKeys123 = SharedKeys2 | SharedKeys4 | 'duration' | SharedKeys9 | 'velocity';
type PublishedKeys124 = 'ease' | 'from' | 'startDelay';
type PublishedKeys125 = 'layoutProjection';
type PublishedKeys126 = 'cancel' | SharedKeys86;
type PublishedKeys127 =
	| 'direction'
	| 'rotate'
	| 'path'
	| 'length'
	| 'mode'
	| 'fill'
	| 'filter'
	| 'values'
	| SharedKeys24
	| 'marker'
	| 'animation'
	| 'color'
	| 'content'
	| 'transition'
	| 'translate'
	| SharedKeys45
	| SharedKeys46
	| SharedKeys47
	| 'clear'
	| SharedKeys48
	| 'container'
	| SharedKeys49
	| 'margin'
	| 'offset'
	| SharedKeys50
	| 'pathLength'
	| SharedKeys51
	| SharedKeys52
	| 'scale'
	| 'transform'
	| 'transformOrigin'
	| SharedKeys53
	| 'z'
	| SharedKeys55
	| 'origin'
	| 'speed'
	| SharedKeys66
	| SharedKeys68
	| `--${string}`
	| 'transitionEnd';
type PublishedKeys128 = SharedKeys87;
type PublishedKeys129 = SharedKeys50;
type PublishedKeys130 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'onPlay'
	| 'onUpdate'
	| 'onComplete'
	| SharedKeys62;
type PublishedKeys131 =
	| 'direction'
	| 'rotate'
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'layout'
	| 'length'
	| 'mode'
	| 'fill'
	| 'filter'
	| 'values'
	| SharedKeys24
	| 'marker'
	| 'animation'
	| 'color'
	| 'content'
	| 'onPlay'
	| 'onUpdate'
	| 'translate'
	| SharedKeys45
	| SharedKeys46
	| SharedKeys47
	| 'clear'
	| SharedKeys48
	| 'container'
	| SharedKeys49
	| 'margin'
	| 'offset'
	| SharedKeys50
	| 'pathLength'
	| SharedKeys51
	| SharedKeys52
	| 'scale'
	| 'transform'
	| 'transformOrigin'
	| SharedKeys53
	| 'z'
	| SharedKeys55
	| 'origin'
	| 'speed'
	| 'onComplete'
	| SharedKeys62
	| SharedKeys66
	| SharedKeys68
	| `--${string}`
	| 'default';
type PublishedKeys132 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'onPlay'
	| 'onUpdate'
	| 'keyframes'
	| 'name'
	| 'onComplete'
	| SharedKeys62
	| SharedKeys69
	| SharedKeys79;
type PublishedKeys133 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'onPlay'
	| 'onUpdate'
	| 'keyframes'
	| 'name'
	| 'onComplete'
	| SharedKeys62
	| SharedKeys69
	| SharedKeys79
	| 'KeyframeResolver';
type PublishedKeys134 = 'var' | 'color' | 'number';
type PublishedKeys135 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity';
type PublishedKeys136 =
	'transform' | 'test' | 'default' | 'createTransformer' | 'getAnimatableNone' | 'parse';
type PublishedKeys137 = `--${string}`;
type PublishedKeys138 = SharedKeys9 | 'velocity';
type PublishedKeys139 = 'options' | 'keyframes';
type PublishedKeys140 =
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| 'delay'
	| SharedKeys5
	| 'duration'
	| 'ease'
	| 'from'
	| 'inherit'
	| 'isSync'
	| SharedKeys6
	| SharedKeys7
	| 'path'
	| 'repeat'
	| SharedKeys8
	| SharedKeys9
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'onPlay'
	| 'onUpdate'
	| 'reduceMotion'
	| 'onComplete'
	| SharedKeys62
	| 'interrupt';
type PublishedKeys141 = 'layout' | 'exit' | SharedKeys88;
type PublishedKeys142 = 'normalize';
type PublishedKeys143 = 'root' | 'margin' | 'amount' | 'once';
type PublishedKeys144 = 'delay' | 'type' | 'custom' | 'transitionOverride';
type PublishedKeys145 = SharedKeys89;
type PublishedKeys146 = 'skipAnimations' | 'parent' | SharedKeys90 | 'props';
type PublishedKeys147 =
	| 'get'
	| 'set'
	| 'stop'
	| 'animation'
	| 'onChange'
	| 'start'
	| 'destroy'
	| 'owner'
	| 'add'
	| 'dirty'
	| SharedKeys91;
type PublishedKeys148 = 'props';
type PublishedKeys149 = 'depth';
type PublishedKeys150 = 'querySelectorAll';
type PublishedKeys151 =
	| typeof Symbol.iterator
	| SharedKeys16
	| SharedKeys20
	| 'values'
	| 'clear'
	| 'size'
	| 'add'
	| SharedKeys92;
type PublishedKeys152 = 'transform' | 'test' | 'parse';
type PublishedKeys153 = 'current';
type PublishedKeys154 = 'transform' | 'test' | 'getAnimatableNone' | 'parse';
type PublishedKeys155 = 'test' | 'createTransformer' | 'getAnimatableNone' | 'parse';
type PublishedKeys156 = SharedKeys93;
type PublishedKeys157 = 'toString' | 'valueOf' | 'toLocaleString' | SharedKeys94;
type PublishedKeys158 = 'transform' | 'test' | 'default' | 'parse';
type PublishedKeys159 = 'ease' | SharedKeys95;
type PublishedKeys160 = 'set' | 'now';
type PublishedKeys161 = SharedKeys6;
type PublishedKeys162 = 'translate' | 'scale' | 'origin' | 'originPoint';
type PublishedKeys163 =
	| number
	| 'at'
	| SharedKeys15
	| 'length'
	| 'toString'
	| typeof Symbol.iterator
	| SharedKeys20
	| SharedKeys21
	| 'filter'
	| 'map'
	| 'toLocaleString'
	| 'values'
	| '0'
	| '1'
	| '2'
	| '3';
type PublishedKeys164 = SharedKeys47;

type Contract0 = Assert<Equal<keyof Pick<Native0.ArcOptions, PublishedKeys0>, PublishedKeys0>>;
type Contract1 = Assert<Equal<Parameters<Native0.DelayedFunction>['length'], 1>>;
type Contract2 = Assert<Equal<keyof Pick<typeof Native0.FlatTree, PublishedKeys1>, PublishedKeys1>>;
type Contract3 = Assert<
	Equal<keyof Pick<Native0.FollowValueOptions, PublishedKeys2>, PublishedKeys2>
>;
type Contract4 = Assert<Equal<keyof Pick<Native0.IProjectionNode, PublishedKeys3>, PublishedKeys3>>;
type Contract5 = Assert<Equal<keyof Pick<Native0.MotionPath, PublishedKeys4>, PublishedKeys4>>;
type Contract6 = Assert<Equal<keyof Pick<Native0.ResolvedValues, PublishedKeys5>, PublishedKeys5>>;
type Contract7 = Assert<
	Equal<keyof Pick<typeof Native0.VisualElement, PublishedKeys1>, PublishedKeys1>
>;
type Contract8 = Assert<Equal<Parameters<typeof Native0.addScaleCorrector>['length'], 1>>;
type Contract9 = Assert<Equal<Parameters<typeof Native0.animateVisualElement>['length'], 2 | 3>>;
type Contract10 = Assert<Equal<Parameters<typeof Native0.arc>['length'], 0 | 1>>;
type Contract11 = Assert<Equal<Parameters<typeof Native0.buildTransform>['length'], 2 | 3>>;
type Contract12 = Assert<Equal<Parameters<typeof Native0.calcLength>['length'], 1>>;
type Contract13 = Assert<Equal<Parameters<typeof Native0.createBox>['length'], 0>>;
type Contract14 = Assert<Equal<Parameters<typeof Native0.delay>['length'], 2>>;
type Contract15 = Assert<
	Equal<keyof Pick<typeof Native0.optimizedAppearDataAttribute, PublishedKeys6>, PublishedKeys6>
>;
type Contract16 = Assert<Equal<Parameters<typeof Native0.resolveMotionValue>['length'], 0 | 1>>;
type Contract17 = Assert<
	Equal<keyof Pick<typeof Native0.visualElementStore, PublishedKeys7>, PublishedKeys7>
>;
type Contract18 = Assert<
	Equal<keyof Pick<typeof Native0.MotionGlobalConfig, PublishedKeys8>, PublishedKeys8>
>;
type Contract19 = Assert<
	Equal<keyof Pick<Native0.AbsoluteKeyframe, PublishedKeys9>, PublishedKeys9>
>;
type Contract20 = Assert<Equal<Parameters<typeof Native0.AnimatePresence>['length'], 1>>;
type Contract21 = Assert<
	Equal<keyof Pick<Native0.AnimatePresenceProps, PublishedKeys10>, PublishedKeys10>
>;
type Contract22 = Assert<Equal<Parameters<typeof Native0.AnimateSharedLayout>['length'], 1 | 2>>;
type Contract23 = Assert<
	Equal<keyof Pick<Native0.AnimationSequence, PublishedKeys11>, PublishedKeys11>
>;
type Contract24 = Assert<Equal<keyof Pick<Native0.AnimationType, PublishedKeys6>, PublishedKeys6>>;
type Contract25 = Assert<Equal<keyof Pick<Native0.At, PublishedKeys12>, PublishedKeys12>>;
type Contract26 = Assert<Equal<Parameters<Native0.CreateVisualElement>['length'], 2>>;
type Contract27 = Assert<Equal<Parameters<Native0.Cycle>['length'], 0 | 1>>;
type Contract28 = Assert<
	Equal<keyof Pick<Native0.CycleState<{ sample: string }>, PublishedKeys13>, PublishedKeys13>
>;
type Contract29 = Assert<
	Equal<keyof Pick<Native0.DOMMotionComponents, PublishedKeys14>, PublishedKeys14>
>;
type Contract30 = Assert<Equal<keyof Pick<Native0.DOMSegment, PublishedKeys13>, PublishedKeys13>>;
type Contract31 = Assert<
	Equal<keyof Pick<Native0.DOMSegmentWithTransition, PublishedKeys15>, PublishedKeys15>
>;
type Contract32 = Assert<
	Equal<keyof Pick<typeof Native0.DeprecatedLayoutGroupContext, PublishedKeys16>, PublishedKeys16>
>;
type Contract33 = Assert<
	Equal<keyof Pick<typeof Native0.DragControls, PublishedKeys1>, PublishedKeys1>
>;
type Contract34 = Assert<
	Equal<keyof Pick<Native0.FeatureBundle, PublishedKeys17>, PublishedKeys17>
>;
type Contract35 = Assert<
	Equal<keyof Pick<Native0.FeatureDefinition, PublishedKeys18>, PublishedKeys18>
>;
type Contract36 = Assert<
	Equal<keyof Pick<Native0.FeatureDefinitions, PublishedKeys19>, PublishedKeys19>
>;
type Contract37 = Assert<
	Equal<keyof Pick<Native0.FeaturePackage, PublishedKeys20>, PublishedKeys20>
>;
type Contract38 = Assert<
	Equal<keyof Pick<Native0.FeaturePackages, PublishedKeys19>, PublishedKeys19>
>;
type Contract39 = Assert<
	Equal<
		Parameters<Native0.ForwardRefComponent<{ sample: string }, { sample: string }>>['length'],
		1
	>
>;
type Contract40 = Assert<
	Equal<keyof Pick<Native0.FunctionSegment, PublishedKeys21>, PublishedKeys21>
>;
type Contract41 = Assert<Equal<keyof Pick<Native0.HTMLElements, PublishedKeys22>, PublishedKeys22>>;
type Contract42 = Assert<
	Equal<keyof Pick<Native0.HTMLMotionProps<'div'>, PublishedKeys23>, PublishedKeys23>
>;
type Contract43 = Assert<
	Equal<keyof Pick<Native0.HydratedFeatureDefinition, PublishedKeys18>, PublishedKeys18>
>;
type Contract44 = Assert<
	Equal<keyof Pick<Native0.HydratedFeatureDefinitions, PublishedKeys19>, PublishedKeys19>
>;
type Contract45 = Assert<Equal<Parameters<typeof Native0.LayoutGroup>['length'], 1 | 2>>;
type Contract46 = Assert<
	Equal<keyof Pick<typeof Native0.LayoutGroupContext, PublishedKeys16>, PublishedKeys16>
>;
type Contract47 = Assert<Equal<Parameters<Native0.LazyFeatureBundle>['length'], 0>>;
type Contract48 = Assert<Equal<Parameters<typeof Native0.LazyMotion>['length'], 1>>;
type Contract49 = Assert<Equal<keyof Pick<Native0.LazyProps, PublishedKeys24>, PublishedKeys24>>;
type Contract50 = Assert<Equal<Parameters<typeof Native0.MotionConfig>['length'], 1>>;
type Contract51 = Assert<
	Equal<keyof Pick<Native0.MotionConfigContext, PublishedKeys25>, PublishedKeys25>
>;
type Contract52 = Assert<
	Equal<keyof Pick<Native0.MotionConfigProps, PublishedKeys26>, PublishedKeys26>
>;
type Contract53 = Assert<
	Equal<keyof Pick<typeof Native0.MotionContext, PublishedKeys16>, PublishedKeys16>
>;
type Contract54 = Assert<Equal<keyof Pick<Native0.MotionProps, PublishedKeys27>, PublishedKeys27>>;
type Contract55 = Assert<Equal<keyof Pick<Native0.MotionStyle, PublishedKeys28>, PublishedKeys28>>;
type Contract56 = Assert<
	Equal<keyof Pick<Native0.MotionTransform, PublishedKeys29>, PublishedKeys29>
>;
type Contract57 = Assert<
	Equal<keyof Pick<Native0.MotionValueSegment, PublishedKeys13>, PublishedKeys13>
>;
type Contract58 = Assert<
	Equal<keyof Pick<Native0.MotionValueSegmentWithTransition, PublishedKeys15>, PublishedKeys15>
>;
type Contract59 = Assert<
	Equal<keyof Pick<Native0.ObjectSegment, PublishedKeys13>, PublishedKeys13>
>;
type Contract60 = Assert<
	Equal<keyof Pick<Native0.ObjectSegmentWithTransition, PublishedKeys15>, PublishedKeys15>
>;
type Contract61 = Assert<
	Equal<keyof Pick<Native0.ObjectTarget<{ sample: string }>, PublishedKeys5>, PublishedKeys5>
>;
type Contract62 = Assert<Equal<Parameters<typeof Native0.PopChild>['length'], 1>>;
type Contract63 = Assert<Equal<Parameters<typeof Native0.PresenceChild>['length'], 1>>;
type Contract64 = Assert<
	Equal<keyof Pick<typeof Native0.PresenceContext, PublishedKeys16>, PublishedKeys16>
>;
type Contract65 = Assert<
	Equal<keyof Pick<typeof Native0.Reorder, PublishedKeys30>, PublishedKeys30>
>;
type Contract66 = Assert<Equal<Parameters<Native0.ResolveKeyframes<number>>['length'], 2 | 3 | 4>>;
type Contract67 = Assert<
	Equal<keyof Pick<Native0.ResolvedAnimationDefinition, PublishedKeys31>, PublishedKeys31>
>;
type Contract68 = Assert<
	Equal<keyof Pick<Native0.ResolvedAnimationDefinitions, PublishedKeys32>, PublishedKeys32>
>;
type Contract69 = Assert<
	Equal<
		keyof Pick<Native0.SVGAttributesAsMotionValues<{ sample: string }>, PublishedKeys33>,
		PublishedKeys33
	>
>;
type Contract70 = Assert<
	Equal<keyof Pick<Native0.SVGMotionProps<{ sample: string }>, PublishedKeys34>, PublishedKeys34>
>;
type Contract71 = Assert<Equal<Parameters<Native0.ScrapeMotionValuesFromProps>['length'], 2 | 3>>;
type Contract72 = Assert<
	Equal<keyof Pick<Native0.ScrollMotionValues, PublishedKeys35>, PublishedKeys35>
>;
type Contract73 = Assert<Equal<keyof Pick<Native0.Segment, PublishedKeys12>, PublishedKeys12>>;
type Contract74 = Assert<
	Equal<keyof Pick<Native0.SegmentTransitionOptions, PublishedKeys36>, PublishedKeys36>
>;
type Contract75 = Assert<
	Equal<keyof Pick<Native0.SegmentValueTransitionOptions, PublishedKeys37>, PublishedKeys37>
>;
type Contract76 = Assert<Equal<keyof Pick<Native0.SequenceLabel, PublishedKeys6>, PublishedKeys6>>;
type Contract77 = Assert<
	Equal<keyof Pick<Native0.SequenceLabelWithTime, PublishedKeys38>, PublishedKeys38>
>;
type Contract78 = Assert<Equal<keyof Pick<Native0.SequenceMap, PublishedKeys5>, PublishedKeys5>>;
type Contract79 = Assert<
	Equal<keyof Pick<Native0.SequenceOptions, PublishedKeys39>, PublishedKeys39>
>;
type Contract80 = Assert<Equal<Parameters<Native0.SequenceProgressCallback>['length'], 1>>;
type Contract81 = Assert<Equal<keyof Pick<Native0.SequenceTime, PublishedKeys40>, PublishedKeys40>>;
type Contract82 = Assert<
	Equal<keyof Pick<Native0.SwitchLayoutGroupContext, PublishedKeys41>, PublishedKeys41>
>;
type Contract83 = Assert<
	Equal<keyof Pick<Native0.UseInViewOptions, PublishedKeys42>, PublishedKeys42>
>;
type Contract84 = Assert<
	Equal<keyof Pick<Native0.UseScrollOptions, PublishedKeys43>, PublishedKeys43>
>;
type Contract85 = Assert<
	Equal<keyof Pick<Native0.ValueSequence, PublishedKeys11>, PublishedKeys11>
>;
type Contract86 = Assert<
	Equal<keyof Pick<Native0.VariantLabels, PublishedKeys44>, PublishedKeys44>
>;
type Contract87 = Assert<
	Equal<
		keyof Pick<Native0.VisualState<{ sample: string }, { sample: string }>, PublishedKeys45>,
		PublishedKeys45
	>
>;
type Contract88 = Assert<
	Equal<keyof Pick<typeof Native0.WillChangeMotionValue, PublishedKeys1>, PublishedKeys1>
>;
type Contract89 = Assert<Equal<Parameters<typeof Native0.addPointerEvent>['length'], 3 | 4>>;
type Contract90 = Assert<Equal<Parameters<typeof Native0.addPointerInfo>['length'], 1>>;
type Contract91 = Assert<Equal<Parameters<typeof Native0.animate>['length'], 2 | 3>>;
type Contract92 = Assert<Equal<Parameters<typeof Native0.animateMini>['length'], 2 | 3>>;
type Contract93 = Assert<Equal<Parameters<typeof Native0.animationControls>['length'], 0>>;
type Contract94 = Assert<
	Equal<keyof Pick<typeof Native0.animations, PublishedKeys19>, PublishedKeys19>
>;
type Contract95 = Assert<Equal<Parameters<typeof Native0.correctParentTransform>['length'], 1>>;
type Contract96 = Assert<Equal<Parameters<typeof Native0.createScopedAnimate>['length'], 0 | 1>>;
type Contract97 = Assert<Equal<Parameters<typeof Native0.disableInstantTransitions>['length'], 0>>;
type Contract98 = Assert<Equal<Parameters<typeof Native0.distance>['length'], 2>>;
type Contract99 = Assert<Equal<Parameters<typeof Native0.distance2D>['length'], 2>>;
type Contract100 = Assert<
	Equal<keyof Pick<typeof Native0.domAnimation, PublishedKeys17>, PublishedKeys17>
>;
type Contract101 = Assert<
	Equal<keyof Pick<typeof Native0.domMax, PublishedKeys17>, PublishedKeys17>
>;
type Contract102 = Assert<
	Equal<keyof Pick<typeof Native0.domMin, PublishedKeys17>, PublishedKeys17>
>;
type Contract103 = Assert<Equal<Parameters<typeof Native0.filterProps>['length'], 3 | 4>>;
type Contract104 = Assert<Equal<Parameters<typeof Native0.inView>['length'], 2 | 3>>;
type Contract105 = Assert<
	Equal<keyof Pick<typeof Native0.isBrowser, PublishedKeys46>, PublishedKeys46>
>;
type Contract106 = Assert<Equal<Parameters<typeof Native0.isMotionComponent>['length'], 1>>;
type Contract107 = Assert<Equal<Parameters<typeof Native0.isValidMotionProp>['length'], 1>>;
type Contract108 = Assert<Equal<Parameters<typeof Native0.m>['length'], 1 | 2 | 3 | 4>>;
type Contract109 = Assert<Equal<Parameters<typeof Native0.makeUseVisualState>['length'], 1>>;
type Contract110 = Assert<Equal<Parameters<typeof Native0.motion>['length'], 1 | 2 | 3 | 4>>;
type Contract111 = Assert<Equal<Parameters<typeof Native0.scroll>['length'], 1 | 2>>;
type Contract112 = Assert<Equal<Parameters<typeof Native0.scrollInfo>['length'], 1 | 2>>;
type Contract113 = Assert<
	Equal<Parameters<typeof Native0.startOptimizedAppearAnimation>['length'], 4 | 5>
>;
type Contract114 = Assert<Equal<Parameters<typeof Native0.transformViewBoxPoint>['length'], 1>>;
type Contract115 = Assert<Equal<Parameters<typeof Native0.unwrapMotionComponent>['length'], 1>>;
type Contract116 = Assert<Equal<Parameters<typeof Native0.useAnimate>['length'], 0>>;
type Contract117 = Assert<Equal<Parameters<typeof Native0.useAnimateMini>['length'], 0>>;
type Contract118 = Assert<Equal<Parameters<typeof Native0.useAnimation>['length'], 0>>;
type Contract119 = Assert<Equal<Parameters<typeof Native0.useAnimationControls>['length'], 0>>;
type Contract120 = Assert<Equal<Parameters<typeof Native0.useAnimationFrame>['length'], 1>>;
type Contract121 = Assert<Equal<Parameters<typeof Native0.useComposedRefs>['length'], number>>;
type Contract122 = Assert<Equal<Parameters<typeof Native0.useCycle>['length'], number>>;
type Contract123 = Assert<
	Equal<Parameters<typeof Native0.useDeprecatedAnimatedState>['length'], 1>
>;
type Contract124 = Assert<
	Equal<Parameters<typeof Native0.useDeprecatedInvertedScale>['length'], 0 | 1>
>;
type Contract125 = Assert<Equal<Parameters<typeof Native0.useDomEvent>['length'], 2 | 3 | 4>>;
type Contract126 = Assert<Equal<Parameters<typeof Native0.useDragControls>['length'], 0>>;
type Contract127 = Assert<Equal<Parameters<typeof Native0.useElementScroll>['length'], 1>>;
type Contract128 = Assert<Equal<Parameters<typeof Native0.useFollowValue>['length'], 1 | 2>>;
type Contract129 = Assert<Equal<Parameters<typeof Native0.useForceUpdate>['length'], 0>>;
type Contract130 = Assert<Equal<Parameters<typeof Native0.useInView>['length'], 1 | 2>>;
type Contract131 = Assert<
	Equal<Parameters<typeof Native0.useInstantLayoutTransition>['length'], 0>
>;
type Contract132 = Assert<Equal<Parameters<typeof Native0.useInstantTransition>['length'], 0>>;
type Contract133 = Assert<Equal<Parameters<typeof Native0.useIsPresent>['length'], 0>>;
type Contract134 = Assert<
	Equal<Parameters<typeof Native0.useIsomorphicLayoutEffect>['length'], 1 | 2>
>;
type Contract135 = Assert<Equal<Parameters<typeof Native0.useMotionTemplate>['length'], number>>;
type Contract136 = Assert<Equal<Parameters<typeof Native0.useMotionValue>['length'], 1>>;
type Contract137 = Assert<Equal<Parameters<typeof Native0.useMotionValueEvent>['length'], 3>>;
type Contract138 = Assert<Equal<Parameters<typeof Native0.usePageInView>['length'], 0>>;
type Contract139 = Assert<Equal<Parameters<typeof Native0.usePresence>['length'], 0 | 1>>;
type Contract140 = Assert<Equal<Parameters<typeof Native0.usePresenceData>['length'], 0>>;
type Contract141 = Assert<Equal<Parameters<typeof Native0.useReducedMotion>['length'], 0>>;
type Contract142 = Assert<Equal<Parameters<typeof Native0.useReducedMotionConfig>['length'], 0>>;
type Contract143 = Assert<Equal<Parameters<typeof Native0.useResetProjection>['length'], 0>>;
type Contract144 = Assert<Equal<Parameters<typeof Native0.useScroll>['length'], 0 | 1>>;
type Contract145 = Assert<Equal<Parameters<typeof Native0.useSpring>['length'], 1 | 2>>;
type Contract146 = Assert<Equal<Parameters<typeof Native0.useTime>['length'], 0>>;
type Contract147 = Assert<Equal<Parameters<typeof Native0.useTransform>['length'], 1>>;
type Contract148 = Assert<Equal<Parameters<typeof Native0.useUnmountEffect>['length'], 1>>;
type Contract149 = Assert<Equal<Parameters<typeof Native0.useVelocity>['length'], 1>>;
type Contract150 = Assert<Equal<Parameters<typeof Native0.useViewportScroll>['length'], 0>>;
type Contract151 = Assert<Equal<Parameters<typeof Native0.useWillChange>['length'], 0>>;
type Contract152 = Assert<
	Equal<keyof Pick<Native0.AccelerateConfig, PublishedKeys47>, PublishedKeys47>
>;
type Contract153 = Assert<
	Equal<keyof Pick<Native0.AcceptedAnimations, PublishedKeys48>, PublishedKeys48>
>;
type Contract154 = Assert<
	Equal<keyof Pick<Native0.ActiveStatsBuffer, PublishedKeys49>, PublishedKeys49>
>;
type Contract155 = Assert<
	Equal<Parameters<Native0.AddEffectValue<{ sample: string }>>['length'], 4>
>;
type Contract156 = Assert<Equal<Parameters<Native0.AnimateEffect>['length'], 2>>;
type Contract157 = Assert<Equal<keyof Native0.AnimationDefinition, never>>;
type Contract158 = Assert<
	Equal<keyof Pick<Native0.AnimationGeneratorName, PublishedKeys6>, PublishedKeys6>
>;
type Contract159 = Assert<Equal<keyof Native0.AnimationGeneratorType, never>>;
type Contract160 = Assert<
	Equal<keyof Pick<Native0.AnimationList, PublishedKeys11>, PublishedKeys11>
>;
type Contract161 = Assert<
	Equal<keyof Pick<Native0.AnimationOptions, PublishedKeys50>, PublishedKeys50>
>;
type Contract162 = Assert<
	Equal<keyof Pick<Native0.AnimationOrchestrationOptions, PublishedKeys51>, PublishedKeys51>
>;
type Contract163 = Assert<
	Equal<keyof Pick<Native0.AnimationPlaybackControls, PublishedKeys48>, PublishedKeys48>
>;
type Contract164 = Assert<
	Equal<keyof Pick<Native0.AnimationPlaybackControlsWithThen, PublishedKeys52>, PublishedKeys52>
>;
type Contract165 = Assert<
	Equal<
		keyof Pick<Native0.AnimationPlaybackLifecycles<{ sample: string }>, PublishedKeys53>,
		PublishedKeys53
	>
>;
type Contract166 = Assert<
	Equal<keyof Pick<Native0.AnimationPlaybackOptions, PublishedKeys54>, PublishedKeys54>
>;
type Contract167 = Assert<
	Equal<keyof Pick<Native0.AnimationScope, PublishedKeys55>, PublishedKeys55>
>;
type Contract168 = Assert<
	Equal<keyof Pick<Native0.AnimationState, PublishedKeys56>, PublishedKeys56>
>;
type Contract169 = Assert<
	Equal<keyof Pick<Native0.AnimationTypeState, PublishedKeys57>, PublishedKeys57>
>;
type Contract170 = Assert<
	Equal<keyof Pick<Native0.AnyResolvedKeyframe, PublishedKeys40>, PublishedKeys40>
>;
type Contract171 = Assert<
	Equal<keyof Pick<typeof Native0.AsyncMotionValueAnimation, PublishedKeys1>, PublishedKeys1>
>;
type Contract172 = Assert<Equal<keyof Pick<Native0.Batcher, PublishedKeys58>, PublishedKeys58>>;
type Contract173 = Assert<
	Equal<keyof Pick<Native0.CSSStyleDeclarationWithTransform, PublishedKeys59>, PublishedKeys59>
>;
type Contract174 = Assert<
	Equal<keyof Pick<Native0.CSSVariableName, PublishedKeys6>, PublishedKeys6>
>;
type Contract175 = Assert<
	Equal<keyof Pick<Native0.CSSVariableToken, PublishedKeys6>, PublishedKeys6>
>;
type Contract176 = Assert<Equal<Parameters<Native0.CancelProcess>['length'], 1>>;
type Contract177 = Assert<Equal<keyof Pick<Native0.Color, PublishedKeys60>, PublishedKeys60>>;
type Contract178 = Assert<
	Equal<keyof Pick<Native0.ComplexValueInfo, PublishedKeys61>, PublishedKeys61>
>;
type Contract179 = Assert<
	Equal<keyof Pick<Native0.ComplexValues, PublishedKeys11>, PublishedKeys11>
>;
type Contract180 = Assert<
	Equal<keyof Pick<Native0.DOMKeyframesDefinition, PublishedKeys62>, PublishedKeys62>
>;
type Contract181 = Assert<
	Equal<keyof Pick<typeof Native0.DOMKeyframesResolver, PublishedKeys1>, PublishedKeys1>
>;
type Contract182 = Assert<
	Equal<keyof Pick<Native0.DOMValueAnimationOptions, PublishedKeys63>, PublishedKeys63>
>;
type Contract183 = Assert<
	Equal<keyof Pick<typeof Native0.DOMVisualElement, PublishedKeys1>, PublishedKeys1>
>;
type Contract184 = Assert<
	Equal<keyof Pick<Native0.DOMVisualElementOptions, PublishedKeys64>, PublishedKeys64>
>;
type Contract185 = Assert<
	Equal<keyof Pick<Native0.DecayOptions, PublishedKeys65>, PublishedKeys65>
>;
type Contract186 = Assert<Equal<keyof typeof Native0.DocumentProjectionNode, never>>;
type Contract187 = Assert<Equal<keyof Native0.DragElastic, never>>;
type Contract188 = Assert<Equal<Parameters<Native0.DragHandler>['length'], 2>>;
type Contract189 = Assert<
	Equal<keyof Pick<Native0.DraggableProps, PublishedKeys66>, PublishedKeys66>
>;
type Contract190 = Assert<
	Equal<keyof Pick<Native0.DurationSpringOptions, PublishedKeys67>, PublishedKeys67>
>;
type Contract191 = Assert<
	Equal<Parameters<Native0.DynamicOption<{ sample: string }>>['length'], 2>
>;
type Contract192 = Assert<Equal<Parameters<Native0.Effect>['length'], 2>>;
type Contract193 = Assert<
	Equal<keyof Pick<Native0.EffectKeyframes, PublishedKeys68>, PublishedKeys68>
>;
type Contract194 = Assert<
	Equal<keyof Pick<Native0.EffectOptions<{ sample: string }>, PublishedKeys69>, PublishedKeys69>
>;
type Contract195 = Assert<
	Equal<Parameters<Native0.EffectRead<{ sample: string }>>['length'], 2 | 3>
>;
type Contract196 = Assert<Equal<Parameters<Native0.EffectTest<{ sample: string }>>['length'], 1>>;
type Contract197 = Assert<
	Equal<keyof Pick<Native0.EffectTransition, PublishedKeys68>, PublishedKeys68>
>;
type Contract198 = Assert<Equal<keyof Native0.ElementOrSelector, never>>;
type Contract199 = Assert<Equal<keyof Pick<Native0.EventInfo, PublishedKeys70>, PublishedKeys70>>;
type Contract200 = Assert<
	Equal<keyof Pick<Native0.EventOptions, PublishedKeys71>, PublishedKeys71>
>;
type Contract201 = Assert<
	Equal<keyof Pick<typeof Native0.Feature, PublishedKeys1>, PublishedKeys1>
>;
type Contract202 = Assert<Equal<keyof Native0.FeatureClass, never>>;
type Contract203 = Assert<Equal<keyof Pick<Native0.FrameData, PublishedKeys72>, PublishedKeys72>>;
type Contract204 = Assert<Equal<Parameters<Native0.GeneratorFactory>['length'], 1>>;
type Contract205 = Assert<Equal<Parameters<Native0.GeneratorFactoryFunction>['length'], 1>>;
type Contract206 = Assert<
	Equal<keyof Pick<typeof Native0.GroupAnimation, PublishedKeys1>, PublishedKeys1>
>;
type Contract207 = Assert<
	Equal<keyof Pick<typeof Native0.GroupAnimationWithThen, PublishedKeys1>, PublishedKeys1>
>;
type Contract208 = Assert<
	Equal<keyof Pick<Native0.GroupedAnimations, PublishedKeys11>, PublishedKeys11>
>;
type Contract209 = Assert<Equal<keyof Pick<Native0.HSLA, PublishedKeys73>, PublishedKeys73>>;
type Contract210 = Assert<Equal<keyof typeof Native0.HTMLProjectionNode, never>>;
type Contract211 = Assert<
	Equal<keyof Pick<Native0.HTMLRenderState, PublishedKeys74>, PublishedKeys74>
>;
type Contract212 = Assert<
	Equal<keyof Pick<typeof Native0.HTMLVisualElement, PublishedKeys1>, PublishedKeys1>
>;
type Contract213 = Assert<Equal<Parameters<Native0.HandoffFunction>['length'], 3>>;
type Contract214 = Assert<
	Equal<keyof Pick<Native0.InactiveStatsBuffer, PublishedKeys49>, PublishedKeys49>
>;
type Contract215 = Assert<
	Equal<keyof Pick<Native0.InertiaOptions, PublishedKeys75>, PublishedKeys75>
>;
type Contract216 = Assert<
	Equal<keyof Pick<Native0.InitialPromotionConfig, PublishedKeys76>, PublishedKeys76>
>;
type Contract217 = Assert<
	Equal<
		keyof Pick<Native0.InterpolateOptions<{ sample: string }>, PublishedKeys77>,
		PublishedKeys77
	>
>;
type Contract218 = Assert<
	Equal<keyof Pick<typeof Native0.JSAnimation, PublishedKeys1>, PublishedKeys1>
>;
type Contract219 = Assert<
	Equal<keyof Pick<Native0.KeyframeGenerator<{ sample: string }>, PublishedKeys78>, PublishedKeys78>
>;
type Contract220 = Assert<
	Equal<keyof Pick<Native0.KeyframeOptions, PublishedKeys79>, PublishedKeys79>
>;
type Contract221 = Assert<
	Equal<keyof Pick<typeof Native0.KeyframeResolver, PublishedKeys1>, PublishedKeys1>
>;
type Contract222 = Assert<
	Equal<keyof Pick<typeof Native0.LayoutAnimationBuilder, PublishedKeys1>, PublishedKeys1>
>;
type Contract223 = Assert<Equal<keyof Pick<Native0.LayoutEvents, PublishedKeys6>, PublishedKeys6>>;
type Contract224 = Assert<
	Equal<keyof Pick<Native0.LayoutLifecycles, PublishedKeys80>, PublishedKeys80>
>;
type Contract225 = Assert<
	Equal<keyof Pick<Native0.LayoutProjectionMetrics, PublishedKeys81>, PublishedKeys81>
>;
type Contract226 = Assert<
	Equal<keyof Pick<Native0.LayoutProjectionStats, PublishedKeys81>, PublishedKeys81>
>;
type Contract227 = Assert<
	Equal<keyof Pick<Native0.LayoutUpdateData, PublishedKeys82>, PublishedKeys82>
>;
type Contract228 = Assert<Equal<Parameters<Native0.LayoutUpdateHandler>['length'], 1>>;
type Contract229 = Assert<
	Equal<keyof Pick<Native0.LegacyAnimationControls, PublishedKeys83>, PublishedKeys83>
>;
type Contract230 = Assert<
	Equal<keyof Pick<Native0.MapInputRange, PublishedKeys11>, PublishedKeys11>
>;
type Contract231 = Assert<
	Equal<keyof Pick<Native0.Measurements, PublishedKeys84>, PublishedKeys84>
>;
type Contract232 = Assert<Equal<Parameters<Native0.Mixer<{ sample: string }>>['length'], 1>>;
type Contract233 = Assert<Equal<Parameters<Native0.MixerFactory<{ sample: string }>>['length'], 2>>;
type Contract234 = Assert<
	Equal<keyof Pick<Native0.MotionConfigContextProps, PublishedKeys85>, PublishedKeys85>
>;
type Contract235 = Assert<
	Equal<keyof Pick<Native0.MotionNodeAdvancedOptions, PublishedKeys86>, PublishedKeys86>
>;
type Contract236 = Assert<
	Equal<keyof Pick<Native0.MotionNodeAnimationOptions, PublishedKeys87>, PublishedKeys87>
>;
type Contract237 = Assert<
	Equal<keyof Pick<Native0.MotionNodeDragHandlers, PublishedKeys88>, PublishedKeys88>
>;
type Contract238 = Assert<
	Equal<keyof Pick<Native0.MotionNodeDraggableOptions, PublishedKeys89>, PublishedKeys89>
>;
type Contract239 = Assert<
	Equal<keyof Pick<Native0.MotionNodeEventOptions, PublishedKeys90>, PublishedKeys90>
>;
type Contract240 = Assert<
	Equal<keyof Pick<Native0.MotionNodeFocusHandlers, PublishedKeys91>, PublishedKeys91>
>;
type Contract241 = Assert<
	Equal<keyof Pick<Native0.MotionNodeHoverHandlers, PublishedKeys92>, PublishedKeys92>
>;
type Contract242 = Assert<
	Equal<keyof Pick<Native0.MotionNodeLayoutOptions, PublishedKeys93>, PublishedKeys93>
>;
type Contract243 = Assert<
	Equal<keyof Pick<Native0.MotionNodeOptions, PublishedKeys94>, PublishedKeys94>
>;
type Contract244 = Assert<
	Equal<keyof Pick<Native0.MotionNodePanHandlers, PublishedKeys95>, PublishedKeys95>
>;
type Contract245 = Assert<
	Equal<keyof Pick<Native0.MotionNodeTapHandlers, PublishedKeys96>, PublishedKeys96>
>;
type Contract246 = Assert<
	Equal<keyof Pick<Native0.MotionNodeViewportOptions, PublishedKeys97>, PublishedKeys97>
>;
type Contract247 = Assert<
	Equal<keyof Pick<typeof Native0.MotionValue, PublishedKeys1>, PublishedKeys1>
>;
type Contract248 = Assert<
	Equal<
		keyof Pick<Native0.MotionValueEventCallbacks<{ sample: string }>, PublishedKeys98>,
		PublishedKeys98
	>
>;
type Contract249 = Assert<
	Equal<keyof Pick<Native0.MotionValueOptions, PublishedKeys99>, PublishedKeys99>
>;
type Contract250 = Assert<
	Equal<keyof Pick<typeof Native0.MotionValueState, PublishedKeys1>, PublishedKeys1>
>;
type Contract251 = Assert<
	Equal<Parameters<Native0.MultiTransformer<{ sample: string }, { sample: string }>>['length'], 1>
>;
type Contract252 = Assert<
	Equal<keyof Pick<typeof Native0.NativeAnimation, PublishedKeys1>, PublishedKeys1>
>;
type Contract253 = Assert<
	Equal<keyof Pick<typeof Native0.NativeAnimationExtended, PublishedKeys1>, PublishedKeys1>
>;
type Contract254 = Assert<
	Equal<keyof Pick<Native0.NativeAnimationOptions, PublishedKeys63>, PublishedKeys63>
>;
type Contract255 = Assert<
	Equal<
		keyof Pick<Native0.NativeAnimationOptionsExtended<number>, PublishedKeys100>,
		PublishedKeys100
	>
>;
type Contract256 = Assert<
	Equal<keyof Pick<typeof Native0.NativeAnimationWrapper, PublishedKeys1>, PublishedKeys1>
>;
type Contract257 = Assert<Equal<keyof Pick<Native0.NodeGroup, PublishedKeys101>, PublishedKeys101>>;
type Contract258 = Assert<
	Equal<keyof Pick<typeof Native0.NodeStack, PublishedKeys1>, PublishedKeys1>
>;
type Contract259 = Assert<Equal<keyof Pick<Native0.NumberMap, PublishedKeys5>, PublishedKeys5>>;
type Contract260 = Assert<
	Equal<keyof Pick<typeof Native0.ObjectVisualElement, PublishedKeys1>, PublishedKeys1>
>;
type Contract261 = Assert<Equal<Parameters<Native0.OnHoverEndEvent>['length'], 1>>;
type Contract262 = Assert<Equal<Parameters<Native0.OnHoverStartEvent>['length'], 2>>;
type Contract263 = Assert<Equal<Parameters<Native0.OnKeyframesResolved<number>>['length'], 3>>;
type Contract264 = Assert<Equal<Parameters<Native0.OnPressEndEvent>['length'], 2>>;
type Contract265 = Assert<Equal<Parameters<Native0.OnPressStartEvent>['length'], 2>>;
type Contract266 = Assert<Equal<keyof Pick<Native0.Owner, PublishedKeys102>, PublishedKeys102>>;
type Contract267 = Assert<Equal<Parameters<Native0.PanHandler>['length'], 2>>;
type Contract268 = Assert<Equal<keyof Pick<Native0.PanInfo, PublishedKeys103>, PublishedKeys103>>;
type Contract269 = Assert<
	Equal<Parameters<Native0.PassiveEffect<{ sample: string }>>['length'], 2>
>;
type Contract270 = Assert<Equal<Parameters<Native0.PathInterpolator>['length'], 1>>;
type Contract271 = Assert<Equal<keyof Pick<Native0.PathState, PublishedKeys104>, PublishedKeys104>>;
type Contract272 = Assert<Equal<keyof Pick<Native0.Phase, PublishedKeys6>, PublishedKeys6>>;
type Contract273 = Assert<Equal<keyof Pick<Native0.Point2D, PublishedKeys105>, PublishedKeys105>>;
type Contract274 = Assert<
	Equal<keyof Pick<Native0.PointerEventOptions, PublishedKeys106>, PublishedKeys106>
>;
type Contract275 = Assert<
	Equal<keyof Pick<Native0.PresenceContextProps, PublishedKeys107>, PublishedKeys107>
>;
type Contract276 = Assert<
	Equal<keyof Pick<Native0.PressGestureInfo, PublishedKeys108>, PublishedKeys108>
>;
type Contract277 = Assert<Equal<Parameters<Native0.Process>['length'], 1>>;
type Contract278 = Assert<
	Equal<keyof Pick<Native0.ProgressTimeline, PublishedKeys109>, PublishedKeys109>
>;
type Contract279 = Assert<
	Equal<keyof Pick<Native0.ProjectionEventName, PublishedKeys6>, PublishedKeys6>
>;
type Contract280 = Assert<
	Equal<
		keyof Pick<Native0.ProjectionNodeConfig<{ sample: string }>, PublishedKeys110>,
		PublishedKeys110
	>
>;
type Contract281 = Assert<
	Equal<keyof Pick<Native0.ProjectionNodeOptions, PublishedKeys111>, PublishedKeys111>
>;
type Contract282 = Assert<
	Equal<keyof Pick<Native0.PropagateOptions, PublishedKeys112>, PublishedKeys112>
>;
type Contract283 = Assert<Equal<keyof Pick<Native0.RGBA, PublishedKeys113>, PublishedKeys113>>;
type Contract284 = Assert<
	Equal<keyof Pick<Native0.ReducedMotionConfig, PublishedKeys6>, PublishedKeys6>
>;
type Contract285 = Assert<Equal<keyof Pick<Native0.RepeatType, PublishedKeys6>, PublishedKeys6>>;
type Contract286 = Assert<
	Equal<keyof Pick<Native0.ResolvedConstraints, PublishedKeys105>, PublishedKeys105>
>;
type Contract287 = Assert<
	Equal<keyof Pick<Native0.ResolvedElastic, PublishedKeys105>, PublishedKeys105>
>;
type Contract288 = Assert<
	Equal<keyof Pick<Native0.ResolvedKeyframes<number>, PublishedKeys11>, PublishedKeys11>
>;
type Contract289 = Assert<
	Equal<keyof Pick<Native0.ResolvedValueKeyframe, PublishedKeys114>, PublishedKeys114>
>;
type Contract290 = Assert<
	Equal<keyof Pick<Native0.SVGAttributes, PublishedKeys115>, PublishedKeys115>
>;
type Contract291 = Assert<
	Equal<keyof Pick<Native0.SVGForcedAttrKeyframesDefinition, PublishedKeys116>, PublishedKeys116>
>;
type Contract292 = Assert<
	Equal<keyof Pick<Native0.SVGForcedAttrProperties, PublishedKeys116>, PublishedKeys116>
>;
type Contract293 = Assert<
	Equal<keyof Pick<Native0.SVGForcedAttrTransitions, PublishedKeys116>, PublishedKeys116>
>;
type Contract294 = Assert<
	Equal<keyof Pick<Native0.SVGKeyframesDefinition, PublishedKeys117>, PublishedKeys117>
>;
type Contract295 = Assert<
	Equal<keyof Pick<Native0.SVGPathKeyframesDefinition, PublishedKeys118>, PublishedKeys118>
>;
type Contract296 = Assert<
	Equal<keyof Pick<Native0.SVGPathProperties, PublishedKeys118>, PublishedKeys118>
>;
type Contract297 = Assert<
	Equal<keyof Pick<Native0.SVGPathTransitions, PublishedKeys118>, PublishedKeys118>
>;
type Contract298 = Assert<
	Equal<keyof Pick<Native0.SVGRenderState, PublishedKeys119>, PublishedKeys119>
>;
type Contract299 = Assert<
	Equal<keyof Pick<Native0.SVGTransitions, PublishedKeys117>, PublishedKeys117>
>;
type Contract300 = Assert<
	Equal<keyof Pick<typeof Native0.SVGVisualElement, PublishedKeys1>, PublishedKeys1>
>;
type Contract301 = Assert<
	Equal<keyof Pick<Native0.ScaleCorrectionNode, PublishedKeys120>, PublishedKeys120>
>;
type Contract302 = Assert<Equal<Parameters<Native0.ScaleCorrector>['length'], 2>>;
type Contract303 = Assert<
	Equal<keyof Pick<Native0.ScaleCorrectorDefinition, PublishedKeys121>, PublishedKeys121>
>;
type Contract304 = Assert<
	Equal<keyof Pick<Native0.ScaleCorrectorMap, PublishedKeys5>, PublishedKeys5>
>;
type Contract305 = Assert<Equal<Parameters<Native0.Schedule>['length'], 1 | 2 | 3>>;
type Contract306 = Assert<
	Equal<keyof Pick<Native0.ScrollMeasurements, PublishedKeys122>, PublishedKeys122>
>;
type Contract307 = Assert<Equal<keyof Pick<Native0.SelectorCache, PublishedKeys5>, PublishedKeys5>>;
type Contract308 = Assert<
	Equal<Parameters<Native0.SingleTransformer<{ sample: string }, { sample: string }>>['length'], 1>
>;
type Contract309 = Assert<Equal<keyof Pick<Native0.Spring, PublishedKeys123>, PublishedKeys123>>;
type Contract310 = Assert<
	Equal<keyof Pick<Native0.SpringOptions, PublishedKeys123>, PublishedKeys123>
>;
type Contract311 = Assert<
	Equal<keyof Pick<Native0.StaggerOptions, PublishedKeys124>, PublishedKeys124>
>;
type Contract312 = Assert<
	Equal<keyof Pick<Native0.StaggerOrigin, PublishedKeys40>, PublishedKeys40>
>;
type Contract313 = Assert<Equal<Parameters<Native0.StartAnimation>['length'], 1>>;
type Contract314 = Assert<
	Equal<keyof Pick<Native0.StatsRecording, PublishedKeys125>, PublishedKeys125>
>;
type Contract315 = Assert<Equal<keyof Pick<Native0.Step, PublishedKeys126>, PublishedKeys126>>;
type Contract316 = Assert<Equal<keyof Pick<Native0.StepId, PublishedKeys6>, PublishedKeys6>>;
type Contract317 = Assert<Equal<keyof Pick<Native0.Steps, PublishedKeys58>, PublishedKeys58>>;
type Contract318 = Assert<
	Equal<keyof Pick<Native0.StyleKeyframesDefinition, PublishedKeys59>, PublishedKeys59>
>;
type Contract319 = Assert<
	Equal<keyof Pick<Native0.StyleTransitions, PublishedKeys59>, PublishedKeys59>
>;
type Contract320 = Assert<Equal<Parameters<Native0.Subscriber<{ sample: string }>>['length'], 1>>;
type Contract321 = Assert<Equal<keyof Pick<Native0.TapHandlers, PublishedKeys96>, PublishedKeys96>>;
type Contract322 = Assert<Equal<keyof Pick<Native0.TapInfo, PublishedKeys70>, PublishedKeys70>>;
type Contract323 = Assert<Equal<keyof Pick<Native0.Target, PublishedKeys62>, PublishedKeys62>>;
type Contract324 = Assert<
	Equal<keyof Pick<Native0.TargetAndTransition, PublishedKeys127>, PublishedKeys127>
>;
type Contract325 = Assert<Equal<Parameters<Native0.TargetResolver>['length'], 3>>;
type Contract326 = Assert<
	Equal<keyof Pick<Native0.TimelineWithFallback, PublishedKeys128>, PublishedKeys128>
>;
type Contract327 = Assert<
	Equal<keyof Pick<Native0.TransformInputRange, PublishedKeys11>, PublishedKeys11>
>;
type Contract328 = Assert<
	Equal<keyof Pick<Native0.TransformOptions<{ sample: string }>, PublishedKeys77>, PublishedKeys77>
>;
type Contract329 = Assert<
	Equal<keyof Pick<Native0.TransformOrigin, PublishedKeys129>, PublishedKeys129>
>;
type Contract330 = Assert<
	Equal<keyof Pick<Native0.TransformProperties, PublishedKeys29>, PublishedKeys29>
>;
type Contract331 = Assert<Equal<Parameters<Native0.TransformTemplate>['length'], 2>>;
type Contract332 = Assert<Equal<Parameters<Native0.Transformer>['length'], 1>>;
type Contract333 = Assert<
	Equal<keyof Pick<Native0.Transition, PublishedKeys130>, PublishedKeys130>
>;
type Contract334 = Assert<
	Equal<
		keyof Pick<Native0.TransitionWithValueOverrides<{ sample: string }>, PublishedKeys131>,
		PublishedKeys131
	>
>;
type Contract335 = Assert<Equal<keyof Pick<Native0.Tween, PublishedKeys79>, PublishedKeys79>>;
type Contract336 = Assert<
	Equal<keyof Pick<Native0.UnresolvedKeyframes<number>, PublishedKeys11>, PublishedKeys11>
>;
type Contract337 = Assert<Equal<keyof Native0.UnresolvedValueKeyframe, never>>;
type Contract338 = Assert<Equal<Parameters<Native0.UseRenderState>['length'], 0>>;
type Contract339 = Assert<
	Equal<keyof Pick<Native0.ValueAnimationOptions, PublishedKeys132>, PublishedKeys132>
>;
type Contract340 = Assert<
	Equal<
		keyof Pick<Native0.ValueAnimationOptionsWithRenderContext, PublishedKeys133>,
		PublishedKeys133
	>
>;
type Contract341 = Assert<
	Equal<keyof Pick<Native0.ValueAnimationTransition, PublishedKeys130>, PublishedKeys130>
>;
type Contract342 = Assert<
	Equal<keyof Pick<Native0.ValueAnimationWithDynamicDelay, PublishedKeys130>, PublishedKeys130>
>;
type Contract343 = Assert<
	Equal<keyof Pick<Native0.ValueIndexes, PublishedKeys134>, PublishedKeys134>
>;
type Contract344 = Assert<
	Equal<keyof Pick<Native0.ValueKeyframe, PublishedKeys40>, PublishedKeys40>
>;
type Contract345 = Assert<
	Equal<keyof Pick<Native0.ValueKeyframesDefinition, PublishedKeys114>, PublishedKeys114>
>;
type Contract346 = Assert<
	Equal<Parameters<Native0.ValueTransformer<{ sample: string }, { sample: string }>>['length'], 1>
>;
type Contract347 = Assert<
	Equal<keyof Pick<Native0.ValueTransition, PublishedKeys135>, PublishedKeys135>
>;
type Contract348 = Assert<Equal<keyof Pick<Native0.ValueType, PublishedKeys136>, PublishedKeys136>>;
type Contract349 = Assert<Equal<keyof Pick<Native0.ValueTypeMap, PublishedKeys5>, PublishedKeys5>>;
type Contract350 = Assert<
	Equal<keyof Pick<Native0.VariableKeyframesDefinition, PublishedKeys137>, PublishedKeys137>
>;
type Contract351 = Assert<
	Equal<keyof Pick<Native0.VariableTransitions, PublishedKeys137>, PublishedKeys137>
>;
type Contract352 = Assert<Equal<keyof Native0.Variant, never>>;
type Contract353 = Assert<Equal<keyof Pick<Native0.Variants, PublishedKeys5>, PublishedKeys5>>;
type Contract354 = Assert<
	Equal<keyof Pick<Native0.VelocityOptions, PublishedKeys138>, PublishedKeys138>
>;
type Contract355 = Assert<
	Equal<keyof Pick<Native0.ViewTransitionAnimationDefinition, PublishedKeys139>, PublishedKeys139>
>;
type Contract356 = Assert<
	Equal<keyof Pick<typeof Native0.ViewTransitionBuilder, PublishedKeys1>, PublishedKeys1>
>;
type Contract357 = Assert<
	Equal<keyof Pick<Native0.ViewTransitionOptions, PublishedKeys140>, PublishedKeys140>
>;
type Contract358 = Assert<
	Equal<keyof Pick<Native0.ViewTransitionTarget, PublishedKeys141>, PublishedKeys141>
>;
type Contract359 = Assert<
	Equal<keyof Pick<Native0.ViewTransitionTargetDefinition, PublishedKeys142>, PublishedKeys142>
>;
type Contract360 = Assert<Equal<Parameters<Native0.ViewportEventHandler>['length'], 1>>;
type Contract361 = Assert<
	Equal<keyof Pick<Native0.ViewportOptions, PublishedKeys143>, PublishedKeys143>
>;
type Contract362 = Assert<
	Equal<keyof Pick<Native0.VisualElementAnimationOptions, PublishedKeys144>, PublishedKeys144>
>;
type Contract363 = Assert<
	Equal<keyof Pick<Native0.VisualElementEventCallbacks, PublishedKeys145>, PublishedKeys145>
>;
type Contract364 = Assert<
	Equal<
		keyof Pick<Native0.VisualElementOptions<{ sample: string }>, PublishedKeys146>,
		PublishedKeys146
	>
>;
type Contract365 = Assert<
	Equal<keyof Pick<Native0.WillChange, PublishedKeys147>, PublishedKeys147>
>;
type Contract366 = Assert<
	Equal<keyof Pick<Native0.WithAppearProps, PublishedKeys148>, PublishedKeys148>
>;
type Contract367 = Assert<Equal<keyof Pick<Native0.WithDepth, PublishedKeys149>, PublishedKeys149>>;
type Contract368 = Assert<
	Equal<keyof Pick<Native0.WithQuerySelectorAll, PublishedKeys150>, PublishedKeys150>
>;
type Contract369 = Assert<
	Equal<keyof Pick<typeof Native0.acceleratedValues, PublishedKeys151>, PublishedKeys151>
>;
type Contract370 = Assert<Equal<Parameters<typeof Native0.addAttrValue>['length'], 4>>;
type Contract371 = Assert<Equal<Parameters<typeof Native0.addDomEvent>['length'], 3 | 4>>;
type Contract372 = Assert<Equal<Parameters<typeof Native0.addEffect>['length'], 1>>;
type Contract373 = Assert<Equal<Parameters<typeof Native0.addStyleValue>['length'], 4>>;
type Contract374 = Assert<Equal<Parameters<typeof Native0.addValueToWillChange>['length'], 2>>;
type Contract375 = Assert<
	Equal<keyof Pick<typeof Native0.alpha, PublishedKeys152>, PublishedKeys152>
>;
type Contract376 = Assert<Equal<Parameters<typeof Native0.analyseComplexValue>['length'], 1>>;
type Contract377 = Assert<Equal<Parameters<typeof Native0.animateEffectSubject>['length'], 3 | 4>>;
type Contract378 = Assert<
	Equal<Parameters<typeof Native0.animateMotionValue>['length'], 3 | 4 | 5 | 6>
>;
type Contract379 = Assert<Equal<Parameters<typeof Native0.animateSingleValue>['length'], 2 | 3>>;
type Contract380 = Assert<Equal<Parameters<typeof Native0.animateTarget>['length'], 2 | 3>>;
type Contract381 = Assert<Equal<Parameters<typeof Native0.animateValue>['length'], 1>>;
type Contract382 = Assert<Equal<Parameters<typeof Native0.animateVariant>['length'], 2 | 3>>;
type Contract383 = Assert<Equal<Parameters<typeof Native0.animateView>['length'], 1 | 2>>;
type Contract384 = Assert<Equal<Parameters<typeof Native0.animationMapKey>['length'], 1 | 2>>;
type Contract385 = Assert<Equal<Parameters<typeof Native0.applyAxisDelta>['length'], 4 | 5>>;
type Contract386 = Assert<Equal<Parameters<typeof Native0.applyBoxDelta>['length'], 2>>;
type Contract387 = Assert<Equal<Parameters<typeof Native0.applyGeneratorOptions>['length'], 1>>;
type Contract388 = Assert<Equal<Parameters<typeof Native0.applyPointDelta>['length'], 4 | 5>>;
type Contract389 = Assert<Equal<Parameters<typeof Native0.applyPxDefaults>['length'], 2>>;
type Contract390 = Assert<Equal<Parameters<typeof Native0.applyTreeDeltas>['length'], 3 | 4>>;
type Contract391 = Assert<Equal<Parameters<typeof Native0.aspectRatio>['length'], 1>>;
type Contract392 = Assert<Equal<Parameters<typeof Native0.attachFollow>['length'], 2 | 3>>;
type Contract393 = Assert<Equal<Parameters<typeof Native0.attachSpring>['length'], 2 | 3>>;
type Contract394 = Assert<Equal<Parameters<typeof Native0.attrEffect>['length'], 2>>;
type Contract395 = Assert<Equal<Parameters<typeof Native0.axisDeltaEquals>['length'], 2>>;
type Contract396 = Assert<Equal<Parameters<typeof Native0.axisEquals>['length'], 2>>;
type Contract397 = Assert<Equal<Parameters<typeof Native0.axisEqualsRounded>['length'], 2>>;
type Contract398 = Assert<Equal<Parameters<typeof Native0.boxEquals>['length'], 2>>;
type Contract399 = Assert<Equal<Parameters<typeof Native0.boxEqualsRounded>['length'], 2>>;
type Contract400 = Assert<Equal<Parameters<typeof Native0.buildHTMLStyles>['length'], 2 | 3>>;
type Contract401 = Assert<
	Equal<Parameters<typeof Native0.buildProjectionTransform>['length'], 2 | 3>
>;
type Contract402 = Assert<Equal<Parameters<typeof Native0.buildSVGAttrs>['length'], 3 | 4 | 5>>;
type Contract403 = Assert<Equal<Parameters<typeof Native0.buildSVGPath>['length'], 2 | 3 | 4 | 5>>;
type Contract404 = Assert<Equal<Parameters<typeof Native0.calcAxisDelta>['length'], 3 | 4>>;
type Contract405 = Assert<Equal<Parameters<typeof Native0.calcBoxDelta>['length'], 3 | 4>>;
type Contract406 = Assert<
	Equal<Parameters<typeof Native0.calcChildStagger>['length'], 2 | 3 | 4 | 5>
>;
type Contract407 = Assert<
	Equal<Parameters<typeof Native0.calcGeneratorDuration>['length'], 1 | 2 | 3 | 4>
>;
type Contract408 = Assert<Equal<Parameters<typeof Native0.calcRelativeAxis>['length'], 3 | 4>>;
type Contract409 = Assert<
	Equal<Parameters<typeof Native0.calcRelativeAxisPosition>['length'], 3 | 4>
>;
type Contract410 = Assert<Equal<Parameters<typeof Native0.calcRelativeBox>['length'], 3 | 4>>;
type Contract411 = Assert<Equal<Parameters<typeof Native0.calcRelativePosition>['length'], 3 | 4>>;
type Contract412 = Assert<
	Equal<keyof Pick<typeof Native0.camelCaseAttributes, PublishedKeys151>, PublishedKeys151>
>;
type Contract413 = Assert<Equal<Parameters<typeof Native0.camelToDash>['length'], 1>>;
type Contract414 = Assert<Equal<Parameters<typeof Native0.cancelFrame>['length'], 1>>;
type Contract415 = Assert<Equal<Parameters<typeof Native0.cancelMicrotask>['length'], 1>>;
type Contract416 = Assert<
	Equal<keyof Pick<typeof Native0.cancelSync, PublishedKeys68>, PublishedKeys68>
>;
type Contract417 = Assert<Equal<Parameters<typeof Native0.checkVariantsDidChange>['length'], 2>>;
type Contract418 = Assert<Equal<Parameters<typeof Native0.cleanDirtyNodes>['length'], 1>>;
type Contract419 = Assert<
	Equal<keyof Pick<typeof Native0.collectMotionValues, PublishedKeys153>, PublishedKeys153>
>;
type Contract420 = Assert<
	Equal<keyof Pick<typeof Native0.color, PublishedKeys154>, PublishedKeys154>
>;
type Contract421 = Assert<Equal<Parameters<typeof Native0.compareByDepth>['length'], 2>>;
type Contract422 = Assert<
	Equal<keyof Pick<typeof Native0.complex, PublishedKeys155>, PublishedKeys155>
>;
type Contract423 = Assert<Equal<Parameters<typeof Native0.containsCSSVariable>['length'], 0 | 1>>;
type Contract424 = Assert<Equal<Parameters<typeof Native0.convertBoundingBoxToBox>['length'], 1>>;
type Contract425 = Assert<Equal<Parameters<typeof Native0.convertBoxToBoundingBox>['length'], 1>>;
type Contract426 = Assert<Equal<Parameters<typeof Native0.convertOffsetToTimes>['length'], 2>>;
type Contract427 = Assert<Equal<Parameters<typeof Native0.copyAxisDeltaInto>['length'], 2>>;
type Contract428 = Assert<Equal<Parameters<typeof Native0.copyAxisInto>['length'], 2>>;
type Contract429 = Assert<Equal<Parameters<typeof Native0.copyBoxInto>['length'], 2>>;
type Contract430 = Assert<
	Equal<keyof Pick<typeof Native0.correctBorderRadius, PublishedKeys121>, PublishedKeys121>
>;
type Contract431 = Assert<
	Equal<keyof Pick<typeof Native0.correctBoxShadow, PublishedKeys121>, PublishedKeys121>
>;
type Contract432 = Assert<Equal<Parameters<typeof Native0.createAnimationState>['length'], 1>>;
type Contract433 = Assert<Equal<Parameters<typeof Native0.createAxis>['length'], 0>>;
type Contract434 = Assert<Equal<Parameters<typeof Native0.createAxisDelta>['length'], 0>>;
type Contract435 = Assert<Equal<Parameters<typeof Native0.createDelta>['length'], 0>>;
type Contract436 = Assert<Equal<Parameters<typeof Native0.createEffect>['length'], 1 | 2>>;
type Contract437 = Assert<Equal<Parameters<typeof Native0.createGeneratorEasing>['length'], 3>>;
type Contract438 = Assert<Equal<Parameters<typeof Native0.createProjectionNode>['length'], 1>>;
type Contract439 = Assert<Equal<Parameters<typeof Native0.createRenderBatcher>['length'], 2>>;
type Contract440 = Assert<Equal<Parameters<typeof Native0.cubicBezierAsString>['length'], 1>>;
type Contract441 = Assert<Equal<Parameters<typeof Native0.defaultEasing>['length'], 1 | 2>>;
type Contract442 = Assert<Equal<Parameters<typeof Native0.defaultOffset>['length'], 1>>;
type Contract443 = Assert<Equal<Parameters<typeof Native0.defaultTransformValue>['length'], 1>>;
type Contract444 = Assert<
	Equal<keyof Pick<typeof Native0.defaultValueTypes, PublishedKeys5>, PublishedKeys5>
>;
type Contract445 = Assert<
	Equal<keyof Pick<typeof Native0.degrees, PublishedKeys152>, PublishedKeys152>
>;
type Contract446 = Assert<Equal<Parameters<typeof Native0.delayInSeconds>['length'], 2>>;
type Contract447 = Assert<
	Equal<keyof Pick<typeof Native0.dimensionValueTypes, PublishedKeys11>, PublishedKeys11>
>;
type Contract448 = Assert<Equal<Parameters<typeof Native0.eachAxis>['length'], 1>>;
type Contract449 = Assert<Equal<Parameters<typeof Native0.fillOffset>['length'], 2>>;
type Contract450 = Assert<Equal<Parameters<typeof Native0.fillWildcards>['length'], 1>>;
type Contract451 = Assert<Equal<Parameters<typeof Native0.findDimensionValueType>['length'], 1>>;
type Contract452 = Assert<Equal<Parameters<typeof Native0.findEffect>['length'], 1>>;
type Contract453 = Assert<Equal<Parameters<typeof Native0.findValueType>['length'], 1>>;
type Contract454 = Assert<Equal<Parameters<typeof Native0.flushKeyframeResolvers>['length'], 0>>;
type Contract455 = Assert<Equal<Parameters<typeof Native0.followValue>['length'], 1 | 2>>;
type Contract456 = Assert<
	Equal<keyof Pick<typeof Native0.frame, PublishedKeys58>, PublishedKeys58>
>;
type Contract457 = Assert<
	Equal<keyof Pick<typeof Native0.frameData, PublishedKeys72>, PublishedKeys72>
>;
type Contract458 = Assert<
	Equal<keyof Pick<typeof Native0.frameSteps, PublishedKeys58>, PublishedKeys58>
>;
type Contract459 = Assert<Equal<Parameters<typeof Native0.generateLinearEasing>['length'], 2 | 3>>;
type Contract460 = Assert<Equal<Parameters<typeof Native0.getAnimatableNone>['length'], 2>>;
type Contract461 = Assert<Equal<Parameters<typeof Native0.getAnimationMap>['length'], 1>>;
type Contract462 = Assert<Equal<Parameters<typeof Native0.getComputedStyle>['length'], 2>>;
type Contract463 = Assert<Equal<Parameters<typeof Native0.getDefaultTransition>['length'], 2>>;
type Contract464 = Assert<Equal<Parameters<typeof Native0.getDefaultValueType>['length'], 1>>;
type Contract465 = Assert<Equal<Parameters<typeof Native0.getFeatureDefinitions>['length'], 0>>;
type Contract466 = Assert<Equal<Parameters<typeof Native0.getFinalKeyframe>['length'], 2 | 3 | 4>>;
type Contract467 = Assert<Equal<Parameters<typeof Native0.getMixer>['length'], 1>>;
type Contract468 = Assert<Equal<Parameters<typeof Native0.getOptimisedAppearId>['length'], 1>>;
type Contract469 = Assert<Equal<Parameters<typeof Native0.getOriginIndex>['length'], 2>>;
type Contract470 = Assert<Equal<Parameters<typeof Native0.getValueAsType>['length'], 1 | 2>>;
type Contract471 = Assert<Equal<Parameters<typeof Native0.getValueTransition>['length'], 2>>;
type Contract472 = Assert<Equal<Parameters<typeof Native0.getVariableValue>['length'], 2 | 3>>;
type Contract473 = Assert<Equal<Parameters<typeof Native0.getVariantContext>['length'], 0 | 1>>;
type Contract474 = Assert<Equal<Parameters<typeof Native0.getViewAnimationLayerInfo>['length'], 1>>;
type Contract475 = Assert<Equal<Parameters<typeof Native0.getViewAnimations>['length'], 0>>;
type Contract476 = Assert<
	Equal<keyof Pick<typeof Native0.globalProjectionState, PublishedKeys156>, PublishedKeys156>
>;
type Contract477 = Assert<Equal<Parameters<typeof Native0.has2DTranslate>['length'], 1>>;
type Contract478 = Assert<
	Equal<keyof Pick<typeof Native0.hasReducedMotionListener, PublishedKeys153>, PublishedKeys153>
>;
type Contract479 = Assert<Equal<Parameters<typeof Native0.hasScale>['length'], 1>>;
type Contract480 = Assert<Equal<Parameters<typeof Native0.hasTransform>['length'], 1>>;
type Contract481 = Assert<
	Equal<keyof Pick<typeof Native0.hex, PublishedKeys152>, PublishedKeys152>
>;
type Contract482 = Assert<Equal<Parameters<typeof Native0.hover>['length'], 2 | 3>>;
type Contract483 = Assert<
	Equal<keyof Pick<typeof Native0.hsla, PublishedKeys152>, PublishedKeys152>
>;
type Contract484 = Assert<Equal<Parameters<typeof Native0.hslaToRgba>['length'], 1>>;
type Contract485 = Assert<Equal<Parameters<typeof Native0.inertia>['length'], 1>>;
type Contract486 = Assert<Equal<Parameters<typeof Native0.initPrefersReducedMotion>['length'], 0>>;
type Contract487 = Assert<Equal<Parameters<typeof Native0.interpolate>['length'], 2 | 3>>;
type Contract488 = Assert<
	Equal<keyof Pick<typeof Native0.invisibleValues, PublishedKeys151>, PublishedKeys151>
>;
type Contract489 = Assert<Equal<Parameters<typeof Native0.isAnimationControls>['length'], 0 | 1>>;
type Contract490 = Assert<Equal<Parameters<typeof Native0.isCSSVariableName>['length'], 0 | 1>>;
type Contract491 = Assert<Equal<Parameters<typeof Native0.isCSSVariableToken>['length'], 0 | 1>>;
type Contract492 = Assert<Equal<Parameters<typeof Native0.isControllingVariants>['length'], 1>>;
type Contract493 = Assert<Equal<Parameters<typeof Native0.isDeltaZero>['length'], 1>>;
type Contract494 = Assert<Equal<Parameters<typeof Native0.isDragActive>['length'], 0>>;
type Contract495 = Assert<
	Equal<keyof Pick<typeof Native0.isDragging, PublishedKeys105>, PublishedKeys105>
>;
type Contract496 = Assert<
	Equal<Parameters<typeof Native0.isElementKeyboardAccessible>['length'], 1>
>;
type Contract497 = Assert<Equal<Parameters<typeof Native0.isElementTextInput>['length'], 1>>;
type Contract498 = Assert<Equal<Parameters<typeof Native0.isForcedMotionValue>['length'], 2>>;
type Contract499 = Assert<Equal<Parameters<typeof Native0.isGenerator>['length'], 0 | 1>>;
type Contract500 = Assert<Equal<Parameters<typeof Native0.isHTMLElement>['length'], 1>>;
type Contract501 = Assert<Equal<Parameters<typeof Native0.isKeyframesTarget>['length'], 1>>;
type Contract502 = Assert<Equal<Parameters<typeof Native0.isMotionValue>['length'], 1>>;
type Contract503 = Assert<Equal<Parameters<typeof Native0.isNear>['length'], 3>>;
type Contract504 = Assert<Equal<Parameters<typeof Native0.isNodeOrChild>['length'], 1 | 2>>;
type Contract505 = Assert<Equal<Parameters<typeof Native0.isPrimaryPointer>['length'], 1>>;
type Contract506 = Assert<Equal<Parameters<typeof Native0.isSVGElement>['length'], 1>>;
type Contract507 = Assert<Equal<Parameters<typeof Native0.isSVGSVGElement>['length'], 1>>;
type Contract508 = Assert<Equal<Parameters<typeof Native0.isSVGTag>['length'], 1>>;
type Contract509 = Assert<Equal<Parameters<typeof Native0.isTransitionDefined>['length'], 1>>;
type Contract510 = Assert<Equal<Parameters<typeof Native0.isVariantLabel>['length'], 1>>;
type Contract511 = Assert<Equal<Parameters<typeof Native0.isVariantNode>['length'], 1>>;
type Contract512 = Assert<
	Equal<Parameters<typeof Native0.isWaapiSupportedEasing>['length'], 0 | 1>
>;
type Contract513 = Assert<Equal<Parameters<typeof Native0.isWillChangeMotionValue>['length'], 1>>;
type Contract514 = Assert<Equal<Parameters<typeof Native0.keyframes>['length'], 1>>;
type Contract515 = Assert<Equal<Parameters<typeof Native0.makeAnimationInstant>['length'], 1>>;
type Contract516 = Assert<Equal<Parameters<typeof Native0.mapEasingToNativeEasing>['length'], 2>>;
type Contract517 = Assert<Equal<Parameters<typeof Native0.mapValue>['length'], 3 | 4>>;
type Contract518 = Assert<
	Equal<keyof Pick<typeof Native0.maxGeneratorDuration, PublishedKeys157>, PublishedKeys157>
>;
type Contract519 = Assert<Equal<Parameters<typeof Native0.measurePageBox>['length'], 2 | 3>>;
type Contract520 = Assert<Equal<Parameters<typeof Native0.measureViewportBox>['length'], 1 | 2>>;
type Contract521 = Assert<
	Equal<keyof Pick<typeof Native0.microtask, PublishedKeys58>, PublishedKeys58>
>;
type Contract522 = Assert<Equal<Parameters<typeof Native0.mix>['length'], 3>>;
type Contract523 = Assert<Equal<Parameters<typeof Native0.mixArray>['length'], 2>>;
type Contract524 = Assert<Equal<Parameters<typeof Native0.mixColor>['length'], 2>>;
type Contract525 = Assert<Equal<Parameters<typeof Native0.mixComplex>['length'], 2>>;
type Contract526 = Assert<Equal<Parameters<typeof Native0.mixImmediate>['length'], 2>>;
type Contract527 = Assert<Equal<Parameters<typeof Native0.mixLinearColor>['length'], 3>>;
type Contract528 = Assert<Equal<Parameters<typeof Native0.mixNumber>['length'], 3>>;
type Contract529 = Assert<Equal<Parameters<typeof Native0.mixObject>['length'], 2>>;
type Contract530 = Assert<Equal<Parameters<typeof Native0.mixValues>['length'], 6>>;
type Contract531 = Assert<Equal<Parameters<typeof Native0.mixVisibility>['length'], 2>>;
type Contract532 = Assert<Equal<Parameters<typeof Native0.motionValue>['length'], 1 | 2>>;
type Contract533 = Assert<Equal<Parameters<typeof Native0.nodeGroup>['length'], 0>>;
type Contract534 = Assert<
	Equal<keyof Pick<typeof Native0.number, PublishedKeys152>, PublishedKeys152>
>;
type Contract535 = Assert<
	Equal<keyof Pick<typeof Native0.numberValueTypes, PublishedKeys5>, PublishedKeys5>
>;
type Contract536 = Assert<Equal<Parameters<typeof Native0.observeTimeline>['length'], 2>>;
type Contract537 = Assert<
	Equal<keyof Pick<typeof Native0.optimizedAppearDataId, PublishedKeys6>, PublishedKeys6>
>;
type Contract538 = Assert<
	Equal<Parameters<typeof Native0.parseAnimateLayoutArgs>['length'], 1 | 2 | 3>
>;
type Contract539 = Assert<Equal<Parameters<typeof Native0.parseCSSVariable>['length'], 1>>;
type Contract540 = Assert<Equal<Parameters<typeof Native0.parseValueFromTransform>['length'], 2>>;
type Contract541 = Assert<
	Equal<keyof Pick<typeof Native0.percent, PublishedKeys152>, PublishedKeys152>
>;
type Contract542 = Assert<Equal<Parameters<typeof Native0.pixelsToPercent>['length'], 2>>;
type Contract543 = Assert<
	Equal<keyof Pick<typeof Native0.positionalKeys, PublishedKeys151>, PublishedKeys151>
>;
type Contract544 = Assert<
	Equal<keyof Pick<typeof Native0.prefersReducedMotion, PublishedKeys153>, PublishedKeys153>
>;
type Contract545 = Assert<Equal<Parameters<typeof Native0.press>['length'], 2 | 3>>;
type Contract546 = Assert<
	Equal<keyof Pick<typeof Native0.progressPercentage, PublishedKeys152>, PublishedKeys152>
>;
type Contract547 = Assert<Equal<Parameters<typeof Native0.propEffect>['length'], 2>>;
type Contract548 = Assert<Equal<Parameters<typeof Native0.propagateDirtyNodes>['length'], 1>>;
type Contract549 = Assert<Equal<keyof Pick<typeof Native0.px, PublishedKeys152>, PublishedKeys152>>;
type Contract550 = Assert<Equal<Parameters<typeof Native0.readTransformValue>['length'], 2>>;
type Contract551 = Assert<Equal<Parameters<typeof Native0.recordStats>['length'], 0>>;
type Contract552 = Assert<
	Equal<Parameters<typeof Native0.removeAxisDelta>['length'], 1 | 2 | 3 | 4 | 5 | 6 | 7>
>;
type Contract553 = Assert<
	Equal<Parameters<typeof Native0.removeAxisTransforms>['length'], 3 | 4 | 5>
>;
type Contract554 = Assert<
	Equal<Parameters<typeof Native0.removeBoxTransforms>['length'], 2 | 3 | 4>
>;
type Contract555 = Assert<Equal<Parameters<typeof Native0.removeEffect>['length'], 1>>;
type Contract556 = Assert<Equal<Parameters<typeof Native0.removePointDelta>['length'], 4 | 5>>;
type Contract557 = Assert<Equal<Parameters<typeof Native0.renderHTML>['length'], 2 | 3 | 4>>;
type Contract558 = Assert<Equal<Parameters<typeof Native0.renderSVG>['length'], 2 | 3 | 4>>;
type Contract559 = Assert<Equal<Parameters<typeof Native0.resize>['length'], 2>>;
type Contract560 = Assert<Equal<Parameters<typeof Native0.resolveElements>['length'], 1 | 2 | 3>>;
type Contract561 = Assert<Equal<Parameters<typeof Native0.resolveTransition>['length'], 1 | 2>>;
type Contract562 = Assert<Equal<Parameters<typeof Native0.resolveVariant>['length'], 1 | 2 | 3>>;
type Contract563 = Assert<
	Equal<Parameters<typeof Native0.resolveVariantFromProps>['length'], 1 | 2 | 3 | 4>
>;
type Contract564 = Assert<
	Equal<keyof Pick<typeof Native0.rgbUnit, PublishedKeys152>, PublishedKeys152>
>;
type Contract565 = Assert<
	Equal<keyof Pick<typeof Native0.rgba, PublishedKeys152>, PublishedKeys152>
>;
type Contract566 = Assert<
	Equal<keyof Pick<typeof Native0.rootProjectionNode, PublishedKeys153>, PublishedKeys153>
>;
type Contract567 = Assert<
	Equal<keyof Pick<typeof Native0.scale, PublishedKeys158>, PublishedKeys158>
>;
type Contract568 = Assert<
	Equal<keyof Pick<typeof Native0.scaleCorrectors, PublishedKeys5>, PublishedKeys5>
>;
type Contract569 = Assert<Equal<Parameters<typeof Native0.scalePoint>['length'], 3>>;
type Contract570 = Assert<
	Equal<Parameters<typeof Native0.scrapeHTMLMotionValuesFromProps>['length'], 2 | 3>
>;
type Contract571 = Assert<
	Equal<Parameters<typeof Native0.scrapeSVGMotionValuesFromProps>['length'], 2 | 3>
>;
type Contract572 = Assert<Equal<Parameters<typeof Native0.setDragLock>['length'], 1>>;
type Contract573 = Assert<Equal<Parameters<typeof Native0.setFeatureDefinitions>['length'], 1>>;
type Contract574 = Assert<Equal<Parameters<typeof Native0.setStyle>['length'], 3>>;
type Contract575 = Assert<Equal<Parameters<typeof Native0.setTarget>['length'], 2>>;
type Contract576 = Assert<Equal<Parameters<typeof Native0.spring>['length'], 0 | 1 | 2>>;
type Contract577 = Assert<Equal<Parameters<typeof Native0.springValue>['length'], 1 | 2>>;
type Contract578 = Assert<Equal<Parameters<typeof Native0.stagger>['length'], 0 | 1 | 2>>;
type Contract579 = Assert<
	Equal<Parameters<typeof Native0.startWaapiAnimation>['length'], 3 | 4 | 5>
>;
type Contract580 = Assert<
	Equal<keyof Pick<typeof Native0.statsBuffer, PublishedKeys49>, PublishedKeys49>
>;
type Contract581 = Assert<Equal<Parameters<typeof Native0.styleEffect>['length'], 2>>;
type Contract582 = Assert<
	Equal<keyof Pick<typeof Native0.supportedWaapiEasing, PublishedKeys159>, PublishedKeys159>
>;
type Contract583 = Assert<Equal<Parameters<typeof Native0.supportsBrowserAnimation>['length'], 1>>;
type Contract584 = Assert<
	Equal<keyof Pick<typeof Native0.supportsFlags, PublishedKeys68>, PublishedKeys68>
>;
type Contract585 = Assert<Equal<Parameters<typeof Native0.supportsLinearEasing>['length'], 0>>;
type Contract586 = Assert<Equal<Parameters<typeof Native0.supportsPartialKeyframes>['length'], 0>>;
type Contract587 = Assert<Equal<Parameters<typeof Native0.supportsScrollTimeline>['length'], 0>>;
type Contract588 = Assert<Equal<Parameters<typeof Native0.supportsViewTimeline>['length'], 0>>;
type Contract589 = Assert<Equal<Parameters<typeof Native0.svgEffect>['length'], 2>>;
type Contract590 = Assert<Equal<keyof Pick<typeof Native0.sync, PublishedKeys58>, PublishedKeys58>>;
type Contract591 = Assert<Equal<Parameters<typeof Native0.testValueType>['length'], 1>>;
type Contract592 = Assert<
	Equal<keyof Pick<typeof Native0.time, PublishedKeys160>, PublishedKeys160>
>;
type Contract593 = Assert<Equal<Parameters<typeof Native0.transform>['length'], 2 | 3>>;
type Contract594 = Assert<
	Equal<Parameters<typeof Native0.transformAxis>['length'], 1 | 2 | 3 | 4 | 5>
>;
type Contract595 = Assert<Equal<Parameters<typeof Native0.transformBox>['length'], 2 | 3>>;
type Contract596 = Assert<Equal<Parameters<typeof Native0.transformBoxPoints>['length'], 1 | 2>>;
type Contract597 = Assert<
	Equal<keyof Pick<typeof Native0.transformPropOrder, PublishedKeys11>, PublishedKeys11>
>;
type Contract598 = Assert<
	Equal<keyof Pick<typeof Native0.transformProps, PublishedKeys151>, PublishedKeys151>
>;
type Contract599 = Assert<Equal<Parameters<typeof Native0.transformValue>['length'], 1>>;
type Contract600 = Assert<
	Equal<keyof Pick<typeof Native0.transformValueTypes, PublishedKeys5>, PublishedKeys5>
>;
type Contract601 = Assert<Equal<Parameters<typeof Native0.translateAxis>['length'], 2>>;
type Contract602 = Assert<
	Equal<Parameters<typeof Native0.updateMotionValuesFromProps>['length'], 3>
>;
type Contract603 = Assert<
	Equal<keyof Pick<typeof Native0.variantPriorityOrder, PublishedKeys11>, PublishedKeys11>
>;
type Contract604 = Assert<
	Equal<keyof Pick<typeof Native0.variantProps, PublishedKeys11>, PublishedKeys11>
>;
type Contract605 = Assert<Equal<keyof Pick<typeof Native0.vh, PublishedKeys152>, PublishedKeys152>>;
type Contract606 = Assert<Equal<keyof Pick<typeof Native0.vw, PublishedKeys152>, PublishedKeys152>>;
type Contract607 = Assert<Equal<keyof Pick<Native0.Axis, PublishedKeys161>, PublishedKeys161>>;
type Contract608 = Assert<Equal<keyof Pick<Native0.AxisDelta, PublishedKeys162>, PublishedKeys162>>;
type Contract609 = Assert<
	Equal<keyof Pick<Native0.BezierDefinition, PublishedKeys163>, PublishedKeys163>
>;
type Contract610 = Assert<
	Equal<keyof Pick<Native0.BoundingBox, PublishedKeys164>, PublishedKeys164>
>;
type Contract611 = Assert<Equal<keyof Pick<Native0.Box, PublishedKeys105>, PublishedKeys105>>;
type Contract612 = Assert<Equal<keyof Pick<Native0.Delta, PublishedKeys105>, PublishedKeys105>>;
type Contract613 = Assert<Equal<Parameters<Native0.DevMessage>['length'], 2 | 3>>;
type Contract614 = Assert<Equal<keyof Pick<Native0.Direction, PublishedKeys6>, PublishedKeys6>>;
type Contract615 = Assert<Equal<keyof Native0.Easing, never>>;
type Contract616 = Assert<
	Equal<keyof Pick<Native0.EasingDefinition, PublishedKeys44>, PublishedKeys44>
>;
type Contract617 = Assert<Equal<Parameters<Native0.EasingFunction>['length'], 1>>;
type Contract618 = Assert<Equal<Parameters<Native0.EasingModifier>['length'], 1>>;
type Contract619 = Assert<Equal<keyof Pick<Native0.Point, PublishedKeys105>, PublishedKeys105>>;
type Contract620 = Assert<
	Equal<keyof Pick<typeof Native0.SubscriptionManager, PublishedKeys1>, PublishedKeys1>
>;
type Contract621 = Assert<Equal<Parameters<Native0.TransformPoint>['length'], 1>>;
type Contract622 = Assert<Equal<Parameters<typeof Native0.addUniqueItem>['length'], 2>>;
type Contract623 = Assert<Equal<Parameters<typeof Native0.anticipate>['length'], 1>>;
type Contract624 = Assert<Equal<Parameters<typeof Native0.backIn>['length'], 1>>;
type Contract625 = Assert<Equal<Parameters<typeof Native0.backInOut>['length'], 1>>;
type Contract626 = Assert<Equal<Parameters<typeof Native0.backOut>['length'], 1>>;
type Contract627 = Assert<Equal<Parameters<typeof Native0.circIn>['length'], 1>>;
type Contract628 = Assert<Equal<Parameters<typeof Native0.circInOut>['length'], 1>>;
type Contract629 = Assert<Equal<Parameters<typeof Native0.circOut>['length'], 1>>;
type Contract630 = Assert<Equal<Parameters<typeof Native0.clamp>['length'], 3>>;
type Contract631 = Assert<Equal<Parameters<typeof Native0.cubicBezier>['length'], 4>>;
type Contract632 = Assert<Equal<Parameters<typeof Native0.easeIn>['length'], 1>>;
type Contract633 = Assert<Equal<Parameters<typeof Native0.easeInOut>['length'], 1>>;
type Contract634 = Assert<Equal<Parameters<typeof Native0.easeOut>['length'], 1>>;
type Contract635 = Assert<
	Equal<Parameters<typeof Native0.easingDefinitionToFunction>['length'], 1>
>;
type Contract636 = Assert<Equal<Parameters<typeof Native0.getEasingForSegment>['length'], 2>>;
type Contract637 = Assert<Equal<Parameters<typeof Native0.hasWarned>['length'], 1>>;
type Contract638 = Assert<Equal<Parameters<typeof Native0.invariant>['length'], 2 | 3>>;
type Contract639 = Assert<Equal<Parameters<typeof Native0.isBezierDefinition>['length'], 1>>;
type Contract640 = Assert<Equal<Parameters<typeof Native0.isEasingArray>['length'], 1>>;
type Contract641 = Assert<Equal<Parameters<typeof Native0.isNumericalString>['length'], 1>>;
type Contract642 = Assert<Equal<Parameters<typeof Native0.isObject>['length'], 1>>;
type Contract643 = Assert<Equal<Parameters<typeof Native0.isZeroValueString>['length'], 1>>;
type Contract644 = Assert<Equal<Parameters<typeof Native0.memo>['length'], 1>>;
type Contract645 = Assert<Equal<Parameters<typeof Native0.millisecondsToSeconds>['length'], 1>>;
type Contract646 = Assert<Equal<Parameters<typeof Native0.mirrorEasing>['length'], 1>>;
type Contract647 = Assert<Equal<Parameters<typeof Native0.moveItem>['length'], 3>>;
type Contract648 = Assert<Equal<Parameters<typeof Native0.noop>['length'], 1>>;
type Contract649 = Assert<Equal<Parameters<typeof Native0.pipe>['length'], number>>;
type Contract650 = Assert<Equal<Parameters<typeof Native0.progress>['length'], 3>>;
type Contract651 = Assert<Equal<Parameters<typeof Native0.removeItem>['length'], 2>>;
type Contract652 = Assert<Equal<Parameters<typeof Native0.reverseEasing>['length'], 1>>;
type Contract653 = Assert<Equal<Parameters<typeof Native0.secondsToMilliseconds>['length'], 1>>;
type Contract654 = Assert<Equal<Parameters<typeof Native0.steps>['length'], 1 | 2>>;
type Contract655 = Assert<Equal<Parameters<typeof Native0.velocityPerSecond>['length'], 2>>;
type Contract656 = Assert<Equal<Parameters<typeof Native0.warnOnce>['length'], 2 | 3>>;
type Contract657 = Assert<Equal<Parameters<typeof Native0.warning>['length'], 2 | 3>>;
type Contract658 = Assert<Equal<Parameters<typeof Native0.wrap>['length'], 3>>;
