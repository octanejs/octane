import { Hydrate } from 'octane';
import { interaction, load } from 'octane/hydration';
import { Composer } from './Composer.tsrx';
import { Conversation } from './Conversation.tsrx';
import { History } from './History.tsrx';
import { Tools } from './Tools.tsrx';
import { Metrics } from './Metrics.tsrx';
import './styles.css';

export function App({ eager = false }: { eager?: boolean } = {}) @{
	<div class="app" data-lab-shell data-activation={eager ? 'eager' : 'interaction'}>
		<a class="skip-link" href="#message">Skip to message</a>
		<aside class="rail">
			<a class="brand" href="/" aria-label="Signal Chat home">✳</a>
			<span class="rail-label">
				SIGNAL<br />CHAT
			</span>
			<span class="rail-bottom">
				SSR<br />LAB
			</span>
		</aside>
		<div class="workspace">
			<header class="masthead">
				<div>
					<p class="eyebrow">OCTANE / STREAMING LAB</p>
					<h1>
						Signal Chat
						<span class="beta">LOCAL</span>
					</h1>
				</div>
				<span class="mode">
					{eager ? 'Activate on load' : 'Activate on interaction'}
				</span>
			</header>
			<main class="layout">
				<aside class="sidebar">
					<Hydrate independent when={eager ? load() : interaction()}>
						<History />
					</Hydrate>
					<section class="settings" aria-label="Run configuration">
						<h2>Design a run</h2>
						<p class="panel-note">Choose data and timings for a new run.</p>
						<form method="get" action={eager ? '/eager' : '/'}>
							<label>
								Scenario<select name="scenario" defaultValue="steady">
									<option value="steady">Steady tokens</option>
									<option value="burst">Burst tokens</option>
									<option value="unicode">Unicode &amp; escaping</option>
									<option value="fail-before">Fail before first value</option>
									<option value="fail-after">Fail after partial answer</option>
									<option value="empty">Empty stream</option>
								</select>
							</label>
							<label>
								Session delay
								(ms)<input type="number" name="auth" min={0} max={2000} defaultValue={250} />
							</label>
							<label>
								Answer delay
								(ms)<input type="number" name="answer" min={0} max={2000} defaultValue={180} />
							</label>
							<label>
								History delay
								(ms)<input type="number" name="history" min={0} max={2000} defaultValue={600} />
							</label>
							<label>
								Between yields
								(ms)<input type="number" name="interval" min={0} max={2000} defaultValue={160} />
							</label>
							<label>
								Stream
								snapshots<input type="number" name="waves" min={1} max={64} defaultValue={8} />
							</label>
							<label>
								Total turns<input type="number" name="turns" min={1} max={200} defaultValue={4} />
							</label>
							<label>
								History
								rows<input
									type="number"
									name="historyRows"
									min={1}
									max={200}
									placeholder="Same as total turns"
								/>
							</label>
							<label>
								Shell hydration delay
								(ms)<input type="number" name="hydrateDelay" min={0} max={5000} defaultValue={0} />
							</label>
							<label>
								Initial
								prompt<input
									name="q"
									defaultValue="Explain how SSR streaming signals work."
									maxLength={4000}
								/>
							</label>
							<div class="run-actions">
								<button class="primary" type="submit" formAction="/">Run deferred</button>
								<button type="submit" formAction="/eager">Run eager</button>
							</div>
						</form>
					</section>
				</aside>
				<div class="chat-column">
					<div class="intro">
						<span class="badge">One application tree</span>
						<p>
							The server sends the shell, then each section's first value as HTML. Later values
							travel as signal data.
							{eager
								? ' Data panels activate on load.'
								: ' Activate a panel to adopt its original nodes and catch up.'}
						</p>
					</div>
					<Hydrate independent when={eager ? load() : interaction()}>
						<Conversation />
					</Hydrate>
					<Hydrate independent when={interaction()}>
						<Composer />
					</Hydrate>
				</div>
				<aside class="inspector">
					<Hydrate independent when={eager ? load() : interaction()}>
						<Tools />
					</Hydrate>
					<Hydrate independent when={load()}>
						<Metrics />
					</Hydrate>
					<section class="guide">
						<h2>Try this</h2>
						<ol>
							<li>Type while session data is pending.</li>
							<li>Watch the first HTML snapshot remain in a deferred panel.</li>
							<li>Activate it and watch it catch up.</li>
							<li>Send twice, stop, resume, or retry a failed producer.</li>
							<li>Export the browser and producer traces.</li>
						</ol>
						<p>Finite, deterministic generators. No model account or external API required.</p>
					</section>
				</aside>
			</main>
		</div>
	</div>
}

export function EagerApp() @{
	<App eager />
}
