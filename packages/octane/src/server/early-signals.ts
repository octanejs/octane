import {
	HYDRATE_ID_ATTR,
	HYDRATE_WHEN_ATTR,
	HYDRATE_INDEPENDENT_ATTR,
	SIGNAL_CONTROL_ATTR,
	STREAM_SCRIPT_ATTR,
} from '../constants.js';
import {
	EARLY_HYDRATION_INTENTS_KEY,
	EARLY_HYDRATION_INTENTS_LIMIT,
	HYDRATE_DEFAULT_INTERACTION_EVENTS,
	HYDRATE_INTERACTION_EVENTS_ATTR,
	HYDRATE_NATIVE_DEFAULT_INTERACTION_EVENTS,
	HYDRATE_SELECTION_ATTR,
	HYDRATE_SUPPORTED_INTERACTION_EVENTS,
} from '../hydration/interaction-config.js';

export interface EarlySignalBootstrapOptions {
	readonly nonce?: string;
	/** Include native intent capture for independently activated widgets. */
	readonly independentHydration?: boolean;
}

/**
 * Install the framework's renderer-free input and streaming mailboxes before
 * exposing interactive HTML. Envelope-owning hosts emit this once and pass
 * earlySignalBootstrap: 'external' to each fragment renderer. This does not
 * import, preload or activate client modules, nor install application policy.
 */
export function earlySignalBootstrapScript(options: EarlySignalBootstrapOptions = {}): string {
	const nonce =
		options.nonce === undefined
			? ''
			: ' nonce="' +
				options.nonce
					.replace(/&/g, '&amp;')
					.replace(/"/g, '&quot;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;') +
				'"';
	return (
		'<script ' +
		STREAM_SCRIPT_ATTR +
		nonce +
		'>' +
		streamedSignalBootstrapJs(options.independentHydration) +
		'</script>'
	);
}

let STREAMED_SIGNAL_BOOTSTRAP_JS: string | undefined;
let STREAMED_SIGNAL_INDEPENDENT_BOOTSTRAP_JS: string | undefined;
/** @internal Shared byte-identical bootstrap for buffered and streaming renderers. */
export function streamedSignalBootstrapJs(independentHydration = false): string {
	const signals = (STREAMED_SIGNAL_BOOTSTRAP_JS ??=
		'(function(g){var z="__octaneStreamedSignalSelections",v=g[z];' +
		'if(!v){var a=[];g[z]={version:1,identities:a,register:function(i){' +
		'if(a.length>=256){this.overflow=true;return;}a.push(i);}};}' +
		'var k="__octaneStreamedRenderer",e=g[k];if(e)return;' +
		'var q=[];g[k]={version:1,frames:q,receive:function(f){' +
		'if(q.length>=512){this.overflow=true;return;}q.push(f);}};' +
		'var s=g.__octaneEarlySignalControls||(g.__octaneEarlySignalControls={q:[],n:0});' +
		'if(!s.l){s.l=1;document.addEventListener("input",function(e){var t=e.target;' +
		'if(!t||!t.getAttribute||!t.getAttribute("' +
		SIGNAL_CONTROL_ATTR +
		'"))return;var r=++s.n,p=g.__octanePublishSignalControl;if(p){p(t,r);return;}' +
		'for(var i=0;i<s.q.length;i++)if(s.q[i][0]===t){s.q[i]=[t,r];return;}' +
		'if(s.q.length<256)s.q.push([t,r]);},true);}})(globalThis);');
	if (!independentHydration) return signals;
	return (STREAMED_SIGNAL_INDEPENDENT_BOOTSTRAP_JS ??=
		signals +
		// A completed client build can contain its first independent widget only
		// in a later streamed wave. Capture its intent before module evaluation,
		// with no activation dependency on its parent or sidecar being present.
		'(function(d){var h=' +
		JSON.stringify(EARLY_HYDRATION_INTENTS_KEY) +
		';if(d[h])return;' +
		'var u=d[h]={version:1,q:[]},es=' +
		JSON.stringify(HYDRATE_SUPPORTED_INTERACTION_EVENTS) +
		',ds=' +
		JSON.stringify(HYDRATE_DEFAULT_INTERACTION_EVENTS) +
		',ns=' +
		JSON.stringify(HYDRATE_NATIVE_DEFAULT_INTERACTION_EVENTS) +
		',is="[' +
		HYDRATE_INDEPENDENT_ATTR +
		']",ms="[' +
		HYDRATE_ID_ATTR +
		']";' +
		'function c(e){var t=e.target;if(!t||!t.closest)return;var b=t.closest(is);' +
		'if(!b)return;var id=b.getAttribute("' +
		HYDRATE_ID_ATTR +
		'");if(id===null)return;' +
		'var w=b.getAttribute("' +
		HYDRATE_WHEN_ATTR +
		'"),a=b.getAttribute("' +
		HYDRATE_INTERACTION_EVENTS_ATTR +
		'");' +
		'if(w===null||w==="never")return;var link=t.closest("a[href],area[href]");if(link&&b.contains(link))return;' +
		'if((e.type==="pointerenter"||e.type==="mouseenter")&&d.elementFromPoint){' +
		'var hit=d.elementFromPoint(e.clientX,e.clientY),nested=hit&&hit.closest(is);if(nested&&nested!==b&&b.contains(nested))return;}' +
		'var m=t.closest(ms),ok=false;while(m){var x=m.getAttribute("' +
		HYDRATE_WHEN_ATTR +
		'"),' +
		'y=m.getAttribute("' +
		HYDRATE_INTERACTION_EVENTS_ATTR +
		'");' +
		'if(x==="dynamic"&&e.type==="click"||x==="interaction"&&(y===null?ds:y.split(/\\s+/)).indexOf(e.type)!==-1)ok=true;' +
		'if(m===b)break;m=m.parentElement&&m.parentElement.closest(ms);}if(!ok)return;' +
		'var c=null,g=null,p=u.q[u.q.length-1];if(e.type==="click"&&e.button===0&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){' +
		'c=t.closest("button[' +
		HYDRATE_SELECTION_ATTR +
		']");if(c&&c.type==="button"&&c.closest(is)===b)g=c.getAttribute("' +
		HYDRATE_SELECTION_ATTR +
		'");}var v=g?[e,t,b,id,w,a,c,g]:[e,t,b,id,w,a];' +
		'if(g&&p&&p[2]===b&&p[7]===g&&p[6].isConnected&&p[6].contains(p[1])&&p[6].type==="button"&&p[6].getAttribute("' +
		HYDRATE_SELECTION_ATTR +
		'")===g){u.q[u.q.length-1]=v;}else{if(u.q.length>=' +
		EARLY_HYDRATION_INTENTS_LIMIT +
		'){u.overflow=true;u.q.length=0;u.stop();return;}' +
		'u.q.push(v);}if(e.bubbles){if(e.cancelable&&ns.indexOf(e.type)===-1)e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}}' +
		'u.stop=function(){for(var i=0;i<es.length;i++)d.removeEventListener(es[i],c,true);u.stop=null;};' +
		'for(var j=0;j<es.length;j++)d.addEventListener(es[j],c,true);})(document);');
}
