// Page-side driver toolkit (runs in the browser page, installed on
// `globalThis.__x`): the shadow-piercing composed-DOM walk, arm/until/settle
// measurement primitives, and the FCP probe.
//
// Ported from the cross-framework harness in Huxpro/vue-lynx
// `packages/benchmark/core/driver-client.mjs` (branch
// claude/lynx-implementation-review-n2r0ie) so every framework cell — octane
// and the vendored references — is measured by the byte-identical instrument.
// Do not fork the predicates for one framework; that breaks the comparison.

export const DRIVER_CLIENT_JS = `(() => {
  const x = (globalThis.__x = {});

  // -- composed-tree walk (pierces shadow roots) -----------------------------
  const classOf = (el) => (el.getAttribute && el.getAttribute('class')) || '';
  const hasClass = (el, cls) => classOf(el).split(/\\s+/).includes(cls);

  const findByClass = (cls) => {
    const out = [];
    const walk = (node) => {
      if (!node) return;
      if (node.nodeType === 1) {
        if (hasClass(node, cls)) out.push(node);
        if (node.shadowRoot) walk(node.shadowRoot);
      }
      for (const child of node.childNodes || []) walk(child);
    };
    walk(document.body);
    return out;
  };
  x.findByClass = findByClass;

  x.findText = (needle) => {
    const walk = (node) => {
      if (!node) return false;
      if (node.nodeType === 3 && node.textContent.includes(needle)) return true;
      if (node.shadowRoot && walk(node.shadowRoot)) return true;
      for (const child of node.childNodes || []) if (walk(child)) return true;
      return false;
    };
    return walk(document.body);
  };

  // -- lynx-view attach ------------------------------------------------------
  x.createView = (bundleUrl, w = 800, h = 640) => {
    const view = document.createElement('lynx-view');
    view.setAttribute('url', bundleUrl);
    view.style.cssText = 'display:block;width:' + w + 'px;height:' + h + 'px;';
    x.viewAttachTime = performance.now();
    document.body.appendChild(view);
    return true;
  };

  // -- content count: workload-agnostic FCP signal ---------------------------
  const CONTENT_CLASSES = ['row', 'card', 'card-title', 'feed-title', 'col-label'];
  x.contentCount = () => {
    let n = 0;
    for (const cls of CONTENT_CLASSES) n += findByClass(cls).length;
    return n;
  };

  // -- table predicates ------------------------------------------------------
  let rowsEl = null;
  const rows = () => {
    if (!rowsEl || !rowsEl.isConnected) rowsEl = findByClass('rows')[0] ?? null;
    return rowsEl;
  };
  const rowEls = () => {
    const container = rows();
    if (!container) return [];
    const out = [];
    // Element Templates mount keyed content into layout-transparent <wrapper>
    // placeholders — rows are then grandchildren of the container. Descend
    // through wrapper tags only, so per-frame polling stays a shallow walk.
    const walk = (parent) => {
      for (const child of parent.children) {
        if (hasClass(child, 'row')) out.push(child);
        else if (/wrapper/i.test(child.tagName || '')) walk(child);
      }
    };
    walk(container);
    return out;
  };
  x.rowCount = () => (rows() ? rowEls().length : -1);
  const cellOf = (rowEl, cls) => {
    for (const child of rowEl.children) if (hasClass(child, cls)) return child;
    return null;
  };
  x.labelAt = (i) => {
    const r = rowEls()[i];
    return r ? cellOf(r, 'col-label')?.textContent ?? null : null;
  };
  x.dangerAt = (i) => {
    const r = rowEls()[i];
    return r ? hasClass(r, 'danger') : false;
  };

  // -- semantic checksum ----------------------------------------------------
  const hashText = (seed, text) => {
    let hash = seed >>> 0;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash;
  };
  x.tableOracle = () => {
    const current = rowEls();
    let checksum = 2166136261;
    for (const row of current) {
      const id = cellOf(row, 'col-id')?.textContent ?? '';
      const label = cellOf(row, 'col-label')?.textContent ?? '';
      checksum = hashText(checksum, id + '\\u0000' + label + '\\u0000' + classOf(row));
    }
    return { rows: current.length, checksum };
  };

  // -- click geometry --------------------------------------------------------
  x.buttonRect = (label) => {
    for (const el of findByClass('btn-text')) {
      if (el.textContent === label) {
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  };
  x.cellRect = (rowIndex, cls) => {
    const r = rowEls()[rowIndex];
    const cell = r && cellOf(r, cls);
    if (!cell) return null;
    const rect = cell.getBoundingClientRect();
    return { x: rect.x + Math.min(20, rect.width / 2), y: rect.y + rect.height / 2 };
  };

  // -- predicates ------------------------------------------------------------
  const checkPredicate = (spec) => {
    switch (spec.type) {
      case 'rowCount': return x.rowCount() === spec.value;
      case 'labelAt': return x.labelAt(spec.index) === spec.equals;
      case 'dangerAt': return x.dangerAt(spec.index);
      case 'checksumNot': return x.tableOracle().checksum !== spec.value;
      case 'contentAtLeast': return x.contentCount() >= spec.value;
      default: throw new Error('unknown predicate ' + spec.type);
    }
  };

  // -- measurement primitives ------------------------------------------------
  x.arm = (spec, timeoutMs) =>
    new Promise((resolve, reject) => {
      let t0 = null;
      const onDown = () => { t0 = performance.now(); };
      window.addEventListener('pointerdown', onDown, { capture: true, once: true });
      const deadline = performance.now() + (timeoutMs ?? 120000);
      const tick = () => {
        if (t0 != null && checkPredicate(spec)) { resolve({ ms: performance.now() - t0 }); return; }
        if (performance.now() > deadline) {
          window.removeEventListener('pointerdown', onDown, { capture: true });
          reject(new Error('predicate timeout: ' + JSON.stringify(spec) + ' rowCount=' + x.rowCount()));
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

  x.until = (spec, timeoutMs = 120000) =>
    new Promise((resolve, reject) => {
      const deadline = performance.now() + timeoutMs;
      const tick = () => {
        if (checkPredicate(spec)) return resolve(true);
        if (performance.now() > deadline) return reject(new Error('until timeout: ' + JSON.stringify(spec)));
        requestAnimationFrame(tick);
      };
      tick();
    });

  x.settle = (extraMs = 30) =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, extraMs))));

  // -- FCP + settled ---------------------------------------------------------
  // From viewAttachTime, poll the composed tree per animation frame. FCP =
  // first frame with contentCount >= minContent; settled = content count then
  // stable for idleMs. Hard timeout aborts as DNF.
  x.fcp = (opts = {}) => {
    const minContent = opts.minContent ?? 5;
    const idleMs = opts.idleMs ?? 400;
    const timeoutMs = opts.timeoutMs ?? 120000;
    return new Promise((resolve) => {
      const t0 = x.viewAttachTime ?? performance.now();
      const deadline = performance.now() + timeoutMs;
      let fcp = null;
      let fcpEpoch = null;
      let lastCount = -1;
      let lastChange = performance.now();
      const tick = () => {
        const now = performance.now();
        const c = x.contentCount();
        if (fcp == null && c >= minContent) {
          fcp = now - t0;
          fcpEpoch = performance.timeOrigin + now;
        }
        if (c !== lastCount) { lastCount = c; lastChange = now; }
        if (fcp != null && now - lastChange >= idleMs) {
          resolve({ fcp, fcpEpoch, settled: lastChange - t0, finalCount: c, dnf: false });
          return;
        }
        if (now > deadline) {
          resolve({ fcp, fcpEpoch, settled: null, finalCount: c, dnf: true });
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };
})()`;

// Page-side MessagePort accounting. It observes the same Web Core RPC boundary
// as the shared cross-framework runner and records only JSON-equivalent bytes;
// no payload is cloned, retained, or rewritten by the probe.
export const WIRE_INSTRUMENT_JS = `(() => {
  const stats = {
    // Web Core direction names: page/main-thread-script -> background thread,
    // then background thread -> page/main-thread-script.
    toBts: { messages: 0, bytes: 0, byName: {} },
    toMts: { messages: 0, bytes: 0, byName: {} },
  };
  const encoder = new TextEncoder();
  const sizeOf = (data) => {
    try {
      const json = JSON.stringify(data, (_key, value) => {
        if (value instanceof ArrayBuffer) return { $arrayBuffer: value.byteLength };
        if (ArrayBuffer.isView(value)) return { $arrayBufferView: value.byteLength };
        if (typeof value === 'function') return '$function';
        return value;
      });
      return json ? encoder.encode(json).length : 0;
    } catch {
      return -1;
    }
  };
  const record = (side, data) => {
    const bytes = sizeOf(data);
    const name = data && typeof data === 'object' && 'name' in data ? String(data.name) : '$raw';
    side.messages++;
    if (bytes > 0) side.bytes += bytes;
    const endpoint = side.byName[name] ?? (side.byName[name] = { messages: 0, bytes: 0 });
    endpoint.messages++;
    if (bytes > 0) endpoint.bytes += bytes;
  };
  globalThis.__OCTANE_STAGE_WIRE__ = () => structuredClone(stats);
  const postMessage = MessagePort.prototype.postMessage;
  MessagePort.prototype.postMessage = function (data, ...rest) {
    record(stats.toBts, data);
    return postMessage.call(this, data, ...rest);
  };
  const descriptor = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
  if (descriptor?.get && descriptor.set) {
    Object.defineProperty(MessagePort.prototype, 'onmessage', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get() { return descriptor.get.call(this); },
      set(listener) {
        if (typeof listener !== 'function') return descriptor.set.call(this, listener);
        return descriptor.set.call(this, function (event) {
          record(stats.toMts, event.data);
          return listener.call(this, event);
        });
      },
    });
  }
})()`;

/** Build the bench host HTML that loads web-core and installs the driver. */
export function makeBenchHtml({
	clientJs = '/webcore/static/js/client.js',
	clientCss = '/webcore/static/css/client.css',
	instrumentJs = '',
} = {}) {
	return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script>${instrumentJs}</script>
  <script type="module" src="${clientJs}"></script>
  <link rel="stylesheet" href="${clientCss}">
  <style>html,body{margin:0;padding:0}</style>
</head>
<body>
<script>${DRIVER_CLIENT_JS}</script>
</body>
</html>`;
}

// Neutralize @lynx-js/web-core's always-on lynx.profile shim, for native
// parity. On native Lynx the profiling API is a no-op unless a tracing session
// is active; web-core's shim instead maps every call onto performance.mark()/
// measure() and never clears the measure entries, so the timeline grows without
// bound and frameworks that profile per rendered snapshot (ReactLynx does)
// degrade superlinearly in a way that does not exist on native runtimes. The
// patch no-ops only `lynx.profile:`-prefixed entries and is applied identically
// to every framework cell.
export const NEUTRALIZE_LYNX_PROFILE = `(() => {
  const P = globalThis.Performance && globalThis.Performance.prototype;
  if (!P || P.__lynxProfileNeutralized) return;
  P.__lynxProfileNeutralized = true;
  const isProf = (n) => typeof n === 'string' && n.startsWith('lynx.profile:');
  for (const k of ['mark', 'clearMarks']) {
    const orig = P[k];
    P[k] = function (name, ...rest) {
      if (isProf(name)) return undefined;
      return orig.call(this, name, ...rest);
    };
  }
  const origMeasure = P.measure;
  P.measure = function (name, ...rest) {
    if (isProf(name) || (typeof rest[0] === 'string' && isProf(rest[0]))
      || (rest[0] && typeof rest[0] === 'object' && isProf(rest[0].start))) {
      return undefined;
    }
    return origMeasure.call(this, name, ...rest);
  };
})()`;

/** Apply the neutralization to a Playwright page and its (future) workers. */
export async function applyNeutralize(page) {
	await page.addInitScript(NEUTRALIZE_LYNX_PROFILE);
	page.on('worker', (w) => w.evaluate(NEUTRALIZE_LYNX_PROFILE).catch(() => {}));
}

export const OBSERVE_LYNX_MT_SLICE_LOAD = `(() => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
  if (!descriptor?.get || !descriptor?.set) return;
  Object.defineProperty(HTMLScriptElement.prototype, 'src', {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(value) {
      if (
        globalThis.location?.href === 'about:srcdoc'
        && typeof value === 'string'
        && value.startsWith('blob:')
        && globalThis.__OCTANE_LYNX_MT_SLICE_LOAD_START_EPOCH__ === undefined
      ) {
        globalThis.__OCTANE_LYNX_MT_SLICE_LOAD_START_EPOCH__ =
          performance.timeOrigin + performance.now();
      }
      return descriptor.set.call(this, value);
    },
  });
})()`;

export async function applyStageClock(page) {
	await page.addInitScript(OBSERVE_LYNX_MT_SLICE_LOAD);
}

/** min/max/mean/median/std/ci95 over a numeric array (nulls/NaN dropped). */
export function stats(values) {
	const clean = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
	if (clean.length === 0) return null;
	const sorted = [...clean].sort((a, b) => a - b);
	const n = sorted.length;
	const mean = sorted.reduce((a, b) => a + b, 0) / n;
	const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
	const std = Math.sqrt(sorted.map((v) => (v - mean) ** 2).reduce((a, b) => a + b, 0) / n);
	return {
		n,
		min: sorted[0],
		max: sorted[n - 1],
		mean,
		median,
		std,
		ci95: 1.96 * (std / Math.sqrt(n)),
	};
}
