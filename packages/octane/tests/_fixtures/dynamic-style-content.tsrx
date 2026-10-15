import { trustHTML } from 'octane';

export function DynamicStyle(props: { css: string }) @{
	<>
		<style children={props.css} />
		<style dangerouslySetInnerHTML={trustHTML(props.css)} />
		<style>
			.marker {
				color: purple;
			}
		</style>
		<p class="marker">{'Styled'}</p>
	</>
}
