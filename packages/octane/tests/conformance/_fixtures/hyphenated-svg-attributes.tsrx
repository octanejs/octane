import { createElement } from 'octane';

function ComponentFontFace(props) @{
	<font-face
		id="component-font"
		strokeWidth={props.stroke}
		size={props.size}
		hidden={props.hidden}
	/>
}

export function HyphenatedSvgAttributes(props) @{
	<section id="hyphenated-svg-attributes">
		<svg id="hyphenated-svg">
			<font-face id="static-font" strokeWidth="2" size={0} hidden={0} title={true} />
			<font-face
				id="dynamic-font"
				strokeWidth={props.stroke}
				size={props.size}
				hidden={props.hidden}
			/>
			<font-face id="spread-font" {...props.nativeAttrs} />
			<ComponentFontFace stroke={props.stroke} size={props.size} hidden={props.hidden} />
			<missing-glyph id="static-glyph" strokeWidth="2" size={0} hidden={0} title={true} />
			<missing-glyph
				id="dynamic-glyph"
				strokeWidth={props.stroke}
				size={props.size}
				hidden={props.hidden}
			/>
			<missing-glyph id="spread-glyph" {...props.nativeAttrs} />
			{createElement('missing-glyph', {
				id: 'descriptor-glyph',
				strokeWidth: props.stroke,
				size: props.size,
				hidden: props.hidden,
			})}
		</svg>
		{createElement(
			'svg',
			{ id: 'descriptor-svg' },
			createElement('font-face', {
				id: 'descriptor-nested-font',
				strokeWidth: props.stroke,
				size: props.size,
				hidden: props.hidden,
				title: props.title,
			}),
		)}
		<custom-element
			id="dynamic-custom"
			htmlFor={props.customFor}
			size={props.size}
			hidden={props.hidden}
			title={props.title}
		/>
		<custom-element id="spread-custom" {...props.customAttrs} />
	</section>
}
