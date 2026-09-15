/** @jsxImportSource octane */
// Consumer assertions derived from the pinned npm declarations.
// Every published export participates in a consumer assertion against the pinned npm types.
// Property presence and callable arity complement the recursive opacity audit,
// the complete upstream type suite, and the handwritten inference/negative examples.
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
import type * as Native0 from '@octanejs/motion';
import type * as Native1 from '@octanejs/motion/react-m';

type SharedKeys0 = 'features' | 'strict';
type SharedKeys1 =
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
	| 'baselineSource'
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
	| 'container'
	| 'containerName'
	| 'containerType'
	| 'content'
	| 'contentVisibility'
	| 'counterIncrement'
	| 'counterReset'
	| 'counterSet'
	| 'cssFloat'
	| 'cssText'
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
	| 'height'
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
	| 'marker'
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
	| 'webkitUserSelect'
	| 'whiteSpace'
	| 'whiteSpaceCollapse'
	| 'widows'
	| 'width'
	| 'willChange'
	| 'wordBreak'
	| 'wordWrap'
	| 'zIndex'
	| 'zoom';
type SharedKeys2 =
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
	| 'colorRendering'
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
	| 'glyphOrientationVertical'
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
	| 'mode'
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
type SharedKeys3 =
	| 'alignmentBaseline'
	| 'baselineShift'
	| 'clip'
	| 'clipPath'
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
	| 'mask'
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
type SharedKeys4 = 'attrScale' | 'attrX' | 'attrY';
type SharedKeys5 = 'bottom' | 'left' | 'right' | 'top';
type SharedKeys6 = 'originX' | 'originY' | 'originZ';
type SharedKeys7 = 'pathOffset' | 'pathSpacing';
type SharedKeys8 =
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
type SharedKeys9 = 'x' | 'y';
type SharedKeys10 = 'autoplay' | 'driver' | 'elapsed';
type SharedKeys11 = 'bounce' | 'visualDuration';
type SharedKeys12 = 'bounceDamping' | 'bounceStiffness';
type SharedKeys13 = 'damping' | 'mass' | 'stiffness';
type SharedKeys14 = 'delayChildren' | 'staggerChildren' | 'staggerDirection' | 'when';
type SharedKeys15 = 'max' | 'min';
type SharedKeys16 = 'modifyTarget' | 'power' | 'timeConstant';
type SharedKeys17 = 'onPlay' | 'onRepeat' | 'onStop';
type SharedKeys18 = 'repeatDelay' | 'repeatType';
type SharedKeys19 = 'restDelta' | 'restSpeed';
type SharedKeys20 = 'concat' | 'includes' | 'indexOf' | 'lastIndexOf' | 'slice';
type SharedKeys21 =
	'copyWithin' | 'pop' | 'push' | 'reverse' | 'shift' | 'sort' | 'splice' | 'unshift';
type SharedKeys22 = 'entries' | 'forEach' | 'keys';
type SharedKeys23 =
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
type SharedKeys24 =
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
	| 'slot'
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
	| 'title'
	| 'tr'
	| 'track'
	| 'u'
	| 'ul'
	| 'video'
	| 'wbr'
	| 'webview';
type SharedKeys25 = 'big' | 'link' | 'search' | 'small' | 'sub' | 'sup';
type SharedKeys26 = 'delete' | 'has' | typeof Symbol.toStringTag;
type SharedKeys27 =
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
type SharedKeys28 = 'factory' | 'isTransformed';
type SharedKeys29 =
	'attachTimeline' | 'complete' | 'finished' | 'iterationDuration' | 'pause' | 'play' | 'state';
type SharedKeys30 = 'animateChanges' | 'getState' | 'reset' | 'setActive' | 'setAnimateFunction';
type SharedKeys31 =
	'isActive' | 'needsAnimating' | 'prevProp' | 'prevResolvedValues' | 'protectedKeys';
type SharedKeys32 = 'peak' | 'strength';
type SharedKeys33 =
	'postRender' | 'preRender' | 'preUpdate' | 'render' | 'resolveKeyframes' | 'setup' | 'update';
type SharedKeys34 = 'indexes' | 'types';
type SharedKeys35 = 'allowFlatten' | 'element';
type SharedKeys36 = 'allowProjection' | 'enableHardwareAcceleration';
type SharedKeys37 =
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
type SharedKeys38 =
	'onDirectionLock' | 'onDrag' | 'onDragEnd' | 'onDragStart' | 'onDragTransitionEnd';
type SharedKeys39 = 'isProcessing' | 'timestamp';
type SharedKeys40 = 'hue' | 'lightness' | 'saturation';
type SharedKeys41 =
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
type SharedKeys42 = 'projectionDelta' | 'target' | 'treeScale';
type SharedKeys43 = 'clamp' | 'mixer';
type SharedKeys44 = 'calculatedDuration' | 'next';
type SharedKeys45 = 'onBeforeLayoutMeasure' | 'onLayoutMeasure';
type SharedKeys46 = 'calculatedProjections' | 'calculatedTargetDeltas';
type SharedKeys47 = 'hasLayoutChanged' | 'hasRelativeLayoutChanged' | 'layoutDelta';
type SharedKeys48 = 'layoutBox' | 'measuredBox';
type SharedKeys49 = 'isStatic' | 'nonce' | 'reducedMotion' | 'transformPagePoint';
type SharedKeys50 = 'data-framer-appear-id' | 'ignoreStrict' | 'transformTemplate';
type SharedKeys51 = 'onAnimationComplete' | 'onAnimationStart';
type SharedKeys52 = 'onLayoutAnimationComplete' | 'onLayoutAnimationStart';
type SharedKeys53 = 'onHoverEnd' | 'onHoverStart' | 'whileHover';
type SharedKeys54 = 'data-framer-portal-id' | 'layoutCrossfade';
type SharedKeys55 =
	'layoutAnchor' | 'layoutDependency' | 'layoutId' | 'layoutRoot' | 'layoutScroll';
type SharedKeys56 = 'globalTapTarget' | 'onTap' | 'onTapCancel' | 'onTapStart' | 'whileTap';
type SharedKeys57 = 'onPan' | 'onPanEnd' | 'onPanSessionStart' | 'onPanStart';
type SharedKeys58 = 'onViewportEnter' | 'onViewportLeave' | 'viewport' | 'whileInView';
type SharedKeys59 = 'animateVisualElement' | 'interpolateProjection';
type SharedKeys60 = 'animationCancel' | 'animationComplete' | 'animationStart' | 'change';
type SharedKeys61 = 'finalKeyframe' | 'isHandoff' | 'motionValue';
type SharedKeys62 = 'stopPropagation' | 'useGlobalTarget';
type SharedKeys63 =
	'attachResizeListener' | 'checkIsScrollRoot' | 'defaultParent' | 'measureScroll';
type SharedKeys64 =
	| 'alwaysMeasureLayout'
	| 'animationType'
	| 'crossfade'
	| 'initialPromotionConfig'
	| 'visualElement';
type SharedKeys65 = 'blue' | 'green' | 'red';
type SharedKeys66 = 'applyTo' | 'correct' | 'isCSSVariable';
type SharedKeys67 = 'isRoot' | 'phase' | 'wasRoot';
type SharedKeys68 = 'process' | 'schedule';
type SharedKeys69 = 'observe' | 'rangeEnd' | 'rangeStart' | 'timeline';
type SharedKeys70 = 'enter' | 'new' | 'old';
type SharedKeys71 =
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
type SharedKeys72 =
	| 'blockInitialAnimation'
	| 'isSVG'
	| 'presenceContext'
	| 'reducedMotionConfig'
	| 'variantParent'
	| 'visualState';
type SharedKeys73 =
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
	| 'onChange'
	| 'prevUpdatedAt'
	| 'removeDependent'
	| 'setCurrent'
	| 'setPrevFrameValue'
	| 'setWithVelocity'
	| 'updateAndNotify'
	| 'updatedAt';
type SharedKeys74 =
	| 'difference'
	| 'intersection'
	| 'isDisjointFrom'
	| 'isSubsetOf'
	| 'isSupersetOf'
	| 'symmetricDifference'
	| 'union';
type SharedKeys75 = 'hasAnimatedSinceResize' | 'hasEverUpdated';
type SharedKeys76 = 'toExponential' | 'toFixed' | 'toPrecision';
type SharedKeys77 =
	'backIn' | 'backOut' | 'circIn' | 'circOut' | 'easeIn' | 'easeInOut' | 'easeOut' | 'linear';
type SharedKeys78 = 'WillChange' | 'instantAnimations' | 'mix' | 'useManualTiming';
type PublishedKeys0 = 'animation' | 'drag' | 'gestures' | 'layout';
type PublishedKeys1 = string;
type PublishedKeys2 = 'children' | 'id' | 'inherit';
type PublishedKeys3 = 'children' | SharedKeys0;
type PublishedKeys4 = 'Provider';
type PublishedKeys5 =
	| 'animation'
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| SharedKeys5
	| 'clear'
	| 'color'
	| 'direction'
	| 'fill'
	| 'filter'
	| 'length'
	| 'margin'
	| 'offset'
	| 'origin'
	| SharedKeys6
	| 'path'
	| 'pathLength'
	| SharedKeys7
	| SharedKeys8
	| 'rotate'
	| 'scale'
	| 'speed'
	| 'transform'
	| 'transformOrigin'
	| 'transition'
	| 'transitionEnd'
	| 'translate'
	| 'values'
	| SharedKeys9
	| 'z'
	| `--${string}`;
type PublishedKeys6 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'onComplete'
	| SharedKeys17
	| 'onUpdate'
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity';
type PublishedKeys7 = 'at' | 'easing' | 'value';
type PublishedKeys8 =
	| 'fill'
	| 'filter'
	| 'length'
	| 'values'
	| 'at'
	| SharedKeys20
	| SharedKeys21
	| SharedKeys22
	| SharedKeys23
	| 'map'
	| 'toLocaleString'
	| 'toString'
	| number
	| typeof Symbol.iterator;
type PublishedKeys9 = 'at';
type PublishedKeys10 =
	| 'fill'
	| 'filter'
	| 'length'
	| 'values'
	| 'at'
	| SharedKeys20
	| SharedKeys21
	| SharedKeys22
	| SharedKeys23
	| 'map'
	| 'toLocaleString'
	| 'toString'
	| number
	| typeof Symbol.iterator
	| '0'
	| '1';
type PublishedKeys11 =
	| 'fill'
	| 'filter'
	| 'length'
	| 'values'
	| 'at'
	| SharedKeys20
	| SharedKeys21
	| SharedKeys22
	| SharedKeys23
	| 'map'
	| 'toLocaleString'
	| 'toString'
	| number
	| typeof Symbol.iterator
	| '0'
	| '1'
	| '2';
type PublishedKeys12 =
	| 'fill'
	| 'filter'
	| 'length'
	| 'values'
	| 'at'
	| SharedKeys20
	| SharedKeys21
	| SharedKeys22
	| SharedKeys23
	| 'map'
	| 'toLocaleString'
	| 'toString'
	| number
	| typeof Symbol.iterator
	| '0';
type PublishedKeys13 = 'map' | SharedKeys24 | SharedKeys25 | 'source' | 'style' | 'time' | 'var';
type PublishedKeys14 = string | number;
type PublishedKeys15 = 'transition' | 'keyframes';
type PublishedKeys16 =
	| 'clear'
	| 'values'
	| SharedKeys22
	| typeof Symbol.iterator
	| SharedKeys26
	| 'get'
	| 'set'
	| 'size';
type PublishedKeys17 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'at'
	| 'reduceMotion';
type PublishedKeys18 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'at';
type PublishedKeys19 =
	| 'length'
	| 'repeat'
	| 'at'
	| SharedKeys20
	| 'toString'
	| number
	| typeof Symbol.iterator
	| SharedKeys25
	| SharedKeys27
	| 'normalize'
	| 'split'
	| 'valueOf';
type PublishedKeys20 = 'at' | 'name';
type PublishedKeys21 =
	| 'delay'
	| 'duration'
	| 'onComplete'
	| 'repeat'
	| SharedKeys18
	| 'skipAnimations'
	| 'reduceMotion'
	| 'defaultTransition';
type PublishedKeys22 = 'toString' | 'valueOf';
type PublishedKeys23 = 'duration' | 'ease' | 'times' | 'keyframes' | SharedKeys28;
type PublishedKeys24 =
	'speed' | 'duration' | 'startTime' | 'time' | SharedKeys29 | 'cancel' | 'stop';
type PublishedKeys25 = 'value' | 'addProjectionMetrics';
type PublishedKeys26 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'onComplete'
	| SharedKeys17
	| 'onUpdate'
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'reduceMotion';
type PublishedKeys27 = 'delay' | SharedKeys14;
type PublishedKeys28 =
	'speed' | 'duration' | 'startTime' | 'time' | SharedKeys29 | 'cancel' | 'stop' | 'then';
type PublishedKeys29 = 'onComplete' | SharedKeys17 | 'onUpdate';
type PublishedKeys30 = 'repeat' | SharedKeys18;
type PublishedKeys31 = 'animations' | 'current';
type PublishedKeys32 = SharedKeys30;
type PublishedKeys33 = SharedKeys31;
type PublishedKeys34 = 'direction' | 'rotate' | SharedKeys32;
type PublishedKeys35 = 'prototype';
type PublishedKeys36 = SharedKeys33 | 'read';
type PublishedKeys37 =
	| 'animation'
	| SharedKeys1
	| SharedKeys3
	| SharedKeys5
	| 'clear'
	| 'color'
	| 'fill'
	| 'filter'
	| 'length'
	| 'margin'
	| 'offset'
	| SharedKeys6
	| SharedKeys8
	| 'rotate'
	| 'scale'
	| 'transform'
	| 'transformOrigin'
	| 'translate'
	| SharedKeys9
	| 'z';
type PublishedKeys38 = 'alpha';
type PublishedKeys39 = 'values' | 'split' | SharedKeys34;
type PublishedKeys40 =
	| 'animation'
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| SharedKeys5
	| 'clear'
	| 'color'
	| 'direction'
	| 'fill'
	| 'filter'
	| 'length'
	| 'margin'
	| 'offset'
	| 'origin'
	| SharedKeys6
	| 'path'
	| 'pathLength'
	| SharedKeys7
	| SharedKeys8
	| 'rotate'
	| 'scale'
	| 'speed'
	| 'transform'
	| 'transformOrigin'
	| 'translate'
	| 'values'
	| SharedKeys9
	| 'z'
	| `--${string}`;
type PublishedKeys41 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'onComplete'
	| SharedKeys17
	| 'onUpdate'
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'keyframes'
	| 'name'
	| SharedKeys35
	| 'pseudoElement';
type PublishedKeys42 = SharedKeys36;
type PublishedKeys43 = SharedKeys16 | SharedKeys19 | 'velocity' | 'keyframes';
type PublishedKeys44 = 'drag' | SharedKeys37 | SharedKeys38;
type PublishedKeys45 = SharedKeys11 | 'duration';
type PublishedKeys46 = 'read' | 'step' | 'test';
type PublishedKeys47 = 'point';
type PublishedKeys48 = 'once' | 'passive';
type PublishedKeys49 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'skipInitialAnimation';
type PublishedKeys50 = 'delta' | SharedKeys39;
type PublishedKeys51 = 'alpha' | SharedKeys40;
type PublishedKeys52 = 'transform' | 'transformOrigin' | 'style' | 'vars';
type PublishedKeys53 =
	| 'layout'
	| 'children'
	| 'id'
	| 'path'
	| SharedKeys41
	| 'animationId'
	| 'depth'
	| 'isPresent'
	| 'latestValues'
	| 'mount'
	| 'nodes'
	| 'options'
	| 'parent'
	| SharedKeys42
	| 'resetTransform'
	| 'root'
	| 'snapshot';
type PublishedKeys54 =
	SharedKeys12 | SharedKeys15 | SharedKeys16 | SharedKeys19 | 'velocity' | 'keyframes';
type PublishedKeys55 = 'transition' | 'shouldPreserveFollowOpacity';
type PublishedKeys56 = 'ease' | SharedKeys43;
type PublishedKeys57 = 'velocity' | 'toString' | SharedKeys44;
type PublishedKeys58 = 'duration' | 'ease' | 'times';
type PublishedKeys59 = SharedKeys45;
type PublishedKeys60 = 'nodes' | SharedKeys46;
type PublishedKeys61 = 'layout' | 'delta' | 'snapshot' | SharedKeys47;
type PublishedKeys62 = 'set' | 'stop' | 'mount' | 'start' | 'subscribe';
type PublishedKeys63 = 'source' | 'animationId' | 'latestValues' | SharedKeys48;
type PublishedKeys64 = 'transition' | 'skipAnimations' | SharedKeys49;
type PublishedKeys65 = 'inherit' | 'values' | 'custom' | SharedKeys50;
type PublishedKeys66 = 'transition' | 'animate' | 'exit' | 'initial' | 'variants';
type PublishedKeys67 = SharedKeys38;
type PublishedKeys68 = 'drag' | SharedKeys37;
type PublishedKeys69 = 'onUpdate' | SharedKeys45 | SharedKeys51 | SharedKeys52;
type PublishedKeys70 = 'whileFocus';
type PublishedKeys71 = SharedKeys53;
type PublishedKeys72 = 'layout' | SharedKeys52 | SharedKeys54 | SharedKeys55;
type PublishedKeys73 =
	| 'drag'
	| 'layout'
	| 'inherit'
	| 'transition'
	| 'values'
	| 'onUpdate'
	| SharedKeys37
	| SharedKeys38
	| SharedKeys45
	| 'custom'
	| SharedKeys50
	| 'animate'
	| 'exit'
	| 'initial'
	| 'variants'
	| SharedKeys51
	| SharedKeys52
	| 'whileFocus'
	| SharedKeys53
	| SharedKeys54
	| SharedKeys55
	| SharedKeys56
	| SharedKeys57
	| SharedKeys58
	| 'propagate';
type PublishedKeys74 = SharedKeys57;
type PublishedKeys75 = SharedKeys56;
type PublishedKeys76 = SharedKeys58;
type PublishedKeys77 = SharedKeys59;
type PublishedKeys78 = SharedKeys60 | 'destroy';
type PublishedKeys79 = 'owner';
type PublishedKeys80 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'onComplete'
	| SharedKeys17
	| 'onUpdate'
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'keyframes'
	| 'name'
	| SharedKeys35
	| 'pseudoElement'
	| SharedKeys61;
type PublishedKeys81 = 'add' | 'dirty' | 'remove';
type PublishedKeys82 = 'current' | 'getProps';
type PublishedKeys83 = 'offset' | 'velocity' | 'point' | 'delta';
type PublishedKeys84 = 'rotate' | SharedKeys9;
type PublishedKeys85 = SharedKeys9;
type PublishedKeys86 = 'once' | 'passive' | SharedKeys62;
type PublishedKeys87 = 'id' | 'isPresent' | 'custom' | 'initial' | 'onExitComplete' | 'register';
type PublishedKeys88 = 'success';
type PublishedKeys89 = 'cancel' | 'currentTime';
type PublishedKeys90 = 'resetTransform' | SharedKeys63;
type PublishedKeys91 =
	'layout' | 'transition' | 'animate' | SharedKeys55 | 'onExitComplete' | SharedKeys64;
type PublishedKeys92 = 'tap';
type PublishedKeys93 = 'alpha' | SharedKeys65;
type PublishedKeys94 = 'toString';
type PublishedKeys95 =
	| SharedKeys2
	| SharedKeys3
	| 'direction'
	| 'fill'
	| 'filter'
	| 'offset'
	| 'origin'
	| 'path'
	| 'pathLength'
	| 'rotate'
	| 'scale'
	| 'speed'
	| 'transform'
	| 'values'
	| SharedKeys9
	| 'z'
	| 'from';
type PublishedKeys96 = SharedKeys4;
type PublishedKeys97 =
	| SharedKeys2
	| SharedKeys3
	| 'direction'
	| 'fill'
	| 'filter'
	| 'offset'
	| 'origin'
	| 'path'
	| 'pathLength'
	| 'rotate'
	| 'scale'
	| 'speed'
	| 'transform'
	| 'values'
	| SharedKeys9
	| 'z';
type PublishedKeys98 = 'pathLength' | SharedKeys7;
type PublishedKeys99 = 'transform' | 'transformOrigin' | 'style' | 'vars' | 'attrs';
type PublishedKeys100 = SharedKeys42;
type PublishedKeys101 = SharedKeys66;
type PublishedKeys102 = 'offset' | 'animationId' | SharedKeys67;
type PublishedKeys103 = SharedKeys11 | SharedKeys13 | 'duration' | SharedKeys19 | 'velocity';
type PublishedKeys104 = 'ease' | 'from' | 'startDelay';
type PublishedKeys105 = 'layoutProjection';
type PublishedKeys106 = 'cancel' | SharedKeys68;
type PublishedKeys107 = SharedKeys69;
type PublishedKeys108 = SharedKeys6;
type PublishedKeys109 = SharedKeys6 | SharedKeys8 | 'rotate' | 'scale' | SharedKeys9 | 'z' | 'skew';
type PublishedKeys110 =
	| 'animation'
	| 'layout'
	| 'inherit'
	| SharedKeys1
	| SharedKeys2
	| SharedKeys3
	| SharedKeys4
	| SharedKeys5
	| 'clear'
	| 'color'
	| 'direction'
	| 'fill'
	| 'filter'
	| 'length'
	| 'margin'
	| 'offset'
	| 'origin'
	| SharedKeys6
	| 'path'
	| 'pathLength'
	| SharedKeys7
	| SharedKeys8
	| 'rotate'
	| 'scale'
	| 'speed'
	| 'transform'
	| 'transformOrigin'
	| 'translate'
	| 'values'
	| SharedKeys9
	| 'z'
	| `--${string}`
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'onComplete'
	| SharedKeys17
	| 'onUpdate'
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'default';
type PublishedKeys111 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'onComplete'
	| SharedKeys17
	| 'onUpdate'
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'keyframes'
	| 'name'
	| SharedKeys35
	| SharedKeys61;
type PublishedKeys112 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'onComplete'
	| SharedKeys17
	| 'onUpdate'
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'keyframes'
	| 'name'
	| SharedKeys35
	| SharedKeys61
	| 'KeyframeResolver';
type PublishedKeys113 = 'color' | 'var' | 'number';
type PublishedKeys114 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| SharedKeys15
	| SharedKeys16
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity';
type PublishedKeys115 =
	'transform' | 'test' | 'default' | 'createTransformer' | 'getAnimatableNone' | 'parse';
type PublishedKeys116 = `--${string}`;
type PublishedKeys117 =
	'length' | 'at' | SharedKeys20 | 'toString' | number | typeof Symbol.iterator;
type PublishedKeys118 = SharedKeys19 | 'velocity';
type PublishedKeys119 = 'keyframes' | 'options';
type PublishedKeys120 =
	| 'inherit'
	| 'path'
	| SharedKeys10
	| SharedKeys11
	| SharedKeys12
	| SharedKeys13
	| 'delay'
	| SharedKeys14
	| 'duration'
	| 'ease'
	| 'from'
	| 'isSync'
	| SharedKeys15
	| SharedKeys16
	| 'onComplete'
	| SharedKeys17
	| 'onUpdate'
	| 'repeat'
	| SharedKeys18
	| SharedKeys19
	| 'skipAnimations'
	| 'startTime'
	| 'times'
	| 'type'
	| 'velocity'
	| 'reduceMotion'
	| 'interrupt';
type PublishedKeys121 = 'layout' | 'exit' | SharedKeys70;
type PublishedKeys122 = 'normalize';
type PublishedKeys123 = 'margin' | 'once' | 'root' | 'amount';
type PublishedKeys124 = 'delay' | 'type' | 'custom' | 'transitionOverride';
type PublishedKeys125 = SharedKeys71;
type PublishedKeys126 = 'skipAnimations' | 'parent' | SharedKeys72 | 'props';
type PublishedKeys127 = 'latestValues' | 'renderState';
type PublishedKeys128 =
	| 'animation'
	| 'get'
	| 'set'
	| 'stop'
	| 'start'
	| 'destroy'
	| 'owner'
	| 'add'
	| 'dirty'
	| SharedKeys73;
type PublishedKeys129 = 'props';
type PublishedKeys130 = 'depth';
type PublishedKeys131 = 'querySelectorAll';
type PublishedKeys132 =
	| 'clear'
	| 'values'
	| SharedKeys22
	| typeof Symbol.iterator
	| SharedKeys26
	| 'size'
	| 'add'
	| SharedKeys74;
type PublishedKeys133 = 'transform' | 'test' | 'parse';
type PublishedKeys134 = 'current';
type PublishedKeys135 = 'transform' | 'test' | 'getAnimatableNone' | 'parse';
type PublishedKeys136 = 'test' | 'createTransformer' | 'getAnimatableNone' | 'parse';
type PublishedKeys137 = SharedKeys75;
type PublishedKeys138 = 'toLocaleString' | 'toString' | 'valueOf' | SharedKeys76;
type PublishedKeys139 = 'transform' | 'test' | 'default' | 'parse';
type PublishedKeys140 = 'ease' | SharedKeys77;
type PublishedKeys141 = 'set' | 'now';
type PublishedKeys142 = SharedKeys26 | 'get' | 'set';
type PublishedKeys143 = SharedKeys15;
type PublishedKeys144 = 'origin' | 'scale' | 'translate' | 'originPoint';
type PublishedKeys145 =
	| 'filter'
	| 'length'
	| 'values'
	| 'at'
	| SharedKeys20
	| SharedKeys22
	| SharedKeys23
	| 'map'
	| 'toLocaleString'
	| 'toString'
	| number
	| typeof Symbol.iterator
	| '0'
	| '1'
	| '2'
	| '3';
type PublishedKeys146 = SharedKeys5;
type PublishedKeys147 = 'skipAnimations' | SharedKeys78;

type Contract0 = Assert<Equal<Parameters<typeof Native0.AnimatePresence>['length'], 2>>;
type Contract1 = Assert<Equal<Parameters<typeof Native0.LayoutGroup>['length'], 2>>;
type Contract2 = Assert<Equal<Parameters<typeof Native0.MotionConfig>['length'], 2>>;
type Contract3 = Assert<Equal<Parameters<typeof Native0.LazyMotion>['length'], 2>>;
type Contract4 = Assert<Equal<Parameters<Native0.MotionComponent>['length'], 2>>;
type Contract5 = Assert<
	Equal<keyof Pick<typeof Native0.domAnimation, PublishedKeys0>, PublishedKeys0>
>;
type Contract6 = Assert<Equal<keyof Pick<typeof Native0.domMax, PublishedKeys0>, PublishedKeys0>>;
type Contract7 = Assert<Equal<keyof Pick<Native0.MotionProxy, PublishedKeys1>, PublishedKeys1>>;
type Contract8 = Assert<Equal<keyof Pick<typeof Native0.motion, PublishedKeys1>, PublishedKeys1>>;
type Contract9 = Assert<Equal<keyof Pick<typeof Native0.m, PublishedKeys1>, PublishedKeys1>>;
type Contract10 = Assert<
	Equal<keyof Pick<Native0.LayoutGroupProps, PublishedKeys2>, PublishedKeys2>
>;
type Contract11 = Assert<Equal<keyof Native0.LazyMotionFeatures, never>>;
type Contract12 = Assert<
	Equal<keyof Pick<Native0.LazyMotionProps, PublishedKeys3>, PublishedKeys3>
>;
type Contract13 = Assert<Equal<Parameters<typeof Native0.useAnimate>['length'], 0>>;
type Contract14 = Assert<Equal<Parameters<typeof Native0.useMotionValue>['length'], 1>>;
type Contract15 = Assert<Equal<Parameters<typeof Native0.useScroll>['length'], 0 | 1>>;
type Contract16 = Assert<Equal<Parameters<typeof Native0.useSpring>['length'], 1 | 2>>;
type Contract17 = Assert<Equal<Parameters<typeof Native0.useMotionValueEvent>['length'], 3>>;
type Contract18 = Assert<Equal<Parameters<typeof Native0.useReducedMotion>['length'], 0>>;
type Contract19 = Assert<
	Equal<keyof Pick<typeof Native0.LayoutGroupContext, PublishedKeys4>, PublishedKeys4>
>;
type Contract20 = Assert<
	Equal<keyof Pick<typeof Native0.LazyMotionContext, PublishedKeys4>, PublishedKeys4>
>;
type Contract21 = Assert<
	Equal<keyof Pick<typeof Native0.MotionConfigContext, PublishedKeys4>, PublishedKeys4>
>;
type Contract22 = Assert<
	Equal<keyof Pick<typeof Native0.VariantContext, PublishedKeys4>, PublishedKeys4>
>;
type Contract23 = Assert<
	Equal<keyof Pick<typeof Native0.StaggerContext, PublishedKeys4>, PublishedKeys4>
>;
type Contract24 = Assert<
	Equal<keyof Pick<Native0.TargetAndTransition, PublishedKeys5>, PublishedKeys5>
>;
type Contract25 = Assert<Equal<keyof Pick<Native0.Transition, PublishedKeys6>, PublishedKeys6>>;
type Contract26 = Assert<Equal<Parameters<Native0.DelayedFunction>['length'], 1>>;
type Contract27 = Assert<Equal<Parameters<typeof Native0.delay>['length'], 2>>;
type Contract28 = Assert<
	Equal<keyof Pick<Native0.AbsoluteKeyframe, PublishedKeys7>, PublishedKeys7>
>;
type Contract29 = Assert<
	Equal<keyof Pick<Native0.AnimationSequence, PublishedKeys8>, PublishedKeys8>
>;
type Contract30 = Assert<Equal<keyof Pick<Native0.At, PublishedKeys9>, PublishedKeys9>>;
type Contract31 = Assert<Equal<keyof Pick<Native0.DOMSegment, PublishedKeys10>, PublishedKeys10>>;
type Contract32 = Assert<
	Equal<keyof Pick<Native0.DOMSegmentWithTransition, PublishedKeys11>, PublishedKeys11>
>;
type Contract33 = Assert<
	Equal<keyof Pick<Native0.FunctionSegment, PublishedKeys12>, PublishedKeys12>
>;
type Contract34 = Assert<Equal<keyof Pick<Native0.HTMLElements, PublishedKeys13>, PublishedKeys13>>;
type Contract35 = Assert<
	Equal<keyof Pick<Native0.MotionValueSegment, PublishedKeys10>, PublishedKeys10>
>;
type Contract36 = Assert<
	Equal<keyof Pick<Native0.MotionValueSegmentWithTransition, PublishedKeys11>, PublishedKeys11>
>;
type Contract37 = Assert<
	Equal<keyof Pick<Native0.ObjectSegment, PublishedKeys10>, PublishedKeys10>
>;
type Contract38 = Assert<
	Equal<keyof Pick<Native0.ObjectSegmentWithTransition, PublishedKeys11>, PublishedKeys11>
>;
type Contract39 = Assert<
	Equal<keyof Pick<Native0.ObjectTarget<{ sample: string }>, PublishedKeys14>, PublishedKeys14>
>;
type Contract40 = Assert<
	Equal<keyof Pick<Native0.ResolvedAnimationDefinition, PublishedKeys15>, PublishedKeys15>
>;
type Contract41 = Assert<
	Equal<keyof Pick<Native0.ResolvedAnimationDefinitions, PublishedKeys16>, PublishedKeys16>
>;
type Contract42 = Assert<Equal<keyof Pick<Native0.Segment, PublishedKeys9>, PublishedKeys9>>;
type Contract43 = Assert<
	Equal<keyof Pick<Native0.SegmentTransitionOptions, PublishedKeys17>, PublishedKeys17>
>;
type Contract44 = Assert<
	Equal<keyof Pick<Native0.SegmentValueTransitionOptions, PublishedKeys18>, PublishedKeys18>
>;
type Contract45 = Assert<
	Equal<keyof Pick<Native0.SequenceLabel, PublishedKeys19>, PublishedKeys19>
>;
type Contract46 = Assert<
	Equal<keyof Pick<Native0.SequenceLabelWithTime, PublishedKeys20>, PublishedKeys20>
>;
type Contract47 = Assert<Equal<keyof Pick<Native0.SequenceMap, PublishedKeys14>, PublishedKeys14>>;
type Contract48 = Assert<
	Equal<keyof Pick<Native0.SequenceOptions, PublishedKeys21>, PublishedKeys21>
>;
type Contract49 = Assert<Equal<Parameters<Native0.SequenceProgressCallback>['length'], 1>>;
type Contract50 = Assert<Equal<keyof Pick<Native0.SequenceTime, PublishedKeys22>, PublishedKeys22>>;
type Contract51 = Assert<Equal<keyof Pick<Native0.ValueSequence, PublishedKeys8>, PublishedKeys8>>;
type Contract52 = Assert<Equal<Parameters<typeof Native0.animate>['length'], 2 | 3>>;
type Contract53 = Assert<Equal<Parameters<typeof Native0.animateMini>['length'], 2 | 3>>;
type Contract54 = Assert<Equal<Parameters<typeof Native0.createScopedAnimate>['length'], 0 | 1>>;
type Contract55 = Assert<Equal<Parameters<typeof Native0.distance>['length'], 2>>;
type Contract56 = Assert<Equal<Parameters<typeof Native0.distance2D>['length'], 2>>;
type Contract57 = Assert<Equal<Parameters<typeof Native0.inView>['length'], 2 | 3>>;
type Contract58 = Assert<Equal<Parameters<typeof Native0.scroll>['length'], 1 | 2>>;
type Contract59 = Assert<Equal<Parameters<typeof Native0.scrollInfo>['length'], 1 | 2>>;
type Contract60 = Assert<
	Equal<keyof Pick<Native0.AccelerateConfig, PublishedKeys23>, PublishedKeys23>
>;
type Contract61 = Assert<
	Equal<keyof Pick<Native0.AcceptedAnimations, PublishedKeys24>, PublishedKeys24>
>;
type Contract62 = Assert<
	Equal<keyof Pick<Native0.ActiveStatsBuffer, PublishedKeys25>, PublishedKeys25>
>;
type Contract63 = Assert<
	Equal<Parameters<Native0.AddEffectValue<{ sample: string }>>['length'], 4>
>;
type Contract64 = Assert<Equal<Parameters<Native0.AnimateEffect>['length'], 2>>;
type Contract65 = Assert<Equal<keyof Native0.AnimationDefinition, never>>;
type Contract66 = Assert<
	Equal<keyof Pick<Native0.AnimationGeneratorName, PublishedKeys19>, PublishedKeys19>
>;
type Contract67 = Assert<Equal<keyof Native0.AnimationGeneratorType, never>>;
type Contract68 = Assert<Equal<keyof Pick<Native0.AnimationList, PublishedKeys8>, PublishedKeys8>>;
type Contract69 = Assert<
	Equal<keyof Pick<Native0.AnimationOptions, PublishedKeys26>, PublishedKeys26>
>;
type Contract70 = Assert<
	Equal<keyof Pick<Native0.AnimationOrchestrationOptions, PublishedKeys27>, PublishedKeys27>
>;
type Contract71 = Assert<
	Equal<keyof Pick<Native0.AnimationPlaybackControls, PublishedKeys24>, PublishedKeys24>
>;
type Contract72 = Assert<
	Equal<keyof Pick<Native0.AnimationPlaybackControlsWithThen, PublishedKeys28>, PublishedKeys28>
>;
type Contract73 = Assert<
	Equal<
		keyof Pick<Native0.AnimationPlaybackLifecycles<{ sample: string }>, PublishedKeys29>,
		PublishedKeys29
	>
>;
type Contract74 = Assert<
	Equal<keyof Pick<Native0.AnimationPlaybackOptions, PublishedKeys30>, PublishedKeys30>
>;
type Contract75 = Assert<
	Equal<keyof Pick<Native0.AnimationScope, PublishedKeys31>, PublishedKeys31>
>;
type Contract76 = Assert<
	Equal<keyof Pick<Native0.AnimationState, PublishedKeys32>, PublishedKeys32>
>;
type Contract77 = Assert<
	Equal<keyof Pick<Native0.AnimationType, PublishedKeys19>, PublishedKeys19>
>;
type Contract78 = Assert<
	Equal<keyof Pick<Native0.AnimationTypeState, PublishedKeys33>, PublishedKeys33>
>;
type Contract79 = Assert<
	Equal<keyof Pick<Native0.AnyResolvedKeyframe, PublishedKeys22>, PublishedKeys22>
>;
type Contract80 = Assert<Equal<keyof Pick<Native0.ArcOptions, PublishedKeys34>, PublishedKeys34>>;
type Contract81 = Assert<
	Equal<keyof Pick<typeof Native0.AsyncMotionValueAnimation, PublishedKeys35>, PublishedKeys35>
>;
type Contract82 = Assert<Equal<keyof Pick<Native0.Batcher, PublishedKeys36>, PublishedKeys36>>;
type Contract83 = Assert<
	Equal<keyof Pick<Native0.CSSStyleDeclarationWithTransform, PublishedKeys37>, PublishedKeys37>
>;
type Contract84 = Assert<
	Equal<keyof Pick<Native0.CSSVariableName, PublishedKeys19>, PublishedKeys19>
>;
type Contract85 = Assert<
	Equal<keyof Pick<Native0.CSSVariableToken, PublishedKeys19>, PublishedKeys19>
>;
type Contract86 = Assert<Equal<Parameters<Native0.CancelProcess>['length'], 1>>;
type Contract87 = Assert<Equal<keyof Pick<Native0.Color, PublishedKeys38>, PublishedKeys38>>;
type Contract88 = Assert<
	Equal<keyof Pick<Native0.ComplexValueInfo, PublishedKeys39>, PublishedKeys39>
>;
type Contract89 = Assert<Equal<keyof Pick<Native0.ComplexValues, PublishedKeys8>, PublishedKeys8>>;
type Contract90 = Assert<
	Equal<keyof Pick<Native0.DOMKeyframesDefinition, PublishedKeys40>, PublishedKeys40>
>;
type Contract91 = Assert<
	Equal<keyof Pick<typeof Native0.DOMKeyframesResolver, PublishedKeys35>, PublishedKeys35>
>;
type Contract92 = Assert<
	Equal<keyof Pick<Native0.DOMValueAnimationOptions, PublishedKeys41>, PublishedKeys41>
>;
type Contract93 = Assert<
	Equal<keyof Pick<typeof Native0.DOMVisualElement, PublishedKeys35>, PublishedKeys35>
>;
type Contract94 = Assert<
	Equal<keyof Pick<Native0.DOMVisualElementOptions, PublishedKeys42>, PublishedKeys42>
>;
type Contract95 = Assert<Equal<keyof Pick<Native0.DecayOptions, PublishedKeys43>, PublishedKeys43>>;
type Contract96 = Assert<Equal<keyof typeof Native0.DocumentProjectionNode, never>>;
type Contract97 = Assert<Equal<keyof Native0.DragElastic, never>>;
type Contract98 = Assert<Equal<Parameters<Native0.DragHandler>['length'], 2>>;
type Contract99 = Assert<
	Equal<keyof Pick<Native0.DraggableProps, PublishedKeys44>, PublishedKeys44>
>;
type Contract100 = Assert<
	Equal<keyof Pick<Native0.DurationSpringOptions, PublishedKeys45>, PublishedKeys45>
>;
type Contract101 = Assert<
	Equal<Parameters<Native0.DynamicOption<{ sample: string }>>['length'], 2>
>;
type Contract102 = Assert<Equal<Parameters<Native0.Effect>['length'], 2>>;
type Contract103 = Assert<
	Equal<keyof Pick<Native0.EffectKeyframes, PublishedKeys1>, PublishedKeys1>
>;
type Contract104 = Assert<
	Equal<keyof Pick<Native0.EffectOptions<{ sample: string }>, PublishedKeys46>, PublishedKeys46>
>;
type Contract105 = Assert<
	Equal<Parameters<Native0.EffectRead<{ sample: string }>>['length'], 2 | 3>
>;
type Contract106 = Assert<Equal<Parameters<Native0.EffectTest<{ sample: string }>>['length'], 1>>;
type Contract107 = Assert<
	Equal<keyof Pick<Native0.EffectTransition, PublishedKeys1>, PublishedKeys1>
>;
type Contract108 = Assert<Equal<keyof Native0.ElementOrSelector, never>>;
type Contract109 = Assert<Equal<keyof Pick<Native0.EventInfo, PublishedKeys47>, PublishedKeys47>>;
type Contract110 = Assert<
	Equal<keyof Pick<Native0.EventOptions, PublishedKeys48>, PublishedKeys48>
>;
type Contract111 = Assert<
	Equal<keyof Pick<typeof Native0.Feature, PublishedKeys35>, PublishedKeys35>
>;
type Contract112 = Assert<Equal<keyof Native0.FeatureClass, never>>;
type Contract113 = Assert<
	Equal<keyof Pick<typeof Native0.FlatTree, PublishedKeys35>, PublishedKeys35>
>;
type Contract114 = Assert<
	Equal<keyof Pick<Native0.FollowValueOptions, PublishedKeys49>, PublishedKeys49>
>;
type Contract115 = Assert<Equal<keyof Pick<Native0.FrameData, PublishedKeys50>, PublishedKeys50>>;
type Contract116 = Assert<Equal<Parameters<Native0.GeneratorFactory>['length'], 1>>;
type Contract117 = Assert<Equal<Parameters<Native0.GeneratorFactoryFunction>['length'], 1>>;
type Contract118 = Assert<
	Equal<keyof Pick<typeof Native0.GroupAnimation, PublishedKeys35>, PublishedKeys35>
>;
type Contract119 = Assert<
	Equal<keyof Pick<typeof Native0.GroupAnimationWithThen, PublishedKeys35>, PublishedKeys35>
>;
type Contract120 = Assert<
	Equal<keyof Pick<Native0.GroupedAnimations, PublishedKeys8>, PublishedKeys8>
>;
type Contract121 = Assert<Equal<keyof Pick<Native0.HSLA, PublishedKeys51>, PublishedKeys51>>;
type Contract122 = Assert<Equal<keyof typeof Native0.HTMLProjectionNode, never>>;
type Contract123 = Assert<
	Equal<keyof Pick<Native0.HTMLRenderState, PublishedKeys52>, PublishedKeys52>
>;
type Contract124 = Assert<
	Equal<keyof Pick<typeof Native0.HTMLVisualElement, PublishedKeys35>, PublishedKeys35>
>;
type Contract125 = Assert<Equal<Parameters<Native0.HandoffFunction>['length'], 3>>;
type Contract126 = Assert<
	Equal<keyof Pick<Native0.IProjectionNode, PublishedKeys53>, PublishedKeys53>
>;
type Contract127 = Assert<
	Equal<keyof Pick<Native0.InactiveStatsBuffer, PublishedKeys25>, PublishedKeys25>
>;
type Contract128 = Assert<
	Equal<keyof Pick<Native0.InertiaOptions, PublishedKeys54>, PublishedKeys54>
>;
type Contract129 = Assert<
	Equal<keyof Pick<Native0.InitialPromotionConfig, PublishedKeys55>, PublishedKeys55>
>;
type Contract130 = Assert<
	Equal<
		keyof Pick<Native0.InterpolateOptions<{ sample: string }>, PublishedKeys56>,
		PublishedKeys56
	>
>;
type Contract131 = Assert<
	Equal<keyof Pick<typeof Native0.JSAnimation, PublishedKeys35>, PublishedKeys35>
>;
type Contract132 = Assert<
	Equal<keyof Pick<Native0.KeyframeGenerator<{ sample: string }>, PublishedKeys57>, PublishedKeys57>
>;
type Contract133 = Assert<
	Equal<keyof Pick<Native0.KeyframeOptions, PublishedKeys58>, PublishedKeys58>
>;
type Contract134 = Assert<
	Equal<keyof Pick<typeof Native0.KeyframeResolver, PublishedKeys35>, PublishedKeys35>
>;
type Contract135 = Assert<
	Equal<keyof Pick<typeof Native0.LayoutAnimationBuilder, PublishedKeys35>, PublishedKeys35>
>;
type Contract136 = Assert<
	Equal<keyof Pick<Native0.LayoutEvents, PublishedKeys19>, PublishedKeys19>
>;
type Contract137 = Assert<
	Equal<keyof Pick<Native0.LayoutLifecycles, PublishedKeys59>, PublishedKeys59>
>;
type Contract138 = Assert<
	Equal<keyof Pick<Native0.LayoutProjectionMetrics, PublishedKeys60>, PublishedKeys60>
>;
type Contract139 = Assert<
	Equal<keyof Pick<Native0.LayoutProjectionStats, PublishedKeys60>, PublishedKeys60>
>;
type Contract140 = Assert<
	Equal<keyof Pick<Native0.LayoutUpdateData, PublishedKeys61>, PublishedKeys61>
>;
type Contract141 = Assert<Equal<Parameters<Native0.LayoutUpdateHandler>['length'], 1>>;
type Contract142 = Assert<
	Equal<keyof Pick<Native0.LegacyAnimationControls, PublishedKeys62>, PublishedKeys62>
>;
type Contract143 = Assert<Equal<keyof Pick<Native0.MapInputRange, PublishedKeys8>, PublishedKeys8>>;
type Contract144 = Assert<
	Equal<keyof Pick<Native0.Measurements, PublishedKeys63>, PublishedKeys63>
>;
type Contract145 = Assert<Equal<Parameters<Native0.Mixer<{ sample: string }>>['length'], 1>>;
type Contract146 = Assert<Equal<Parameters<Native0.MixerFactory<{ sample: string }>>['length'], 2>>;
type Contract147 = Assert<
	Equal<keyof Pick<Native0.MotionConfigContextProps, PublishedKeys64>, PublishedKeys64>
>;
type Contract148 = Assert<
	Equal<keyof Pick<Native0.MotionNodeAdvancedOptions, PublishedKeys65>, PublishedKeys65>
>;
type Contract149 = Assert<
	Equal<keyof Pick<Native0.MotionNodeAnimationOptions, PublishedKeys66>, PublishedKeys66>
>;
type Contract150 = Assert<
	Equal<keyof Pick<Native0.MotionNodeDragHandlers, PublishedKeys67>, PublishedKeys67>
>;
type Contract151 = Assert<
	Equal<keyof Pick<Native0.MotionNodeDraggableOptions, PublishedKeys68>, PublishedKeys68>
>;
type Contract152 = Assert<
	Equal<keyof Pick<Native0.MotionNodeEventOptions, PublishedKeys69>, PublishedKeys69>
>;
type Contract153 = Assert<
	Equal<keyof Pick<Native0.MotionNodeFocusHandlers, PublishedKeys70>, PublishedKeys70>
>;
type Contract154 = Assert<
	Equal<keyof Pick<Native0.MotionNodeHoverHandlers, PublishedKeys71>, PublishedKeys71>
>;
type Contract155 = Assert<
	Equal<keyof Pick<Native0.MotionNodeLayoutOptions, PublishedKeys72>, PublishedKeys72>
>;
type Contract156 = Assert<
	Equal<keyof Pick<Native0.MotionNodeOptions, PublishedKeys73>, PublishedKeys73>
>;
type Contract157 = Assert<
	Equal<keyof Pick<Native0.MotionNodePanHandlers, PublishedKeys74>, PublishedKeys74>
>;
type Contract158 = Assert<
	Equal<keyof Pick<Native0.MotionNodeTapHandlers, PublishedKeys75>, PublishedKeys75>
>;
type Contract159 = Assert<
	Equal<keyof Pick<Native0.MotionNodeViewportOptions, PublishedKeys76>, PublishedKeys76>
>;
type Contract160 = Assert<Equal<keyof Pick<Native0.MotionPath, PublishedKeys77>, PublishedKeys77>>;
type Contract161 = Assert<Equal<keyof Pick<Native0.MotionStyle, PublishedKeys14>, PublishedKeys14>>;
type Contract162 = Assert<
	Equal<keyof Pick<typeof Native0.MotionValue, PublishedKeys35>, PublishedKeys35>
>;
type Contract163 = Assert<
	Equal<
		keyof Pick<Native0.MotionValueEventCallbacks<{ sample: string }>, PublishedKeys78>,
		PublishedKeys78
	>
>;
type Contract164 = Assert<
	Equal<keyof Pick<Native0.MotionValueOptions, PublishedKeys79>, PublishedKeys79>
>;
type Contract165 = Assert<
	Equal<keyof Pick<typeof Native0.MotionValueState, PublishedKeys35>, PublishedKeys35>
>;
type Contract166 = Assert<
	Equal<Parameters<Native0.MultiTransformer<{ sample: string }, { sample: string }>>['length'], 1>
>;
type Contract167 = Assert<
	Equal<keyof Pick<typeof Native0.NativeAnimation, PublishedKeys35>, PublishedKeys35>
>;
type Contract168 = Assert<
	Equal<keyof Pick<typeof Native0.NativeAnimationExtended, PublishedKeys35>, PublishedKeys35>
>;
type Contract169 = Assert<
	Equal<keyof Pick<Native0.NativeAnimationOptions, PublishedKeys41>, PublishedKeys41>
>;
type Contract170 = Assert<
	Equal<
		keyof Pick<Native0.NativeAnimationOptionsExtended<number>, PublishedKeys80>,
		PublishedKeys80
	>
>;
type Contract171 = Assert<
	Equal<keyof Pick<typeof Native0.NativeAnimationWrapper, PublishedKeys35>, PublishedKeys35>
>;
type Contract172 = Assert<Equal<keyof Pick<Native0.NodeGroup, PublishedKeys81>, PublishedKeys81>>;
type Contract173 = Assert<
	Equal<keyof Pick<typeof Native0.NodeStack, PublishedKeys35>, PublishedKeys35>
>;
type Contract174 = Assert<Equal<keyof Pick<Native0.NumberMap, PublishedKeys14>, PublishedKeys14>>;
type Contract175 = Assert<
	Equal<keyof Pick<typeof Native0.ObjectVisualElement, PublishedKeys35>, PublishedKeys35>
>;
type Contract176 = Assert<Equal<Parameters<Native0.OnHoverEndEvent>['length'], 1>>;
type Contract177 = Assert<Equal<Parameters<Native0.OnHoverStartEvent>['length'], 2>>;
type Contract178 = Assert<Equal<Parameters<Native0.OnKeyframesResolved<number>>['length'], 3>>;
type Contract179 = Assert<Equal<Parameters<Native0.OnPressEndEvent>['length'], 2>>;
type Contract180 = Assert<Equal<Parameters<Native0.OnPressStartEvent>['length'], 2>>;
type Contract181 = Assert<Equal<keyof Pick<Native0.Owner, PublishedKeys82>, PublishedKeys82>>;
type Contract182 = Assert<Equal<Parameters<Native0.PanHandler>['length'], 2>>;
type Contract183 = Assert<Equal<keyof Pick<Native0.PanInfo, PublishedKeys83>, PublishedKeys83>>;
type Contract184 = Assert<
	Equal<Parameters<Native0.PassiveEffect<{ sample: string }>>['length'], 2>
>;
type Contract185 = Assert<Equal<Parameters<Native0.PathInterpolator>['length'], 1>>;
type Contract186 = Assert<Equal<keyof Pick<Native0.PathState, PublishedKeys84>, PublishedKeys84>>;
type Contract187 = Assert<Equal<keyof Pick<Native0.Phase, PublishedKeys19>, PublishedKeys19>>;
type Contract188 = Assert<Equal<keyof Pick<Native0.Point2D, PublishedKeys85>, PublishedKeys85>>;
type Contract189 = Assert<
	Equal<keyof Pick<Native0.PointerEventOptions, PublishedKeys86>, PublishedKeys86>
>;
type Contract190 = Assert<
	Equal<keyof Pick<Native0.PresenceContextProps, PublishedKeys87>, PublishedKeys87>
>;
type Contract191 = Assert<
	Equal<keyof Pick<Native0.PressGestureInfo, PublishedKeys88>, PublishedKeys88>
>;
type Contract192 = Assert<Equal<Parameters<Native0.Process>['length'], 1>>;
type Contract193 = Assert<
	Equal<keyof Pick<Native0.ProgressTimeline, PublishedKeys89>, PublishedKeys89>
>;
type Contract194 = Assert<
	Equal<keyof Pick<Native0.ProjectionEventName, PublishedKeys19>, PublishedKeys19>
>;
type Contract195 = Assert<
	Equal<
		keyof Pick<Native0.ProjectionNodeConfig<{ sample: string }>, PublishedKeys90>,
		PublishedKeys90
	>
>;
type Contract196 = Assert<
	Equal<keyof Pick<Native0.ProjectionNodeOptions, PublishedKeys91>, PublishedKeys91>
>;
type Contract197 = Assert<
	Equal<keyof Pick<Native0.PropagateOptions, PublishedKeys92>, PublishedKeys92>
>;
type Contract198 = Assert<Equal<keyof Pick<Native0.RGBA, PublishedKeys93>, PublishedKeys93>>;
type Contract199 = Assert<
	Equal<keyof Pick<Native0.ReducedMotionConfig, PublishedKeys19>, PublishedKeys19>
>;
type Contract200 = Assert<Equal<keyof Pick<Native0.RepeatType, PublishedKeys19>, PublishedKeys19>>;
type Contract201 = Assert<
	Equal<keyof Pick<Native0.ResolvedConstraints, PublishedKeys85>, PublishedKeys85>
>;
type Contract202 = Assert<
	Equal<keyof Pick<Native0.ResolvedElastic, PublishedKeys85>, PublishedKeys85>
>;
type Contract203 = Assert<
	Equal<keyof Pick<Native0.ResolvedKeyframes<number>, PublishedKeys8>, PublishedKeys8>
>;
type Contract204 = Assert<
	Equal<keyof Pick<Native0.ResolvedValueKeyframe, PublishedKeys94>, PublishedKeys94>
>;
type Contract205 = Assert<
	Equal<keyof Pick<Native0.ResolvedValues, PublishedKeys14>, PublishedKeys14>
>;
type Contract206 = Assert<
	Equal<keyof Pick<Native0.SVGAttributes, PublishedKeys95>, PublishedKeys95>
>;
type Contract207 = Assert<
	Equal<keyof Pick<Native0.SVGForcedAttrKeyframesDefinition, PublishedKeys96>, PublishedKeys96>
>;
type Contract208 = Assert<
	Equal<keyof Pick<Native0.SVGForcedAttrProperties, PublishedKeys96>, PublishedKeys96>
>;
type Contract209 = Assert<
	Equal<keyof Pick<Native0.SVGForcedAttrTransitions, PublishedKeys96>, PublishedKeys96>
>;
type Contract210 = Assert<
	Equal<keyof Pick<Native0.SVGKeyframesDefinition, PublishedKeys97>, PublishedKeys97>
>;
type Contract211 = Assert<
	Equal<keyof Pick<Native0.SVGPathKeyframesDefinition, PublishedKeys98>, PublishedKeys98>
>;
type Contract212 = Assert<
	Equal<keyof Pick<Native0.SVGPathProperties, PublishedKeys98>, PublishedKeys98>
>;
type Contract213 = Assert<
	Equal<keyof Pick<Native0.SVGPathTransitions, PublishedKeys98>, PublishedKeys98>
>;
type Contract214 = Assert<
	Equal<keyof Pick<Native0.SVGRenderState, PublishedKeys99>, PublishedKeys99>
>;
type Contract215 = Assert<
	Equal<keyof Pick<Native0.SVGTransitions, PublishedKeys97>, PublishedKeys97>
>;
type Contract216 = Assert<
	Equal<keyof Pick<typeof Native0.SVGVisualElement, PublishedKeys35>, PublishedKeys35>
>;
type Contract217 = Assert<
	Equal<keyof Pick<Native0.ScaleCorrectionNode, PublishedKeys100>, PublishedKeys100>
>;
type Contract218 = Assert<Equal<Parameters<Native0.ScaleCorrector>['length'], 2>>;
type Contract219 = Assert<
	Equal<keyof Pick<Native0.ScaleCorrectorDefinition, PublishedKeys101>, PublishedKeys101>
>;
type Contract220 = Assert<
	Equal<keyof Pick<Native0.ScaleCorrectorMap, PublishedKeys14>, PublishedKeys14>
>;
type Contract221 = Assert<Equal<Parameters<Native0.Schedule>['length'], 1 | 2 | 3>>;
type Contract222 = Assert<Equal<Parameters<Native0.ScrapeMotionValuesFromProps>['length'], 2 | 3>>;
type Contract223 = Assert<
	Equal<keyof Pick<Native0.ScrollMeasurements, PublishedKeys102>, PublishedKeys102>
>;
type Contract224 = Assert<
	Equal<keyof Pick<Native0.SelectorCache, PublishedKeys14>, PublishedKeys14>
>;
type Contract225 = Assert<
	Equal<Parameters<Native0.SingleTransformer<{ sample: string }, { sample: string }>>['length'], 1>
>;
type Contract226 = Assert<Equal<keyof Pick<Native0.Spring, PublishedKeys103>, PublishedKeys103>>;
type Contract227 = Assert<
	Equal<keyof Pick<Native0.SpringOptions, PublishedKeys103>, PublishedKeys103>
>;
type Contract228 = Assert<
	Equal<keyof Pick<Native0.StaggerOptions, PublishedKeys104>, PublishedKeys104>
>;
type Contract229 = Assert<
	Equal<keyof Pick<Native0.StaggerOrigin, PublishedKeys22>, PublishedKeys22>
>;
type Contract230 = Assert<Equal<Parameters<Native0.StartAnimation>['length'], 1>>;
type Contract231 = Assert<
	Equal<keyof Pick<Native0.StatsRecording, PublishedKeys105>, PublishedKeys105>
>;
type Contract232 = Assert<Equal<keyof Pick<Native0.Step, PublishedKeys106>, PublishedKeys106>>;
type Contract233 = Assert<Equal<keyof Pick<Native0.StepId, PublishedKeys19>, PublishedKeys19>>;
type Contract234 = Assert<Equal<keyof Pick<Native0.Steps, PublishedKeys36>, PublishedKeys36>>;
type Contract235 = Assert<
	Equal<keyof Pick<Native0.StyleKeyframesDefinition, PublishedKeys37>, PublishedKeys37>
>;
type Contract236 = Assert<
	Equal<keyof Pick<Native0.StyleTransitions, PublishedKeys37>, PublishedKeys37>
>;
type Contract237 = Assert<Equal<Parameters<Native0.Subscriber<{ sample: string }>>['length'], 1>>;
type Contract238 = Assert<Equal<keyof Pick<Native0.TapHandlers, PublishedKeys75>, PublishedKeys75>>;
type Contract239 = Assert<Equal<keyof Pick<Native0.TapInfo, PublishedKeys47>, PublishedKeys47>>;
type Contract240 = Assert<Equal<keyof Pick<Native0.Target, PublishedKeys40>, PublishedKeys40>>;
type Contract241 = Assert<Equal<Parameters<Native0.TargetResolver>['length'], 3>>;
type Contract242 = Assert<
	Equal<keyof Pick<Native0.TimelineWithFallback, PublishedKeys107>, PublishedKeys107>
>;
type Contract243 = Assert<
	Equal<keyof Pick<Native0.TransformInputRange, PublishedKeys8>, PublishedKeys8>
>;
type Contract244 = Assert<
	Equal<keyof Pick<Native0.TransformOptions<{ sample: string }>, PublishedKeys56>, PublishedKeys56>
>;
type Contract245 = Assert<
	Equal<keyof Pick<Native0.TransformOrigin, PublishedKeys108>, PublishedKeys108>
>;
type Contract246 = Assert<
	Equal<keyof Pick<Native0.TransformProperties, PublishedKeys109>, PublishedKeys109>
>;
type Contract247 = Assert<Equal<Parameters<Native0.TransformTemplate>['length'], 2>>;
type Contract248 = Assert<Equal<Parameters<Native0.Transformer>['length'], 1>>;
type Contract249 = Assert<
	Equal<
		keyof Pick<Native0.TransitionWithValueOverrides<{ sample: string }>, PublishedKeys110>,
		PublishedKeys110
	>
>;
type Contract250 = Assert<Equal<keyof Pick<Native0.Tween, PublishedKeys58>, PublishedKeys58>>;
type Contract251 = Assert<
	Equal<keyof Pick<Native0.UnresolvedKeyframes<number>, PublishedKeys8>, PublishedKeys8>
>;
type Contract252 = Assert<Equal<keyof Native0.UnresolvedValueKeyframe, never>>;
type Contract253 = Assert<Equal<Parameters<Native0.UseRenderState>['length'], 0>>;
type Contract254 = Assert<
	Equal<keyof Pick<Native0.ValueAnimationOptions, PublishedKeys111>, PublishedKeys111>
>;
type Contract255 = Assert<
	Equal<
		keyof Pick<Native0.ValueAnimationOptionsWithRenderContext, PublishedKeys112>,
		PublishedKeys112
	>
>;
type Contract256 = Assert<
	Equal<keyof Pick<Native0.ValueAnimationTransition, PublishedKeys6>, PublishedKeys6>
>;
type Contract257 = Assert<
	Equal<keyof Pick<Native0.ValueAnimationWithDynamicDelay, PublishedKeys6>, PublishedKeys6>
>;
type Contract258 = Assert<
	Equal<keyof Pick<Native0.ValueIndexes, PublishedKeys113>, PublishedKeys113>
>;
type Contract259 = Assert<
	Equal<keyof Pick<Native0.ValueKeyframe, PublishedKeys22>, PublishedKeys22>
>;
type Contract260 = Assert<
	Equal<keyof Pick<Native0.ValueKeyframesDefinition, PublishedKeys94>, PublishedKeys94>
>;
type Contract261 = Assert<
	Equal<Parameters<Native0.ValueTransformer<{ sample: string }, { sample: string }>>['length'], 1>
>;
type Contract262 = Assert<
	Equal<keyof Pick<Native0.ValueTransition, PublishedKeys114>, PublishedKeys114>
>;
type Contract263 = Assert<Equal<keyof Pick<Native0.ValueType, PublishedKeys115>, PublishedKeys115>>;
type Contract264 = Assert<
	Equal<keyof Pick<Native0.ValueTypeMap, PublishedKeys14>, PublishedKeys14>
>;
type Contract265 = Assert<
	Equal<keyof Pick<Native0.VariableKeyframesDefinition, PublishedKeys116>, PublishedKeys116>
>;
type Contract266 = Assert<
	Equal<keyof Pick<Native0.VariableTransitions, PublishedKeys116>, PublishedKeys116>
>;
type Contract267 = Assert<Equal<keyof Native0.Variant, never>>;
type Contract268 = Assert<
	Equal<keyof Pick<Native0.VariantLabels, PublishedKeys117>, PublishedKeys117>
>;
type Contract269 = Assert<Equal<keyof Pick<Native0.Variants, PublishedKeys14>, PublishedKeys14>>;
type Contract270 = Assert<
	Equal<keyof Pick<Native0.VelocityOptions, PublishedKeys118>, PublishedKeys118>
>;
type Contract271 = Assert<
	Equal<keyof Pick<Native0.ViewTransitionAnimationDefinition, PublishedKeys119>, PublishedKeys119>
>;
type Contract272 = Assert<
	Equal<keyof Pick<typeof Native0.ViewTransitionBuilder, PublishedKeys35>, PublishedKeys35>
>;
type Contract273 = Assert<
	Equal<keyof Pick<Native0.ViewTransitionOptions, PublishedKeys120>, PublishedKeys120>
>;
type Contract274 = Assert<
	Equal<keyof Pick<Native0.ViewTransitionTarget, PublishedKeys121>, PublishedKeys121>
>;
type Contract275 = Assert<
	Equal<keyof Pick<Native0.ViewTransitionTargetDefinition, PublishedKeys122>, PublishedKeys122>
>;
type Contract276 = Assert<Equal<Parameters<Native0.ViewportEventHandler>['length'], 1>>;
type Contract277 = Assert<
	Equal<keyof Pick<Native0.ViewportOptions, PublishedKeys123>, PublishedKeys123>
>;
type Contract278 = Assert<
	Equal<keyof Pick<typeof Native0.VisualElement, PublishedKeys35>, PublishedKeys35>
>;
type Contract279 = Assert<
	Equal<keyof Pick<Native0.VisualElementAnimationOptions, PublishedKeys124>, PublishedKeys124>
>;
type Contract280 = Assert<
	Equal<keyof Pick<Native0.VisualElementEventCallbacks, PublishedKeys125>, PublishedKeys125>
>;
type Contract281 = Assert<
	Equal<
		keyof Pick<Native0.VisualElementOptions<{ sample: string }>, PublishedKeys126>,
		PublishedKeys126
	>
>;
type Contract282 = Assert<
	Equal<
		keyof Pick<Native0.VisualState<{ sample: string }, { sample: string }>, PublishedKeys127>,
		PublishedKeys127
	>
>;
type Contract283 = Assert<
	Equal<keyof Pick<Native0.WillChange, PublishedKeys128>, PublishedKeys128>
>;
type Contract284 = Assert<
	Equal<keyof Pick<Native0.WithAppearProps, PublishedKeys129>, PublishedKeys129>
>;
type Contract285 = Assert<Equal<keyof Pick<Native0.WithDepth, PublishedKeys130>, PublishedKeys130>>;
type Contract286 = Assert<
	Equal<keyof Pick<Native0.WithQuerySelectorAll, PublishedKeys131>, PublishedKeys131>
>;
type Contract287 = Assert<
	Equal<keyof Pick<typeof Native0.acceleratedValues, PublishedKeys132>, PublishedKeys132>
>;
type Contract288 = Assert<Equal<Parameters<typeof Native0.addAttrValue>['length'], 4>>;
type Contract289 = Assert<Equal<Parameters<typeof Native0.addDomEvent>['length'], 3 | 4>>;
type Contract290 = Assert<Equal<Parameters<typeof Native0.addEffect>['length'], 1>>;
type Contract291 = Assert<Equal<Parameters<typeof Native0.addScaleCorrector>['length'], 1>>;
type Contract292 = Assert<Equal<Parameters<typeof Native0.addStyleValue>['length'], 4>>;
type Contract293 = Assert<Equal<Parameters<typeof Native0.addValueToWillChange>['length'], 2>>;
type Contract294 = Assert<
	Equal<keyof Pick<typeof Native0.alpha, PublishedKeys133>, PublishedKeys133>
>;
type Contract295 = Assert<Equal<Parameters<typeof Native0.analyseComplexValue>['length'], 1>>;
type Contract296 = Assert<Equal<Parameters<typeof Native0.animateEffectSubject>['length'], 3 | 4>>;
type Contract297 = Assert<
	Equal<Parameters<typeof Native0.animateMotionValue>['length'], 3 | 4 | 5 | 6>
>;
type Contract298 = Assert<Equal<Parameters<typeof Native0.animateSingleValue>['length'], 2 | 3>>;
type Contract299 = Assert<Equal<Parameters<typeof Native0.animateTarget>['length'], 2 | 3>>;
type Contract300 = Assert<Equal<Parameters<typeof Native0.animateValue>['length'], 1>>;
type Contract301 = Assert<Equal<Parameters<typeof Native0.animateVariant>['length'], 2 | 3>>;
type Contract302 = Assert<Equal<Parameters<typeof Native0.animateView>['length'], 1 | 2>>;
type Contract303 = Assert<Equal<Parameters<typeof Native0.animateVisualElement>['length'], 2 | 3>>;
type Contract304 = Assert<Equal<Parameters<typeof Native0.animationMapKey>['length'], 1 | 2>>;
type Contract305 = Assert<Equal<Parameters<typeof Native0.applyAxisDelta>['length'], 4 | 5>>;
type Contract306 = Assert<Equal<Parameters<typeof Native0.applyBoxDelta>['length'], 2>>;
type Contract307 = Assert<Equal<Parameters<typeof Native0.applyGeneratorOptions>['length'], 1>>;
type Contract308 = Assert<Equal<Parameters<typeof Native0.applyPointDelta>['length'], 4 | 5>>;
type Contract309 = Assert<Equal<Parameters<typeof Native0.applyPxDefaults>['length'], 2>>;
type Contract310 = Assert<Equal<Parameters<typeof Native0.applyTreeDeltas>['length'], 3 | 4>>;
type Contract311 = Assert<Equal<Parameters<typeof Native0.arc>['length'], 0 | 1>>;
type Contract312 = Assert<Equal<Parameters<typeof Native0.aspectRatio>['length'], 1>>;
type Contract313 = Assert<Equal<Parameters<typeof Native0.attachFollow>['length'], 2 | 3>>;
type Contract314 = Assert<Equal<Parameters<typeof Native0.attachSpring>['length'], 2 | 3>>;
type Contract315 = Assert<Equal<Parameters<typeof Native0.attrEffect>['length'], 2>>;
type Contract316 = Assert<Equal<Parameters<typeof Native0.axisDeltaEquals>['length'], 2>>;
type Contract317 = Assert<Equal<Parameters<typeof Native0.axisEquals>['length'], 2>>;
type Contract318 = Assert<Equal<Parameters<typeof Native0.axisEqualsRounded>['length'], 2>>;
type Contract319 = Assert<Equal<Parameters<typeof Native0.boxEquals>['length'], 2>>;
type Contract320 = Assert<Equal<Parameters<typeof Native0.boxEqualsRounded>['length'], 2>>;
type Contract321 = Assert<Equal<Parameters<typeof Native0.buildHTMLStyles>['length'], 2 | 3>>;
type Contract322 = Assert<
	Equal<Parameters<typeof Native0.buildProjectionTransform>['length'], 2 | 3>
>;
type Contract323 = Assert<Equal<Parameters<typeof Native0.buildSVGAttrs>['length'], 3 | 4 | 5>>;
type Contract324 = Assert<Equal<Parameters<typeof Native0.buildSVGPath>['length'], 2 | 3 | 4 | 5>>;
type Contract325 = Assert<Equal<Parameters<typeof Native0.buildTransform>['length'], 2 | 3>>;
type Contract326 = Assert<Equal<Parameters<typeof Native0.calcAxisDelta>['length'], 3 | 4>>;
type Contract327 = Assert<Equal<Parameters<typeof Native0.calcBoxDelta>['length'], 3 | 4>>;
type Contract328 = Assert<
	Equal<Parameters<typeof Native0.calcChildStagger>['length'], 2 | 3 | 4 | 5>
>;
type Contract329 = Assert<
	Equal<Parameters<typeof Native0.calcGeneratorDuration>['length'], 1 | 2 | 3 | 4>
>;
type Contract330 = Assert<Equal<Parameters<typeof Native0.calcLength>['length'], 1>>;
type Contract331 = Assert<Equal<Parameters<typeof Native0.calcRelativeAxis>['length'], 3 | 4>>;
type Contract332 = Assert<
	Equal<Parameters<typeof Native0.calcRelativeAxisPosition>['length'], 3 | 4>
>;
type Contract333 = Assert<Equal<Parameters<typeof Native0.calcRelativeBox>['length'], 3 | 4>>;
type Contract334 = Assert<Equal<Parameters<typeof Native0.calcRelativePosition>['length'], 3 | 4>>;
type Contract335 = Assert<
	Equal<keyof Pick<typeof Native0.camelCaseAttributes, PublishedKeys132>, PublishedKeys132>
>;
type Contract336 = Assert<Equal<Parameters<typeof Native0.camelToDash>['length'], 1>>;
type Contract337 = Assert<Equal<Parameters<typeof Native0.cancelFrame>['length'], 1>>;
type Contract338 = Assert<Equal<Parameters<typeof Native0.cancelMicrotask>['length'], 1>>;
type Contract339 = Assert<
	Equal<keyof Pick<typeof Native0.cancelSync, PublishedKeys1>, PublishedKeys1>
>;
type Contract340 = Assert<Equal<Parameters<typeof Native0.checkVariantsDidChange>['length'], 2>>;
type Contract341 = Assert<Equal<Parameters<typeof Native0.cleanDirtyNodes>['length'], 1>>;
type Contract342 = Assert<
	Equal<keyof Pick<typeof Native0.collectMotionValues, PublishedKeys134>, PublishedKeys134>
>;
type Contract343 = Assert<
	Equal<keyof Pick<typeof Native0.color, PublishedKeys135>, PublishedKeys135>
>;
type Contract344 = Assert<Equal<Parameters<typeof Native0.compareByDepth>['length'], 2>>;
type Contract345 = Assert<
	Equal<keyof Pick<typeof Native0.complex, PublishedKeys136>, PublishedKeys136>
>;
type Contract346 = Assert<Equal<Parameters<typeof Native0.containsCSSVariable>['length'], 0 | 1>>;
type Contract347 = Assert<Equal<Parameters<typeof Native0.convertBoundingBoxToBox>['length'], 1>>;
type Contract348 = Assert<Equal<Parameters<typeof Native0.convertBoxToBoundingBox>['length'], 1>>;
type Contract349 = Assert<Equal<Parameters<typeof Native0.convertOffsetToTimes>['length'], 2>>;
type Contract350 = Assert<Equal<Parameters<typeof Native0.copyAxisDeltaInto>['length'], 2>>;
type Contract351 = Assert<Equal<Parameters<typeof Native0.copyAxisInto>['length'], 2>>;
type Contract352 = Assert<Equal<Parameters<typeof Native0.copyBoxInto>['length'], 2>>;
type Contract353 = Assert<
	Equal<keyof Pick<typeof Native0.correctBorderRadius, PublishedKeys101>, PublishedKeys101>
>;
type Contract354 = Assert<
	Equal<keyof Pick<typeof Native0.correctBoxShadow, PublishedKeys101>, PublishedKeys101>
>;
type Contract355 = Assert<Equal<Parameters<typeof Native0.createAnimationState>['length'], 1>>;
type Contract356 = Assert<Equal<Parameters<typeof Native0.createAxis>['length'], 0>>;
type Contract357 = Assert<Equal<Parameters<typeof Native0.createAxisDelta>['length'], 0>>;
type Contract358 = Assert<Equal<Parameters<typeof Native0.createBox>['length'], 0>>;
type Contract359 = Assert<Equal<Parameters<typeof Native0.createDelta>['length'], 0>>;
type Contract360 = Assert<Equal<Parameters<typeof Native0.createEffect>['length'], 1 | 2>>;
type Contract361 = Assert<Equal<Parameters<typeof Native0.createGeneratorEasing>['length'], 3>>;
type Contract362 = Assert<Equal<Parameters<typeof Native0.createProjectionNode>['length'], 1>>;
type Contract363 = Assert<Equal<Parameters<typeof Native0.createRenderBatcher>['length'], 2>>;
type Contract364 = Assert<Equal<Parameters<typeof Native0.cubicBezierAsString>['length'], 1>>;
type Contract365 = Assert<Equal<Parameters<typeof Native0.defaultEasing>['length'], 1 | 2>>;
type Contract366 = Assert<Equal<Parameters<typeof Native0.defaultOffset>['length'], 1>>;
type Contract367 = Assert<Equal<Parameters<typeof Native0.defaultTransformValue>['length'], 1>>;
type Contract368 = Assert<
	Equal<keyof Pick<typeof Native0.defaultValueTypes, PublishedKeys14>, PublishedKeys14>
>;
type Contract369 = Assert<
	Equal<keyof Pick<typeof Native0.degrees, PublishedKeys133>, PublishedKeys133>
>;
type Contract370 = Assert<Equal<Parameters<typeof Native0.delayInSeconds>['length'], 2>>;
type Contract371 = Assert<
	Equal<keyof Pick<typeof Native0.dimensionValueTypes, PublishedKeys8>, PublishedKeys8>
>;
type Contract372 = Assert<Equal<Parameters<typeof Native0.eachAxis>['length'], 1>>;
type Contract373 = Assert<Equal<Parameters<typeof Native0.fillOffset>['length'], 2>>;
type Contract374 = Assert<Equal<Parameters<typeof Native0.fillWildcards>['length'], 1>>;
type Contract375 = Assert<Equal<Parameters<typeof Native0.findDimensionValueType>['length'], 1>>;
type Contract376 = Assert<Equal<Parameters<typeof Native0.findEffect>['length'], 1>>;
type Contract377 = Assert<Equal<Parameters<typeof Native0.findValueType>['length'], 1>>;
type Contract378 = Assert<Equal<Parameters<typeof Native0.flushKeyframeResolvers>['length'], 0>>;
type Contract379 = Assert<Equal<Parameters<typeof Native0.followValue>['length'], 1 | 2>>;
type Contract380 = Assert<
	Equal<keyof Pick<typeof Native0.frame, PublishedKeys36>, PublishedKeys36>
>;
type Contract381 = Assert<
	Equal<keyof Pick<typeof Native0.frameData, PublishedKeys50>, PublishedKeys50>
>;
type Contract382 = Assert<
	Equal<keyof Pick<typeof Native0.frameSteps, PublishedKeys36>, PublishedKeys36>
>;
type Contract383 = Assert<Equal<Parameters<typeof Native0.generateLinearEasing>['length'], 2 | 3>>;
type Contract384 = Assert<Equal<Parameters<typeof Native0.getAnimatableNone>['length'], 2>>;
type Contract385 = Assert<Equal<Parameters<typeof Native0.getAnimationMap>['length'], 1>>;
type Contract386 = Assert<Equal<Parameters<typeof Native0.getComputedStyle>['length'], 2>>;
type Contract387 = Assert<Equal<Parameters<typeof Native0.getDefaultTransition>['length'], 2>>;
type Contract388 = Assert<Equal<Parameters<typeof Native0.getDefaultValueType>['length'], 1>>;
type Contract389 = Assert<Equal<Parameters<typeof Native0.getFeatureDefinitions>['length'], 0>>;
type Contract390 = Assert<Equal<Parameters<typeof Native0.getFinalKeyframe>['length'], 2 | 3 | 4>>;
type Contract391 = Assert<Equal<Parameters<typeof Native0.getMixer>['length'], 1>>;
type Contract392 = Assert<Equal<Parameters<typeof Native0.getOptimisedAppearId>['length'], 1>>;
type Contract393 = Assert<Equal<Parameters<typeof Native0.getOriginIndex>['length'], 2>>;
type Contract394 = Assert<Equal<Parameters<typeof Native0.getValueAsType>['length'], 1 | 2>>;
type Contract395 = Assert<Equal<Parameters<typeof Native0.getValueTransition>['length'], 2>>;
type Contract396 = Assert<Equal<Parameters<typeof Native0.getVariableValue>['length'], 2 | 3>>;
type Contract397 = Assert<Equal<Parameters<typeof Native0.getVariantContext>['length'], 0 | 1>>;
type Contract398 = Assert<Equal<Parameters<typeof Native0.getViewAnimationLayerInfo>['length'], 1>>;
type Contract399 = Assert<Equal<Parameters<typeof Native0.getViewAnimations>['length'], 0>>;
type Contract400 = Assert<
	Equal<keyof Pick<typeof Native0.globalProjectionState, PublishedKeys137>, PublishedKeys137>
>;
type Contract401 = Assert<Equal<Parameters<typeof Native0.has2DTranslate>['length'], 1>>;
type Contract402 = Assert<
	Equal<keyof Pick<typeof Native0.hasReducedMotionListener, PublishedKeys134>, PublishedKeys134>
>;
type Contract403 = Assert<Equal<Parameters<typeof Native0.hasScale>['length'], 1>>;
type Contract404 = Assert<Equal<Parameters<typeof Native0.hasTransform>['length'], 1>>;
type Contract405 = Assert<
	Equal<keyof Pick<typeof Native0.hex, PublishedKeys133>, PublishedKeys133>
>;
type Contract406 = Assert<Equal<Parameters<typeof Native0.hover>['length'], 2 | 3>>;
type Contract407 = Assert<
	Equal<keyof Pick<typeof Native0.hsla, PublishedKeys133>, PublishedKeys133>
>;
type Contract408 = Assert<Equal<Parameters<typeof Native0.hslaToRgba>['length'], 1>>;
type Contract409 = Assert<Equal<Parameters<typeof Native0.inertia>['length'], 1>>;
type Contract410 = Assert<Equal<Parameters<typeof Native0.initPrefersReducedMotion>['length'], 0>>;
type Contract411 = Assert<Equal<Parameters<typeof Native0.interpolate>['length'], 2 | 3>>;
type Contract412 = Assert<
	Equal<keyof Pick<typeof Native0.invisibleValues, PublishedKeys132>, PublishedKeys132>
>;
type Contract413 = Assert<Equal<Parameters<typeof Native0.isAnimationControls>['length'], 0 | 1>>;
type Contract414 = Assert<Equal<Parameters<typeof Native0.isCSSVariableName>['length'], 0 | 1>>;
type Contract415 = Assert<Equal<Parameters<typeof Native0.isCSSVariableToken>['length'], 0 | 1>>;
type Contract416 = Assert<Equal<Parameters<typeof Native0.isControllingVariants>['length'], 1>>;
type Contract417 = Assert<Equal<Parameters<typeof Native0.isDeltaZero>['length'], 1>>;
type Contract418 = Assert<Equal<Parameters<typeof Native0.isDragActive>['length'], 0>>;
type Contract419 = Assert<
	Equal<keyof Pick<typeof Native0.isDragging, PublishedKeys85>, PublishedKeys85>
>;
type Contract420 = Assert<
	Equal<Parameters<typeof Native0.isElementKeyboardAccessible>['length'], 1>
>;
type Contract421 = Assert<Equal<Parameters<typeof Native0.isElementTextInput>['length'], 1>>;
type Contract422 = Assert<Equal<Parameters<typeof Native0.isForcedMotionValue>['length'], 2>>;
type Contract423 = Assert<Equal<Parameters<typeof Native0.isGenerator>['length'], 0 | 1>>;
type Contract424 = Assert<Equal<Parameters<typeof Native0.isHTMLElement>['length'], 1>>;
type Contract425 = Assert<Equal<Parameters<typeof Native0.isKeyframesTarget>['length'], 1>>;
type Contract426 = Assert<Equal<Parameters<typeof Native0.isMotionValue>['length'], 1>>;
type Contract427 = Assert<Equal<Parameters<typeof Native0.isNear>['length'], 3>>;
type Contract428 = Assert<Equal<Parameters<typeof Native0.isNodeOrChild>['length'], 1 | 2>>;
type Contract429 = Assert<Equal<Parameters<typeof Native0.isPrimaryPointer>['length'], 1>>;
type Contract430 = Assert<Equal<Parameters<typeof Native0.isSVGElement>['length'], 1>>;
type Contract431 = Assert<Equal<Parameters<typeof Native0.isSVGSVGElement>['length'], 1>>;
type Contract432 = Assert<Equal<Parameters<typeof Native0.isSVGTag>['length'], 1>>;
type Contract433 = Assert<Equal<Parameters<typeof Native0.isTransitionDefined>['length'], 1>>;
type Contract434 = Assert<Equal<Parameters<typeof Native0.isVariantLabel>['length'], 1>>;
type Contract435 = Assert<Equal<Parameters<typeof Native0.isVariantNode>['length'], 1>>;
type Contract436 = Assert<
	Equal<Parameters<typeof Native0.isWaapiSupportedEasing>['length'], 0 | 1>
>;
type Contract437 = Assert<Equal<Parameters<typeof Native0.isWillChangeMotionValue>['length'], 1>>;
type Contract438 = Assert<Equal<Parameters<typeof Native0.keyframes>['length'], 1>>;
type Contract439 = Assert<Equal<Parameters<typeof Native0.makeAnimationInstant>['length'], 1>>;
type Contract440 = Assert<Equal<Parameters<typeof Native0.mapEasingToNativeEasing>['length'], 2>>;
type Contract441 = Assert<Equal<Parameters<typeof Native0.mapValue>['length'], 3 | 4>>;
type Contract442 = Assert<
	Equal<keyof Pick<typeof Native0.maxGeneratorDuration, PublishedKeys138>, PublishedKeys138>
>;
type Contract443 = Assert<Equal<Parameters<typeof Native0.measurePageBox>['length'], 2 | 3>>;
type Contract444 = Assert<Equal<Parameters<typeof Native0.measureViewportBox>['length'], 1 | 2>>;
type Contract445 = Assert<
	Equal<keyof Pick<typeof Native0.microtask, PublishedKeys36>, PublishedKeys36>
>;
type Contract446 = Assert<Equal<Parameters<typeof Native0.mix>['length'], 3>>;
type Contract447 = Assert<Equal<Parameters<typeof Native0.mixArray>['length'], 2>>;
type Contract448 = Assert<Equal<Parameters<typeof Native0.mixColor>['length'], 2>>;
type Contract449 = Assert<Equal<Parameters<typeof Native0.mixComplex>['length'], 2>>;
type Contract450 = Assert<Equal<Parameters<typeof Native0.mixImmediate>['length'], 2>>;
type Contract451 = Assert<Equal<Parameters<typeof Native0.mixLinearColor>['length'], 3>>;
type Contract452 = Assert<Equal<Parameters<typeof Native0.mixNumber>['length'], 3>>;
type Contract453 = Assert<Equal<Parameters<typeof Native0.mixObject>['length'], 2>>;
type Contract454 = Assert<Equal<Parameters<typeof Native0.mixValues>['length'], 6>>;
type Contract455 = Assert<Equal<Parameters<typeof Native0.mixVisibility>['length'], 2>>;
type Contract456 = Assert<Equal<Parameters<typeof Native0.motionValue>['length'], 1 | 2>>;
type Contract457 = Assert<Equal<Parameters<typeof Native0.nodeGroup>['length'], 0>>;
type Contract458 = Assert<
	Equal<keyof Pick<typeof Native0.number, PublishedKeys133>, PublishedKeys133>
>;
type Contract459 = Assert<
	Equal<keyof Pick<typeof Native0.numberValueTypes, PublishedKeys14>, PublishedKeys14>
>;
type Contract460 = Assert<Equal<Parameters<typeof Native0.observeTimeline>['length'], 2>>;
type Contract461 = Assert<
	Equal<keyof Pick<typeof Native0.optimizedAppearDataAttribute, PublishedKeys19>, PublishedKeys19>
>;
type Contract462 = Assert<
	Equal<keyof Pick<typeof Native0.optimizedAppearDataId, PublishedKeys19>, PublishedKeys19>
>;
type Contract463 = Assert<
	Equal<Parameters<typeof Native0.parseAnimateLayoutArgs>['length'], 1 | 2 | 3>
>;
type Contract464 = Assert<Equal<Parameters<typeof Native0.parseCSSVariable>['length'], 1>>;
type Contract465 = Assert<Equal<Parameters<typeof Native0.parseValueFromTransform>['length'], 2>>;
type Contract466 = Assert<
	Equal<keyof Pick<typeof Native0.percent, PublishedKeys133>, PublishedKeys133>
>;
type Contract467 = Assert<Equal<Parameters<typeof Native0.pixelsToPercent>['length'], 2>>;
type Contract468 = Assert<
	Equal<keyof Pick<typeof Native0.positionalKeys, PublishedKeys132>, PublishedKeys132>
>;
type Contract469 = Assert<
	Equal<keyof Pick<typeof Native0.prefersReducedMotion, PublishedKeys134>, PublishedKeys134>
>;
type Contract470 = Assert<Equal<Parameters<typeof Native0.press>['length'], 2 | 3>>;
type Contract471 = Assert<
	Equal<keyof Pick<typeof Native0.progressPercentage, PublishedKeys133>, PublishedKeys133>
>;
type Contract472 = Assert<Equal<Parameters<typeof Native0.propEffect>['length'], 2>>;
type Contract473 = Assert<Equal<Parameters<typeof Native0.propagateDirtyNodes>['length'], 1>>;
type Contract474 = Assert<Equal<keyof Pick<typeof Native0.px, PublishedKeys133>, PublishedKeys133>>;
type Contract475 = Assert<Equal<Parameters<typeof Native0.readTransformValue>['length'], 2>>;
type Contract476 = Assert<Equal<Parameters<typeof Native0.recordStats>['length'], 0>>;
type Contract477 = Assert<
	Equal<Parameters<typeof Native0.removeAxisDelta>['length'], 1 | 2 | 3 | 4 | 5 | 6 | 7>
>;
type Contract478 = Assert<
	Equal<Parameters<typeof Native0.removeAxisTransforms>['length'], 3 | 4 | 5>
>;
type Contract479 = Assert<
	Equal<Parameters<typeof Native0.removeBoxTransforms>['length'], 2 | 3 | 4>
>;
type Contract480 = Assert<Equal<Parameters<typeof Native0.removeEffect>['length'], 1>>;
type Contract481 = Assert<Equal<Parameters<typeof Native0.removePointDelta>['length'], 4 | 5>>;
type Contract482 = Assert<Equal<Parameters<typeof Native0.renderHTML>['length'], 2 | 3 | 4>>;
type Contract483 = Assert<Equal<Parameters<typeof Native0.renderSVG>['length'], 2 | 3 | 4>>;
type Contract484 = Assert<Equal<Parameters<typeof Native0.resize>['length'], 2>>;
type Contract485 = Assert<Equal<Parameters<typeof Native0.resolveElements>['length'], 1 | 2 | 3>>;
type Contract486 = Assert<Equal<Parameters<typeof Native0.resolveMotionValue>['length'], 0 | 1>>;
type Contract487 = Assert<Equal<Parameters<typeof Native0.resolveTransition>['length'], 1 | 2>>;
type Contract488 = Assert<Equal<Parameters<typeof Native0.resolveVariant>['length'], 1 | 2 | 3>>;
type Contract489 = Assert<
	Equal<Parameters<typeof Native0.resolveVariantFromProps>['length'], 1 | 2 | 3 | 4>
>;
type Contract490 = Assert<
	Equal<keyof Pick<typeof Native0.rgbUnit, PublishedKeys133>, PublishedKeys133>
>;
type Contract491 = Assert<
	Equal<keyof Pick<typeof Native0.rgba, PublishedKeys133>, PublishedKeys133>
>;
type Contract492 = Assert<
	Equal<keyof Pick<typeof Native0.rootProjectionNode, PublishedKeys134>, PublishedKeys134>
>;
type Contract493 = Assert<
	Equal<keyof Pick<typeof Native0.scale, PublishedKeys139>, PublishedKeys139>
>;
type Contract494 = Assert<
	Equal<keyof Pick<typeof Native0.scaleCorrectors, PublishedKeys14>, PublishedKeys14>
>;
type Contract495 = Assert<Equal<Parameters<typeof Native0.scalePoint>['length'], 3>>;
type Contract496 = Assert<
	Equal<Parameters<typeof Native0.scrapeHTMLMotionValuesFromProps>['length'], 2 | 3>
>;
type Contract497 = Assert<
	Equal<Parameters<typeof Native0.scrapeSVGMotionValuesFromProps>['length'], 2 | 3>
>;
type Contract498 = Assert<Equal<Parameters<typeof Native0.setDragLock>['length'], 1>>;
type Contract499 = Assert<Equal<Parameters<typeof Native0.setFeatureDefinitions>['length'], 1>>;
type Contract500 = Assert<Equal<Parameters<typeof Native0.setStyle>['length'], 3>>;
type Contract501 = Assert<Equal<Parameters<typeof Native0.setTarget>['length'], 2>>;
type Contract502 = Assert<Equal<Parameters<typeof Native0.spring>['length'], 0 | 1 | 2>>;
type Contract503 = Assert<Equal<Parameters<typeof Native0.springValue>['length'], 1 | 2>>;
type Contract504 = Assert<Equal<Parameters<typeof Native0.stagger>['length'], 0 | 1 | 2>>;
type Contract505 = Assert<
	Equal<Parameters<typeof Native0.startWaapiAnimation>['length'], 3 | 4 | 5>
>;
type Contract506 = Assert<
	Equal<keyof Pick<typeof Native0.statsBuffer, PublishedKeys25>, PublishedKeys25>
>;
type Contract507 = Assert<Equal<Parameters<typeof Native0.styleEffect>['length'], 2>>;
type Contract508 = Assert<
	Equal<keyof Pick<typeof Native0.supportedWaapiEasing, PublishedKeys140>, PublishedKeys140>
>;
type Contract509 = Assert<Equal<Parameters<typeof Native0.supportsBrowserAnimation>['length'], 1>>;
type Contract510 = Assert<
	Equal<keyof Pick<typeof Native0.supportsFlags, PublishedKeys1>, PublishedKeys1>
>;
type Contract511 = Assert<Equal<Parameters<typeof Native0.supportsLinearEasing>['length'], 0>>;
type Contract512 = Assert<Equal<Parameters<typeof Native0.supportsPartialKeyframes>['length'], 0>>;
type Contract513 = Assert<Equal<Parameters<typeof Native0.supportsScrollTimeline>['length'], 0>>;
type Contract514 = Assert<Equal<Parameters<typeof Native0.supportsViewTimeline>['length'], 0>>;
type Contract515 = Assert<Equal<Parameters<typeof Native0.svgEffect>['length'], 2>>;
type Contract516 = Assert<Equal<keyof Pick<typeof Native0.sync, PublishedKeys36>, PublishedKeys36>>;
type Contract517 = Assert<Equal<Parameters<typeof Native0.testValueType>['length'], 1>>;
type Contract518 = Assert<
	Equal<keyof Pick<typeof Native0.time, PublishedKeys141>, PublishedKeys141>
>;
type Contract519 = Assert<Equal<Parameters<typeof Native0.transform>['length'], 2 | 3>>;
type Contract520 = Assert<
	Equal<Parameters<typeof Native0.transformAxis>['length'], 1 | 2 | 3 | 4 | 5>
>;
type Contract521 = Assert<Equal<Parameters<typeof Native0.transformBox>['length'], 2 | 3>>;
type Contract522 = Assert<Equal<Parameters<typeof Native0.transformBoxPoints>['length'], 1 | 2>>;
type Contract523 = Assert<
	Equal<keyof Pick<typeof Native0.transformPropOrder, PublishedKeys8>, PublishedKeys8>
>;
type Contract524 = Assert<
	Equal<keyof Pick<typeof Native0.transformProps, PublishedKeys132>, PublishedKeys132>
>;
type Contract525 = Assert<Equal<Parameters<typeof Native0.transformValue>['length'], 1>>;
type Contract526 = Assert<
	Equal<keyof Pick<typeof Native0.transformValueTypes, PublishedKeys14>, PublishedKeys14>
>;
type Contract527 = Assert<Equal<Parameters<typeof Native0.translateAxis>['length'], 2>>;
type Contract528 = Assert<
	Equal<Parameters<typeof Native0.updateMotionValuesFromProps>['length'], 3>
>;
type Contract529 = Assert<
	Equal<keyof Pick<typeof Native0.variantPriorityOrder, PublishedKeys8>, PublishedKeys8>
>;
type Contract530 = Assert<
	Equal<keyof Pick<typeof Native0.variantProps, PublishedKeys8>, PublishedKeys8>
>;
type Contract531 = Assert<Equal<keyof Pick<typeof Native0.vh, PublishedKeys133>, PublishedKeys133>>;
type Contract532 = Assert<
	Equal<keyof Pick<typeof Native0.visualElementStore, PublishedKeys142>, PublishedKeys142>
>;
type Contract533 = Assert<Equal<keyof Pick<typeof Native0.vw, PublishedKeys133>, PublishedKeys133>>;
type Contract534 = Assert<Equal<keyof Pick<Native0.Axis, PublishedKeys143>, PublishedKeys143>>;
type Contract535 = Assert<Equal<keyof Pick<Native0.AxisDelta, PublishedKeys144>, PublishedKeys144>>;
type Contract536 = Assert<
	Equal<keyof Pick<Native0.BezierDefinition, PublishedKeys145>, PublishedKeys145>
>;
type Contract537 = Assert<
	Equal<keyof Pick<Native0.BoundingBox, PublishedKeys146>, PublishedKeys146>
>;
type Contract538 = Assert<Equal<keyof Pick<Native0.Box, PublishedKeys85>, PublishedKeys85>>;
type Contract539 = Assert<Equal<keyof Pick<Native0.Delta, PublishedKeys85>, PublishedKeys85>>;
type Contract540 = Assert<Equal<Parameters<Native0.DevMessage>['length'], 2 | 3>>;
type Contract541 = Assert<Equal<keyof Pick<Native0.Direction, PublishedKeys19>, PublishedKeys19>>;
type Contract542 = Assert<Equal<keyof Native0.Easing, never>>;
type Contract543 = Assert<
	Equal<keyof Pick<Native0.EasingDefinition, PublishedKeys117>, PublishedKeys117>
>;
type Contract544 = Assert<Equal<Parameters<Native0.EasingFunction>['length'], 1>>;
type Contract545 = Assert<Equal<Parameters<Native0.EasingModifier>['length'], 1>>;
type Contract546 = Assert<
	Equal<keyof Pick<typeof Native0.MotionGlobalConfig, PublishedKeys147>, PublishedKeys147>
>;
type Contract547 = Assert<Equal<keyof Pick<Native0.Point, PublishedKeys85>, PublishedKeys85>>;
type Contract548 = Assert<
	Equal<keyof Pick<typeof Native0.SubscriptionManager, PublishedKeys35>, PublishedKeys35>
>;
type Contract549 = Assert<Equal<Parameters<Native0.TransformPoint>['length'], 1>>;
type Contract550 = Assert<Equal<Parameters<typeof Native0.addUniqueItem>['length'], 2>>;
type Contract551 = Assert<Equal<Parameters<typeof Native0.anticipate>['length'], 1>>;
type Contract552 = Assert<Equal<Parameters<typeof Native0.backIn>['length'], 1>>;
type Contract553 = Assert<Equal<Parameters<typeof Native0.backInOut>['length'], 1>>;
type Contract554 = Assert<Equal<Parameters<typeof Native0.backOut>['length'], 1>>;
type Contract555 = Assert<Equal<Parameters<typeof Native0.circIn>['length'], 1>>;
type Contract556 = Assert<Equal<Parameters<typeof Native0.circInOut>['length'], 1>>;
type Contract557 = Assert<Equal<Parameters<typeof Native0.circOut>['length'], 1>>;
type Contract558 = Assert<Equal<Parameters<typeof Native0.clamp>['length'], 3>>;
type Contract559 = Assert<Equal<Parameters<typeof Native0.cubicBezier>['length'], 4>>;
type Contract560 = Assert<Equal<Parameters<typeof Native0.easeIn>['length'], 1>>;
type Contract561 = Assert<Equal<Parameters<typeof Native0.easeInOut>['length'], 1>>;
type Contract562 = Assert<Equal<Parameters<typeof Native0.easeOut>['length'], 1>>;
type Contract563 = Assert<
	Equal<Parameters<typeof Native0.easingDefinitionToFunction>['length'], 1>
>;
type Contract564 = Assert<Equal<Parameters<typeof Native0.getEasingForSegment>['length'], 2>>;
type Contract565 = Assert<Equal<Parameters<typeof Native0.hasWarned>['length'], 1>>;
type Contract566 = Assert<Equal<Parameters<typeof Native0.invariant>['length'], 2 | 3>>;
type Contract567 = Assert<Equal<Parameters<typeof Native0.isBezierDefinition>['length'], 1>>;
type Contract568 = Assert<Equal<Parameters<typeof Native0.isEasingArray>['length'], 1>>;
type Contract569 = Assert<Equal<Parameters<typeof Native0.isNumericalString>['length'], 1>>;
type Contract570 = Assert<Equal<Parameters<typeof Native0.isObject>['length'], 1>>;
type Contract571 = Assert<Equal<Parameters<typeof Native0.isZeroValueString>['length'], 1>>;
type Contract572 = Assert<Equal<Parameters<typeof Native0.memo>['length'], 1>>;
type Contract573 = Assert<Equal<Parameters<typeof Native0.millisecondsToSeconds>['length'], 1>>;
type Contract574 = Assert<Equal<Parameters<typeof Native0.mirrorEasing>['length'], 1>>;
type Contract575 = Assert<Equal<Parameters<typeof Native0.moveItem>['length'], 3>>;
type Contract576 = Assert<Equal<Parameters<typeof Native0.noop>['length'], 1>>;
type Contract577 = Assert<Equal<Parameters<typeof Native0.pipe>['length'], number>>;
type Contract578 = Assert<Equal<Parameters<typeof Native0.progress>['length'], 3>>;
type Contract579 = Assert<Equal<Parameters<typeof Native0.removeItem>['length'], 2>>;
type Contract580 = Assert<Equal<Parameters<typeof Native0.reverseEasing>['length'], 1>>;
type Contract581 = Assert<Equal<Parameters<typeof Native0.secondsToMilliseconds>['length'], 1>>;
type Contract582 = Assert<Equal<Parameters<typeof Native0.steps>['length'], 1 | 2>>;
type Contract583 = Assert<Equal<Parameters<typeof Native0.velocityPerSecond>['length'], 2>>;
type Contract584 = Assert<Equal<Parameters<typeof Native0.warnOnce>['length'], 2 | 3>>;
type Contract585 = Assert<Equal<Parameters<typeof Native0.warning>['length'], 2 | 3>>;
type Contract586 = Assert<Equal<Parameters<typeof Native0.wrap>['length'], 3>>;
type Contract587 = Assert<Equal<Parameters<typeof Native1.a>['length'], 2>>;
type Contract588 = Assert<Equal<Parameters<typeof Native1.abbr>['length'], 2>>;
type Contract589 = Assert<Equal<Parameters<typeof Native1.address>['length'], 2>>;
type Contract590 = Assert<Equal<Parameters<typeof Native1.animate>['length'], 2>>;
type Contract591 = Assert<Equal<Parameters<typeof Native1.area>['length'], 2>>;
type Contract592 = Assert<Equal<Parameters<typeof Native1.article>['length'], 2>>;
type Contract593 = Assert<Equal<Parameters<typeof Native1.aside>['length'], 2>>;
type Contract594 = Assert<Equal<Parameters<typeof Native1.audio>['length'], 2>>;
type Contract595 = Assert<Equal<Parameters<typeof Native1.b>['length'], 2>>;
type Contract596 = Assert<Equal<Parameters<typeof Native1.base>['length'], 2>>;
type Contract597 = Assert<Equal<Parameters<typeof Native1.bdi>['length'], 2>>;
type Contract598 = Assert<Equal<Parameters<typeof Native1.bdo>['length'], 2>>;
type Contract599 = Assert<Equal<Parameters<typeof Native1.big>['length'], 2>>;
type Contract600 = Assert<Equal<Parameters<typeof Native1.blockquote>['length'], 2>>;
type Contract601 = Assert<Equal<Parameters<typeof Native1.body>['length'], 2>>;
type Contract602 = Assert<Equal<Parameters<typeof Native1.button>['length'], 2>>;
type Contract603 = Assert<Equal<Parameters<typeof Native1.canvas>['length'], 2>>;
type Contract604 = Assert<Equal<Parameters<typeof Native1.caption>['length'], 2>>;
type Contract605 = Assert<Equal<Parameters<typeof Native1.circle>['length'], 2>>;
type Contract606 = Assert<Equal<Parameters<typeof Native1.cite>['length'], 2>>;
type Contract607 = Assert<Equal<Parameters<typeof Native1.clipPath>['length'], 2>>;
type Contract608 = Assert<Equal<Parameters<typeof Native1.code>['length'], 2>>;
type Contract609 = Assert<Equal<Parameters<typeof Native1.col>['length'], 2>>;
type Contract610 = Assert<Equal<Parameters<typeof Native1.colgroup>['length'], 2>>;
type Contract611 = Assert<Equal<Parameters<typeof Native1.data>['length'], 2>>;
type Contract612 = Assert<Equal<Parameters<typeof Native1.datalist>['length'], 2>>;
type Contract613 = Assert<Equal<Parameters<typeof Native1.dd>['length'], 2>>;
type Contract614 = Assert<Equal<Parameters<typeof Native1.defs>['length'], 2>>;
type Contract615 = Assert<Equal<Parameters<typeof Native1.del>['length'], 2>>;
type Contract616 = Assert<Equal<Parameters<typeof Native1.desc>['length'], 2>>;
type Contract617 = Assert<Equal<Parameters<typeof Native1.details>['length'], 2>>;
type Contract618 = Assert<Equal<Parameters<typeof Native1.dfn>['length'], 2>>;
type Contract619 = Assert<Equal<Parameters<typeof Native1.dialog>['length'], 2>>;
type Contract620 = Assert<Equal<Parameters<typeof Native1.div>['length'], 2>>;
type Contract621 = Assert<Equal<Parameters<typeof Native1.dl>['length'], 2>>;
type Contract622 = Assert<Equal<Parameters<typeof Native1.dt>['length'], 2>>;
type Contract623 = Assert<Equal<Parameters<typeof Native1.ellipse>['length'], 2>>;
type Contract624 = Assert<Equal<Parameters<typeof Native1.em>['length'], 2>>;
type Contract625 = Assert<Equal<Parameters<typeof Native1.embed>['length'], 2>>;
type Contract626 = Assert<Equal<Parameters<typeof Native1.feBlend>['length'], 2>>;
type Contract627 = Assert<Equal<Parameters<typeof Native1.feColorMatrix>['length'], 2>>;
type Contract628 = Assert<Equal<Parameters<typeof Native1.feComponentTransfer>['length'], 2>>;
type Contract629 = Assert<Equal<Parameters<typeof Native1.feComposite>['length'], 2>>;
type Contract630 = Assert<Equal<Parameters<typeof Native1.feConvolveMatrix>['length'], 2>>;
type Contract631 = Assert<Equal<Parameters<typeof Native1.feDiffuseLighting>['length'], 2>>;
type Contract632 = Assert<Equal<Parameters<typeof Native1.feDisplacementMap>['length'], 2>>;
type Contract633 = Assert<Equal<Parameters<typeof Native1.feDistantLight>['length'], 2>>;
type Contract634 = Assert<Equal<Parameters<typeof Native1.feDropShadow>['length'], 2>>;
type Contract635 = Assert<Equal<Parameters<typeof Native1.feFlood>['length'], 2>>;
type Contract636 = Assert<Equal<Parameters<typeof Native1.feFuncA>['length'], 2>>;
type Contract637 = Assert<Equal<Parameters<typeof Native1.feFuncB>['length'], 2>>;
type Contract638 = Assert<Equal<Parameters<typeof Native1.feFuncG>['length'], 2>>;
type Contract639 = Assert<Equal<Parameters<typeof Native1.feFuncR>['length'], 2>>;
type Contract640 = Assert<Equal<Parameters<typeof Native1.feGaussianBlur>['length'], 2>>;
type Contract641 = Assert<Equal<Parameters<typeof Native1.feImage>['length'], 2>>;
type Contract642 = Assert<Equal<Parameters<typeof Native1.feMerge>['length'], 2>>;
type Contract643 = Assert<Equal<Parameters<typeof Native1.feMergeNode>['length'], 2>>;
type Contract644 = Assert<Equal<Parameters<typeof Native1.feMorphology>['length'], 2>>;
type Contract645 = Assert<Equal<Parameters<typeof Native1.feOffset>['length'], 2>>;
type Contract646 = Assert<Equal<Parameters<typeof Native1.fePointLight>['length'], 2>>;
type Contract647 = Assert<Equal<Parameters<typeof Native1.feSpecularLighting>['length'], 2>>;
type Contract648 = Assert<Equal<Parameters<typeof Native1.feSpotLight>['length'], 2>>;
type Contract649 = Assert<Equal<Parameters<typeof Native1.feTile>['length'], 2>>;
type Contract650 = Assert<Equal<Parameters<typeof Native1.feTurbulence>['length'], 2>>;
type Contract651 = Assert<Equal<Parameters<typeof Native1.fieldset>['length'], 2>>;
type Contract652 = Assert<Equal<Parameters<typeof Native1.figcaption>['length'], 2>>;
type Contract653 = Assert<Equal<Parameters<typeof Native1.figure>['length'], 2>>;
type Contract654 = Assert<Equal<Parameters<typeof Native1.filter>['length'], 2>>;
type Contract655 = Assert<Equal<Parameters<typeof Native1.footer>['length'], 2>>;
type Contract656 = Assert<Equal<Parameters<typeof Native1.foreignObject>['length'], 2>>;
type Contract657 = Assert<Equal<Parameters<typeof Native1.form>['length'], 2>>;
type Contract658 = Assert<Equal<Parameters<typeof Native1.g>['length'], 2>>;
type Contract659 = Assert<Equal<Parameters<typeof Native1.h1>['length'], 2>>;
type Contract660 = Assert<Equal<Parameters<typeof Native1.h2>['length'], 2>>;
type Contract661 = Assert<Equal<Parameters<typeof Native1.h3>['length'], 2>>;
type Contract662 = Assert<Equal<Parameters<typeof Native1.h4>['length'], 2>>;
type Contract663 = Assert<Equal<Parameters<typeof Native1.h5>['length'], 2>>;
type Contract664 = Assert<Equal<Parameters<typeof Native1.h6>['length'], 2>>;
type Contract665 = Assert<Equal<Parameters<typeof Native1.head>['length'], 2>>;
type Contract666 = Assert<Equal<Parameters<typeof Native1.header>['length'], 2>>;
type Contract667 = Assert<Equal<Parameters<typeof Native1.hgroup>['length'], 2>>;
type Contract668 = Assert<Equal<Parameters<typeof Native1.hr>['length'], 2>>;
type Contract669 = Assert<Equal<Parameters<typeof Native1.html>['length'], 2>>;
type Contract670 = Assert<Equal<Parameters<typeof Native1.i>['length'], 2>>;
type Contract671 = Assert<Equal<Parameters<typeof Native1.iframe>['length'], 2>>;
type Contract672 = Assert<Equal<Parameters<typeof Native1.image>['length'], 2>>;
type Contract673 = Assert<Equal<Parameters<typeof Native1.img>['length'], 2>>;
type Contract674 = Assert<Equal<Parameters<typeof Native1.input>['length'], 2>>;
type Contract675 = Assert<Equal<Parameters<typeof Native1.ins>['length'], 2>>;
type Contract676 = Assert<Equal<Parameters<typeof Native1.kbd>['length'], 2>>;
type Contract677 = Assert<Equal<Parameters<typeof Native1.keygen>['length'], 2>>;
type Contract678 = Assert<Equal<Parameters<typeof Native1.label>['length'], 2>>;
type Contract679 = Assert<Equal<Parameters<typeof Native1.legend>['length'], 2>>;
type Contract680 = Assert<Equal<Parameters<typeof Native1.li>['length'], 2>>;
type Contract681 = Assert<Equal<Parameters<typeof Native1.line>['length'], 2>>;
type Contract682 = Assert<Equal<Parameters<typeof Native1.linearGradient>['length'], 2>>;
type Contract683 = Assert<Equal<Parameters<typeof Native1.link>['length'], 2>>;
type Contract684 = Assert<Equal<Parameters<typeof Native1.main>['length'], 2>>;
type Contract685 = Assert<Equal<Parameters<typeof Native1.map>['length'], 2>>;
type Contract686 = Assert<Equal<Parameters<typeof Native1.mark>['length'], 2>>;
type Contract687 = Assert<Equal<Parameters<typeof Native1.marker>['length'], 2>>;
type Contract688 = Assert<Equal<Parameters<typeof Native1.mask>['length'], 2>>;
type Contract689 = Assert<Equal<Parameters<typeof Native1.menu>['length'], 2>>;
type Contract690 = Assert<Equal<Parameters<typeof Native1.menuitem>['length'], 2>>;
type Contract691 = Assert<Equal<Parameters<typeof Native1.metadata>['length'], 2>>;
type Contract692 = Assert<Equal<Parameters<typeof Native1.meter>['length'], 2>>;
type Contract693 = Assert<Equal<Parameters<typeof Native1.nav>['length'], 2>>;
type Contract694 = Assert<Equal<Parameters<typeof Native1.object>['length'], 2>>;
type Contract695 = Assert<Equal<Parameters<typeof Native1.ol>['length'], 2>>;
type Contract696 = Assert<Equal<Parameters<typeof Native1.optgroup>['length'], 2>>;
type Contract697 = Assert<Equal<Parameters<typeof Native1.option>['length'], 2>>;
type Contract698 = Assert<Equal<Parameters<typeof Native1.output>['length'], 2>>;
type Contract699 = Assert<Equal<Parameters<typeof Native1.p>['length'], 2>>;
type Contract700 = Assert<Equal<Parameters<typeof Native1.param>['length'], 2>>;
type Contract701 = Assert<Equal<Parameters<typeof Native1.path>['length'], 2>>;
type Contract702 = Assert<Equal<Parameters<typeof Native1.pattern>['length'], 2>>;
type Contract703 = Assert<Equal<Parameters<typeof Native1.picture>['length'], 2>>;
type Contract704 = Assert<Equal<Parameters<typeof Native1.polygon>['length'], 2>>;
type Contract705 = Assert<Equal<Parameters<typeof Native1.polyline>['length'], 2>>;
type Contract706 = Assert<Equal<Parameters<typeof Native1.pre>['length'], 2>>;
type Contract707 = Assert<Equal<Parameters<typeof Native1.progress>['length'], 2>>;
type Contract708 = Assert<Equal<Parameters<typeof Native1.q>['length'], 2>>;
type Contract709 = Assert<Equal<Parameters<typeof Native1.radialGradient>['length'], 2>>;
type Contract710 = Assert<Equal<Parameters<typeof Native1.rect>['length'], 2>>;
type Contract711 = Assert<Equal<Parameters<typeof Native1.rp>['length'], 2>>;
type Contract712 = Assert<Equal<Parameters<typeof Native1.rt>['length'], 2>>;
type Contract713 = Assert<Equal<Parameters<typeof Native1.ruby>['length'], 2>>;
type Contract714 = Assert<Equal<Parameters<typeof Native1.s>['length'], 2>>;
type Contract715 = Assert<Equal<Parameters<typeof Native1.samp>['length'], 2>>;
type Contract716 = Assert<Equal<Parameters<typeof Native1.script>['length'], 2>>;
type Contract717 = Assert<Equal<Parameters<typeof Native1.section>['length'], 2>>;
type Contract718 = Assert<Equal<Parameters<typeof Native1.select>['length'], 2>>;
type Contract719 = Assert<Equal<Parameters<typeof Native1.small>['length'], 2>>;
type Contract720 = Assert<Equal<Parameters<typeof Native1.source>['length'], 2>>;
type Contract721 = Assert<Equal<Parameters<typeof Native1.span>['length'], 2>>;
type Contract722 = Assert<Equal<Parameters<typeof Native1.stop>['length'], 2>>;
type Contract723 = Assert<Equal<Parameters<typeof Native1.strong>['length'], 2>>;
type Contract724 = Assert<Equal<Parameters<typeof Native1.style>['length'], 2>>;
type Contract725 = Assert<Equal<Parameters<typeof Native1.sub>['length'], 2>>;
type Contract726 = Assert<Equal<Parameters<typeof Native1.summary>['length'], 2>>;
type Contract727 = Assert<Equal<Parameters<typeof Native1.sup>['length'], 2>>;
type Contract728 = Assert<Equal<Parameters<typeof Native1.svg>['length'], 2>>;
type Contract729 = Assert<Equal<Parameters<typeof Native1.symbol>['length'], 2>>;
type Contract730 = Assert<Equal<Parameters<typeof Native1.table>['length'], 2>>;
type Contract731 = Assert<Equal<Parameters<typeof Native1.tbody>['length'], 2>>;
type Contract732 = Assert<Equal<Parameters<typeof Native1.td>['length'], 2>>;
type Contract733 = Assert<Equal<Parameters<typeof Native1.text>['length'], 2>>;
type Contract734 = Assert<Equal<Parameters<typeof Native1.textPath>['length'], 2>>;
type Contract735 = Assert<Equal<Parameters<typeof Native1.textarea>['length'], 2>>;
type Contract736 = Assert<Equal<Parameters<typeof Native1.tfoot>['length'], 2>>;
type Contract737 = Assert<Equal<Parameters<typeof Native1.th>['length'], 2>>;
type Contract738 = Assert<Equal<Parameters<typeof Native1.thead>['length'], 2>>;
type Contract739 = Assert<Equal<Parameters<typeof Native1.time>['length'], 2>>;
type Contract740 = Assert<Equal<Parameters<typeof Native1.title>['length'], 2>>;
type Contract741 = Assert<Equal<Parameters<typeof Native1.tr>['length'], 2>>;
type Contract742 = Assert<Equal<Parameters<typeof Native1.track>['length'], 2>>;
type Contract743 = Assert<Equal<Parameters<typeof Native1.tspan>['length'], 2>>;
type Contract744 = Assert<Equal<Parameters<typeof Native1.u>['length'], 2>>;
type Contract745 = Assert<Equal<Parameters<typeof Native1.ul>['length'], 2>>;
type Contract746 = Assert<Equal<Parameters<typeof Native1.use>['length'], 2>>;
type Contract747 = Assert<Equal<Parameters<typeof Native1.video>['length'], 2>>;
type Contract748 = Assert<Equal<Parameters<typeof Native1.view>['length'], 2>>;
type Contract749 = Assert<Equal<Parameters<typeof Native1.wbr>['length'], 2>>;
type Contract750 = Assert<Equal<Parameters<typeof Native1.webview>['length'], 2>>;
