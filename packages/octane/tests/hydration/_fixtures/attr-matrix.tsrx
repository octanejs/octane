// Attribute matrix: the client template emitter and the SSR emitter each carry
// their own per-attribute policy. Anything they disagree on is a hydration
// mismatch, so every special-cased attribute name gets an entry here.

export function BooleanAttrs(props) @{
	<div>
		<input class="b1" type="checkbox" checked={props.on} />
		<input class="b2" type="checkbox" defaultChecked={props.on} />
		<input class="b3" disabled={props.on} readOnly={props.on} required={props.on} />
		<button class="b4" disabled={props.on}>{'b'}</button>
		<select class="b5" multiple={props.on}>
			<option value="a" selected={props.on}>{'a'}</option>
		</select>
		<video class="b6" controls={props.on} loop={props.on} muted={props.on} />
	</div>
}

export function ValueAttrs(props) @{
	<div>
		<input class="v1" value={props.text} />
		<input class="v2" defaultValue={props.text} />
		<input class="v3" type="number" value={props.num} />
		<input class="v4" type="radio" checked={props.on} />
		<textarea class="v5" value={props.text} />
		<select class="v6" value={props.text}>
			<option value="a">{'a'}</option>
			<option value="b">{'b'}</option>
		</select>
	</div>
}

export function EnumeratedAndAria(props) @{
	<div>
		<div class="e1" contentEditable={props.on} suppressContentEditableWarning={true} />
		<div class="e2" spellCheck={props.on} draggable={props.on} />
		<div class="e3" aria-hidden={props.on} aria-label={props.text} aria-checked={props.on} />
		<div class="e4" data-flag={props.on} data-name={props.text} />
		<div class="e5" tabIndex={props.num} />
	</div>
}

export function NamedAndAliased(props) @{
	<div>
		<label class="n1" for={props.text}>{'l'}</label>
		<div class="n2" class={props.text} />
		<div class="n3" style={{ color: 'red', marginTop: props.num }} />
		<a class="n4" href={props.text} download={props.on} />
		<img class="n5" src={props.text} srcSet={props.text} />
	</div>
}

export function FormAttrs(props) @{
	<form class="f0" action={props.text}>
		<input class="f1" name="a" formAction={props.text} />
		<button class="f2" formAction={props.text} formMethod="post">{'go'}</button>
		<input class="f3" autoFocus={props.on} />
	</form>
}

export function AutoFocusSpread(props) @{
	<input id="hydrated-autofocus-spread" {...props.attributes} />
}

export function NamespacedTags(props) @{
	<div>
		<svg class="s1" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
			<circle class="s2" cx={props.num} cy={props.num} r="3" />
			<foreignObject class="s3" width="10" height="10">
				<div class="s4">{props.text}</div>
			</foreignObject>
		</svg>
		<math class="m1">
			<mrow class="m2">{props.text}</mrow>
		</math>
	</div>
}

export function WhitespaceSensitive(props) @{
	<div>
		<pre class="w1">{props.text}</pre>
		<textarea class="w2">{props.text}</textarea>
	</div>
}

export function ClassComposition(props) @{
	<div>
		<div class="c1" class={['a', props.on && 'b', { c: props.on, d: !props.on }]} />
		<div class="c2" class={props.text} />
		<svg class="c3" class={['s', { t: props.on }]} viewBox="0 0 1 1" />
	</div>
}

export function SpreadProps(props) @{
	<div>
		<div class="p1" {...props.spread} />
		<input class="p2" {...props.spread} value={props.text} />
		<div class="p3" {...{ 'data-x': props.text, hidden: props.on }} />
	</div>
}

export function StyleShapes(props) @{
	<div>
		<div class="y1" style={{ width: props.num, opacity: props.num, zIndex: props.num }} />
		<div class="y2" style={{ '--custom': props.text, backgroundColor: props.text }} />
		<div class="y3" style={{ color: props.on ? 'red' : '', margin: props.text }} />
	</div>
}

export function DangerAndSuppress(props) @{
	<div>
		<div class="d1" dangerouslySetInnerHTML={{ __html: props.html }} />
		<div class="d2" suppressHydrationWarning={true}>{props.text}</div>
	</div>
}

export function EnumeratedBooleans(props) @{
	<div>
		<div class="g1" draggable={props.on} spellCheck={props.on} />
		<div class="g2" hidden={props.on} inert={props.on} />
		<input class="g3" autoComplete={props.on ? 'on' : 'off'} />
		<ol class="g4" reversed={props.on} start={props.num} />
	</div>
}

export function HydratedAttributeValues(props: {
	text: string | null;
	on: boolean;
}) @{
	<div>
		<button
			title={props.text}
			data-label={props.text as string}
			disabled={props.on}
			aria-expanded={props.on}
		>{'attributes'}</button>
		<svg>
			<use xlinkHref={props.text} xmlLang={props.text} />
		</svg>
		<octane-attribute-probe customName={props.text} hidden={props.on} />
	</div>
}
