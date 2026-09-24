import { Hydrate, useLayoutEffect } from 'octane';
import { interaction } from 'octane/hydration';
import { recordClick, recordHydrated } from './actions.js';

export interface FormProps {
	opted: boolean;
	button: boolean;
	controls: boolean;
}

export function Form(props: FormProps) @{
	<main id="behavior-container">
		<Hydrate independent when={interaction({ events: 'click' })}>
			<section>
				<IslandReady />
				<form
					id="command-form"
					data-octane-capture-submit={props.opted ? 'save' : undefined}
					action="/submitted?form=base"
					method="post"
					enctype="multipart/form-data"
					target="navigation-frame"
				>
					<label>
						Draft
						<input id="draft-input" name="draft" defaultValue="server" />
					</label>
					@if (props.controls) {
						<>
							<input type="hidden" name="hidden" value="original-hidden" />
							<input name="action" defaultValue="field-action" />
							<input name="getAttribute" defaultValue="field-getAttribute" />
							<input name="closest" defaultValue="field-closest" />
							<input name="matches" defaultValue="field-matches" />
							<input name="contains" defaultValue="field-contains" />
							<input name="querySelectorAll" defaultValue="field-querySelectorAll" />
							<input name="disabled" defaultValue="ignored" disabled />
							<input defaultValue="unnamed" />
							<label>
								<input
									id="checked-input"
									type="checkbox"
									name="checked"
									value="yes"
									defaultChecked
								/>
								Checked
							</label>
							<label>
								<input type="checkbox" name="unchecked" value="no" />
								Unchecked
							</label>
							<label>
								<input type="radio" name="choice" value="first" defaultChecked />
								First
							</label>
							<label>
								<input id="second-input" type="radio" name="choice" value="second" />
								Second
							</label>
							<label>
								Options
								<select id="options-input" name="options" multiple defaultValue={['one', 'three']}>
									<option value="one">One</option>
									<option value="two">Two</option>
									<option value="three">Three</option>
								</select>
							</label>
							<label>
								Attachment
								<input id="attachment-input" type="file" name="attachment" />
							</label>
							<fieldset disabled>
								<input name="fieldset-disabled" defaultValue="ignored" />
							</fieldset>
						</>
					}
					@if (props.button) {
						<button
							id="save-button"
							type="submit"
							name="intent"
							value="save"
							formAction="/submitted?form=button"
							formMethod="post"
							formEnctype="application/x-www-form-urlencoded"
							formTarget="navigation-frame"
							formNoValidate
							onClick={recordClick}
						>
							Save
						</button>
					}
				</form>
				<button id="activate-button" type="button" onClick={recordClick}>
					Activate island
				</button>
			</section>
		</Hydrate>
		@if (props.controls) {
			<input
				id="external-input"
				aria-label="External"
				form="command-form"
				name="external"
				defaultValue="original-external"
			/>
		}
		<iframe name="navigation-frame" title="Native navigation destination" />
	</main>
}

function IslandReady() @{
	useLayoutEffect(recordHydrated, []);
	<output hidden>Island ready</output>
}
