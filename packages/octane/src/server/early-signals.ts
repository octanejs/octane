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
import {
	EARLY_FORM_SUBMISSIONS_KEY,
	EARLY_FORM_SUBMISSIONS_LIMIT,
	EARLY_FORM_SUBMISSIONS_TIMEOUT_MS,
	FORM_SUBMISSION_ATTR,
} from '../form-submission.js';

export interface EarlySignalBootstrapOptions {
	readonly nonce?: string;
	/** Include native intent capture for independently activated widgets. */
	readonly independentHydration?: boolean;
	/** Capture native submissions only for forms naming a behavior with data-octane-capture-submit. */
	readonly formSubmissions?: boolean;
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
		streamedSignalBootstrapJs(options.independentHydration, options.formSubmissions) +
		'</script>'
	);
}

let STREAMED_SIGNAL_BOOTSTRAP_JS: string | undefined;
let STREAMED_SIGNAL_INDEPENDENT_BOOTSTRAP_JS: string | undefined;
let STREAMED_SIGNAL_FORM_BOOTSTRAP_JS: string | undefined;
let STREAMED_SIGNAL_INDEPENDENT_FORM_BOOTSTRAP_JS: string | undefined;
let INDEPENDENT_HYDRATION_BOOTSTRAP_JS: string | undefined;
let FORM_SUBMISSION_BOOTSTRAP_JS: string | undefined;
/** @internal Shared byte-identical bootstrap for buffered and streaming renderers. */
export function streamedSignalBootstrapJs(
	independentHydration = false,
	formSubmissions = false,
): string {
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
	if (!independentHydration) {
		return formSubmissions
			? (STREAMED_SIGNAL_FORM_BOOTSTRAP_JS ??= signals + formSubmissionBootstrapJs())
			: signals;
	}
	const independent = (INDEPENDENT_HYDRATION_BOOTSTRAP_JS ??=
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
		'function c(e){var t=e.target;if(!t||!t.closest)return;' +
		'if(e.type==="click"){var sm=d[' +
		JSON.stringify(EARLY_FORM_SUBMISSIONS_KEY) +
		'];if(sm){var sc=Element.prototype.closest.call(t,"button,input"),sf=sc&&sc.form;' +
		'if(sc&&(sc.localName==="button"?sc.type==="submit":sc.type==="submit"||sc.type==="image")&&sf&&Element.prototype.getAttribute.call(sf,' +
		JSON.stringify(FORM_SUBMISSION_ATTR) +
		'))return;}}' +
		'var b=t.closest(is);' +
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
	return formSubmissions
		? (STREAMED_SIGNAL_INDEPENDENT_FORM_BOOTSTRAP_JS ??=
				signals + formSubmissionBootstrapJs() + independent)
		: (STREAMED_SIGNAL_INDEPENDENT_BOOTSTRAP_JS ??= signals + independent);
}

function formSubmissionBootstrapJs(): string {
	return (FORM_SUBMISSION_BOOTSTRAP_JS ??=
		'(function(d,g){var k=' +
		JSON.stringify(EARLY_FORM_SUBMISSIONS_KEY) +
		';if(d[k])return;var w=d.defaultView||g,F=w.FormData||FormData,B=w.File||File,' +
		'E=w.Element||Element,H=w.HTMLFormElement||HTMLFormElement,' +
		'ga=E.prototype.getAttribute,fp=H.prototype,a=' +
		JSON.stringify(FORM_SUBMISSION_ATTR) +
		',hk=' +
		JSON.stringify(EARLY_HYDRATION_INTENTS_KEY) +
		',is="[' +
		HYDRATE_INDEPENDENT_ATTR +
		']",ia=' +
		JSON.stringify(HYDRATE_ID_ATTR) +
		',ls=new Map,rs=new WeakMap,seen=new WeakSet,dead=false,depth=0,flushing=false;' +
		'function attr(e,n){return ga.call(e,n);}function prop(f,n){return Object.getOwnPropertyDescriptor(fp,n).get.call(f);}' +
		'function current(r){return r.event.target===r.form&&r.form.ownerDocument===d&&r.form.isConnected&&r.form.parentElement===r.parent&&attr(r.form,a)===r.key&&' +
		'E.prototype.closest.call(r.form,is)===r.boundary&&(!r.boundary||attr(r.boundary,ia)===r.boundaryId);}' +
		'function clearActivations(f,e){var h=d[hk],q=h&&h.q;if(!q)return;for(var i=q.length-1;i>=0;i--){var p=q[i];' +
		'if(p[8]===true&&seen.has(p[0])&&(!f||p[1]===f)&&(!e||p[0]===e))q.splice(i,1);}}' +
		// Activation is retained separately from command custody: a behavior root
		// can consume the fields before independent hydration imports its bridge.
		'function activate(r){if(u.activate){u.activate(r);return;}if(!current(r))return;var f=r.form,b=r.boundary;if(!b)return;var id=r.boundaryId,when=attr(b,"' +
		HYDRATE_WHEN_ATTR +
		'"),h=d[hk];if(id===null||(when!=="interaction"&&when!=="dynamic")||!h||h.claimed||h.q.length>=' +
		EARLY_HYDRATION_INTENTS_LIMIT +
		')return;h.q.push([r.event,f,b,id,when,attr(b,"' +
		HYDRATE_INTERACTION_EVENTS_ATTR +
		'"),undefined,undefined,true]);}' +
		'function clear(f){var l=ls.get(f);if(l){clearTimeout(l.timer);ls.delete(f);}}' +
		'function prune(f){for(var i=0;i<u.q.length;i++)if(u.q[i].form===f)return;clear(f);}' +
		'function release(f){if(!f){var fs=[];ls.forEach(function(l,x){fs.push(x);});for(var j=0;j<fs.length;j++)release(fs[j]);return;}' +
		'var l=ls.get(f);rs.set(f,l?l.key:attr(f,a));clear(f);clearActivations(f);for(var i=u.q.length-1;i>=0;i--)if(u.q[i].form===f)u.q.splice(i,1);}' +
		'var u=d[k]={version:1,q:[],captures:function(f){var key=attr(f,a);return !dead&&f.ownerDocument===d&&f.isConnected&&!!key&&rs.get(f)!==key;},' +
		'has:function(e){return seen.has(e);},release:release,flush:function(){if(dead||depth||flushing||!u.receive)return;flushing=true;' +
		'try{for(var i=0;i<u.q.length;){if(!u.receive)break;var r=u.q[i];if(!r.snapshot){i++;continue;}if(!current(r)){u.q.splice(i,1);clearActivations(r.form,r.event);prune(r.form);continue;}' +
		'var accepted;try{accepted=u.receive(r);}catch(error){release(r.form);throw error;}' +
		'if(accepted){if(r.discarded)clearActivations(r.form,r.event);var at=u.q.indexOf(r);if(at!==-1)u.q.splice(at,1);prune(r.form);}else if(u.q[i]===r)i++;}}finally{flushing=false;}},' +
		'stop:function(){if(dead)return;dead=true;d.removeEventListener("submit",capture,true);w.removeEventListener&&w.removeEventListener("pagehide",stop);' +
		'ls.forEach(function(l){clearTimeout(l.timer);});ls.clear();clearActivations();u.q.length=0;u.receive=undefined;u.activate=undefined;}};' +
		'function stop(){u.stop();}function capture(e){var f=e.target;if(!f||!e.cancelable||e.defaultPrevented||!(f instanceof H)||!u.captures(f))return;' +
		'if(u.q.length>=' +
		EARLY_FORM_SUBMISSIONS_LIMIT +
		'){u.overflow=true;u.stop();return;}var key=attr(f,a),l=ls.get(f);' +
		'if(l&&l.key!==key){clear(f);clearActivations(f);for(var j=u.q.length-1;j>=0;j--)if(u.q[j].form===f)u.q.splice(j,1);l=null;}' +
		'if(!l){l={key:key,timer:setTimeout(function(){release(f);},' +
		EARLY_FORM_SUBMISSIONS_TIMEOUT_MS +
		')};ls.set(f,l);}var b=E.prototype.closest.call(f,is),r={event:e,form:f,key:key,parent:f.parentElement,boundary:b,boundaryId:b?attr(b,ia):null,snapshot:undefined};' +
		'u.q.push(r);seen.add(e);e.preventDefault();depth++;' +
		'try{var s=e.submitter||null,fields=[],fm=Object.freeze({id:attr(f,"id")||"",action:prop(f,"action"),method:prop(f,"method"),' +
		'enctype:prop(f,"enctype"),target:prop(f,"target"),noValidate:prop(f,"noValidate")}),sm=s?Object.freeze({id:attr(s,"id")||"",name:s.name,value:s.value,type:s.type,' +
		'formAction:attr(s,"formaction"),formMethod:attr(s,"formmethod"),formEnctype:attr(s,"formenctype"),formTarget:attr(s,"formtarget"),formNoValidate:attr(s,"formnovalidate")!==null}):null,' +
		'data=s?new F(f,s):new F(f);data.forEach(function(v,n){if(typeof v!=="string")v=Object.freeze(new B([v],v.name,{type:v.type,lastModified:v.lastModified}));' +
		'fields.push(Object.freeze([n,v]));});' +
		'r.snapshot=Object.freeze({fields:Object.freeze(fields),form:fm,submitter:sm});' +
		'activate(r);}catch(error){release(f);throw error;}finally{depth--;u.flush();}}' +
		'd.addEventListener("submit",capture,true);if(w.addEventListener)w.addEventListener("pagehide",stop);})(document,globalThis);');
}
