"use client";
import { jsx as ae } from "react/jsx-runtime";
import { useState as Q, useCallback as re, useId as mt, useLayoutEffect as Ke, useEffect as me, useRef as O, createContext as gt, useImperativeHandle as Xe, useMemo as Se, useSyncExternalStore as qe, useContext as yt } from "react";
function St(e, t) {
  const n = getComputedStyle(e), o = parseFloat(n.fontSize);
  return t * o;
}
function vt(e, t) {
  const n = getComputedStyle(e.ownerDocument.documentElement), o = parseFloat(n.fontSize);
  return t * o;
}
function bt(e) {
  return e / 100 * window.innerHeight;
}
function zt(e) {
  return e / 100 * window.innerWidth;
}
function xt(e) {
  switch (typeof e) {
    case "number":
      return [e, "px"];
    case "string": {
      const t = parseFloat(e);
      return e.endsWith("%") ? [t, "%"] : e.endsWith("px") ? [t, "px"] : e.endsWith("rem") ? [t, "rem"] : e.endsWith("em") ? [t, "em"] : e.endsWith("vh") ? [t, "vh"] : e.endsWith("vw") ? [t, "vw"] : [t, "%"];
    }
  }
}
function ie({
  groupSize: e,
  panelElement: t,
  styleProp: n
}) {
  let o;
  const [i, s] = xt(n);
  switch (s) {
    case "%": {
      o = i / 100 * e;
      break;
    }
    case "px": {
      o = i;
      break;
    }
    case "rem": {
      o = vt(t, i);
      break;
    }
    case "em": {
      o = St(t, i);
      break;
    }
    case "vh": {
      o = bt(i);
      break;
    }
    case "vw": {
      o = zt(i);
      break;
    }
  }
  return o;
}
function T(e) {
  return parseFloat(e.toFixed(3));
}
function ne({
  group: e
}) {
  const { orientation: t, panels: n } = e;
  return n.reduce((o, i) => (o += t === "horizontal" ? i.element.offsetWidth : i.element.offsetHeight, o), 0);
}
function ve(e) {
  const { panels: t } = e, n = ne({ group: e });
  return n === 0 ? t.map((o) => ({
    groupResizeBehavior: o.panelConstraints.groupResizeBehavior,
    collapsedSize: 0,
    collapsible: o.panelConstraints.collapsible === !0,
    defaultSize: void 0,
    disabled: o.panelConstraints.disabled,
    minSize: 0,
    maxSize: 100,
    panelId: o.id
  })) : t.map((o) => {
    const { element: i, panelConstraints: s } = o;
    let u = 0;
    if (s.collapsedSize !== void 0) {
      const c = ie({
        groupSize: n,
        panelElement: i,
        styleProp: s.collapsedSize
      });
      u = T(c / n * 100);
    }
    let a;
    if (s.defaultSize !== void 0) {
      const c = ie({
        groupSize: n,
        panelElement: i,
        styleProp: s.defaultSize
      });
      a = T(c / n * 100);
    }
    let r = 0;
    if (s.minSize !== void 0) {
      const c = ie({
        groupSize: n,
        panelElement: i,
        styleProp: s.minSize
      });
      r = T(c / n * 100);
    }
    let l = 100;
    if (s.maxSize !== void 0) {
      const c = ie({
        groupSize: n,
        panelElement: i,
        styleProp: s.maxSize
      });
      l = T(c / n * 100);
    }
    return {
      groupResizeBehavior: s.groupResizeBehavior,
      collapsedSize: u,
      collapsible: s.collapsible === !0,
      defaultSize: a,
      disabled: s.disabled,
      minSize: r,
      maxSize: l,
      panelId: o.id
    };
  });
}
function C(e, t = "Assertion error") {
  if (!e)
    throw Error(t);
}
function be(e, t) {
  return Array.from(t).sort(
    e === "horizontal" ? Pt : wt
  );
}
function Pt(e, t) {
  const n = e.element.offsetLeft - t.element.offsetLeft;
  return n !== 0 ? n : e.element.offsetWidth - t.element.offsetWidth;
}
function wt(e, t) {
  const n = e.element.offsetTop - t.element.offsetTop;
  return n !== 0 ? n : e.element.offsetHeight - t.element.offsetHeight;
}
function Ye(e) {
  return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.ELEMENT_NODE;
}
function Je(e, t) {
  return {
    x: e.x >= t.left && e.x <= t.right ? 0 : Math.min(
      Math.abs(e.x - t.left),
      Math.abs(e.x - t.right)
    ),
    y: e.y >= t.top && e.y <= t.bottom ? 0 : Math.min(
      Math.abs(e.y - t.top),
      Math.abs(e.y - t.bottom)
    )
  };
}
function Lt({
  orientation: e,
  rects: t,
  targetRect: n
}) {
  const o = {
    x: n.x + n.width / 2,
    y: n.y + n.height / 2
  };
  let i, s = Number.MAX_VALUE;
  for (const u of t) {
    const { x: a, y: r } = Je(o, u), l = e === "horizontal" ? a : r;
    l < s && (s = l, i = u);
  }
  return C(i, "No rect found"), i;
}
let fe;
function Ct() {
  return fe === void 0 && (typeof matchMedia == "function" ? fe = !!matchMedia("(pointer:coarse)").matches : fe = !1), fe;
}
function Ze(e) {
  const { element: t, orientation: n, panels: o, separators: i } = e, s = be(
    n,
    Array.from(t.children).filter(Ye).map((z) => ({ element: z }))
  ).map(({ element: z }) => z), u = [];
  let a = !1, r = !1, l = -1, c = -1, m = 0, p, S = [];
  {
    let z = -1;
    for (const f of s)
      f.hasAttribute("data-panel") && (z++, f.hasAttribute("data-disabled") || (m++, l === -1 && (l = z), c = z));
  }
  if (m > 1) {
    let z = -1;
    for (const f of s)
      if (f.hasAttribute("data-panel")) {
        z++;
        const d = o.find(
          (h) => h.element === f
        );
        if (d) {
          if (p) {
            const h = p.element.getBoundingClientRect(), y = f.getBoundingClientRect();
            let b;
            if (r) {
              const v = n === "horizontal" ? new DOMRect(
                h.right,
                h.top,
                0,
                h.height
              ) : new DOMRect(
                h.left,
                h.bottom,
                h.width,
                0
              ), g = n === "horizontal" ? new DOMRect(y.left, y.top, 0, y.height) : new DOMRect(y.left, y.top, y.width, 0);
              switch (S.length) {
                case 0: {
                  b = [
                    v,
                    g
                  ];
                  break;
                }
                case 1: {
                  const w = S[0], M = Lt({
                    orientation: n,
                    rects: [h, y],
                    targetRect: w.element.getBoundingClientRect()
                  });
                  b = [
                    w,
                    M === h ? g : v
                  ];
                  break;
                }
                default: {
                  b = S;
                  break;
                }
              }
            } else
              S.length ? b = S : b = [
                n === "horizontal" ? new DOMRect(
                  h.right,
                  y.top,
                  y.left - h.right,
                  y.height
                ) : new DOMRect(
                  y.left,
                  h.bottom,
                  y.width,
                  y.top - h.bottom
                )
              ];
            for (const v of b) {
              let g = "width" in v ? v : v.element.getBoundingClientRect();
              const w = Ct() ? e.resizeTargetMinimumSize.coarse : e.resizeTargetMinimumSize.fine;
              if (g.width < w) {
                const L = w - g.width;
                g = new DOMRect(
                  g.x - L / 2,
                  g.y,
                  g.width + L,
                  g.height
                );
              }
              if (g.height < w) {
                const L = w - g.height;
                g = new DOMRect(
                  g.x,
                  g.y - L / 2,
                  g.width,
                  g.height + L
                );
              }
              const M = z <= l || z > c;
              !a && !M && u.push({
                group: e,
                groupSize: ne({ group: e }),
                panels: [p, d],
                separator: "width" in v ? void 0 : v,
                rect: g
              }), a = !1;
            }
          }
          r = !1, p = d, S = [];
        }
      } else if (f.hasAttribute("data-separator")) {
        f.ariaDisabled !== null && (a = !0);
        const d = i.find(
          (h) => h.element === f
        );
        d ? S.push(d) : (p = void 0, S = []);
      } else
        r = !0;
  }
  return u;
}
class Qe {
  #e = {};
  addListener(t, n) {
    const o = this.#e[t];
    return o === void 0 ? this.#e[t] = [n] : o.includes(n) || o.push(n), () => {
      this.removeListener(t, n);
    };
  }
  emit(t, n) {
    const o = this.#e[t];
    if (o !== void 0)
      if (o.length === 1)
        o[0].call(null, n);
      else {
        let i = !1, s = null;
        const u = Array.from(o);
        for (let a = 0; a < u.length; a++) {
          const r = u[a];
          try {
            r.call(null, n);
          } catch (l) {
            s === null && (i = !0, s = l);
          }
        }
        if (i)
          throw s;
      }
  }
  removeAllListeners() {
    this.#e = {};
  }
  removeListener(t, n) {
    const o = this.#e[t];
    if (o !== void 0) {
      const i = o.indexOf(n);
      i >= 0 && o.splice(i, 1);
    }
  }
}
let ee = {
  cursorFlags: 0,
  state: "inactive"
};
const ze = new Qe();
function B() {
  return ee;
}
function Rt(e) {
  return ze.addListener("change", e);
}
function Mt(e) {
  const t = ee, n = { ...ee };
  n.cursorFlags = e, ee = n, ze.emit("change", {
    prev: t,
    next: n
  });
}
function te(e) {
  const t = ee;
  ee = e, ze.emit("change", {
    prev: t,
    next: e
  });
}
const Et = (e) => e, ye = () => {
}, et = 1, tt = 2, nt = 4, ot = 8, Ie = 3, ke = 12;
let de;
function De() {
  return de === void 0 && (de = !1, typeof window < "u" && (window.navigator.userAgent.includes("Chrome") || window.navigator.userAgent.includes("Firefox")) && (de = !0)), de;
}
function It({
  cursorFlags: e,
  groups: t,
  state: n
}) {
  let o = 0, i = 0;
  switch (n) {
    case "active":
    case "hover":
      t.forEach((s) => {
        if (!s.mutableState.disableCursor)
          switch (s.orientation) {
            case "horizontal": {
              o++;
              break;
            }
            case "vertical": {
              i++;
              break;
            }
          }
      });
  }
  if (!(o === 0 && i === 0)) {
    switch (n) {
      case "active": {
        if (e && De()) {
          const s = (e & et) !== 0, u = (e & tt) !== 0, a = (e & nt) !== 0, r = (e & ot) !== 0;
          if (s)
            return a ? "se-resize" : r ? "ne-resize" : "e-resize";
          if (u)
            return a ? "sw-resize" : r ? "nw-resize" : "w-resize";
          if (a)
            return "s-resize";
          if (r)
            return "n-resize";
        }
        break;
      }
    }
    return De() ? o > 0 && i > 0 ? "move" : o > 0 ? "ew-resize" : "ns-resize" : o > 0 && i > 0 ? "grab" : o > 0 ? "col-resize" : "row-resize";
  }
}
const Te = /* @__PURE__ */ new WeakMap();
function xe(e) {
  if (e.defaultView === null || e.defaultView === void 0)
    return;
  let { prevStyle: t, styleSheet: n } = Te.get(e) ?? {};
  n === void 0 && (n = new e.defaultView.CSSStyleSheet(), e.adoptedStyleSheets && (Object.isExtensible(e.adoptedStyleSheets) ? e.adoptedStyleSheets.push(n) : e.adoptedStyleSheets = [
    ...e.adoptedStyleSheets,
    n
  ]));
  const o = B();
  switch (o.state) {
    case "active":
    case "hover": {
      const i = It({
        cursorFlags: o.cursorFlags,
        groups: o.hitRegions.map((u) => u.group),
        state: o.state
      }), s = `*, *:hover {cursor: ${i} !important; }`;
      if (t === s)
        return;
      t = s, i ? n.cssRules.length === 0 ? n.insertRule(s) : n.replaceSync(s) : n.cssRules.length === 1 && n.deleteRule(0);
      break;
    }
    case "inactive": {
      t = void 0, n.cssRules.length === 1 && n.deleteRule(0);
      break;
    }
  }
  Te.set(e, {
    prevStyle: t,
    styleSheet: n
  });
}
let F = /* @__PURE__ */ new Map();
const it = new Qe();
function kt(e) {
  F = new Map(F), F.delete(e);
}
function Oe(e, t) {
  for (const [n] of F)
    if (n.id === e)
      return n;
}
function H(e, t) {
  for (const [n, o] of F)
    if (n.id === e)
      return o;
  if (t)
    throw Error(`Could not find data for Group with id ${e}`);
}
function X() {
  return F;
}
function Pe(e, t) {
  return it.addListener("groupChange", (n) => {
    n.group.id === e && t(n);
  });
}
function j(e, t, n) {
  const o = F.get(e);
  F = new Map(F), F.set(e, t), it.emit("groupChange", {
    group: e,
    isUserInteraction: n?.isUserInteraction === !0,
    prev: o,
    next: t
  });
}
function rt(e) {
  const t = B();
  let n = !1;
  switch (t.state) {
    case "active":
      te({
        cursorFlags: 0,
        state: "inactive"
      }), t.hitRegions.length > 0 && (xe(e), n = !0, t.hitRegions.forEach((o) => {
        const i = H(o.group.id, !0);
        j(o.group, i, {
          isUserInteraction: !0
        });
      }));
  }
  return n;
}
function Ge(e) {
  e.defaultPrevented || rt(e.currentTarget);
}
function Dt(e, t, n) {
  let o, i = {
    x: 1 / 0,
    y: 1 / 0
  };
  for (const s of t) {
    const u = Je(n, s.rect);
    switch (e) {
      case "horizontal": {
        u.x <= i.x && (o = s, i = u);
        break;
      }
      case "vertical": {
        u.y <= i.y && (o = s, i = u);
        break;
      }
    }
  }
  return o ? {
    distance: i,
    hitRegion: o
  } : void 0;
}
function Tt(e) {
  return e !== null && typeof e == "object" && "nodeType" in e && e.nodeType === Node.DOCUMENT_FRAGMENT_NODE;
}
function Ot(e, t) {
  if (e === t) throw new Error("Cannot compare node with itself");
  const n = {
    a: Ne(e),
    b: Ne(t)
  };
  let o;
  for (; n.a.at(-1) === n.b.at(-1); )
    o = n.a.pop(), n.b.pop();
  C(
    o,
    "Stacking order can only be calculated for elements with a common ancestor"
  );
  const i = {
    a: Fe(Ae(n.a)),
    b: Fe(Ae(n.b))
  };
  if (i.a === i.b) {
    const s = o.childNodes, u = {
      a: n.a.at(-1),
      b: n.b.at(-1)
    };
    let a = s.length;
    for (; a--; ) {
      const r = s[a];
      if (r === u.a) return 1;
      if (r === u.b) return -1;
    }
  }
  return Math.sign(i.a - i.b);
}
const Gt = /\b(?:position|zIndex|opacity|transform|webkitTransform|mixBlendMode|filter|webkitFilter|isolation)\b/;
function At(e) {
  const t = getComputedStyle(st(e) ?? e).display;
  return t === "flex" || t === "inline-flex";
}
function Ft(e) {
  const t = getComputedStyle(e);
  return !!(t.position === "fixed" || t.zIndex !== "auto" && (t.position !== "static" || At(e)) || +t.opacity < 1 || "transform" in t && t.transform !== "none" || "webkitTransform" in t && t.webkitTransform !== "none" || "mixBlendMode" in t && t.mixBlendMode !== "normal" || "filter" in t && t.filter !== "none" || "webkitFilter" in t && t.webkitFilter !== "none" || "isolation" in t && t.isolation === "isolate" || Gt.test(t.willChange) || t.webkitOverflowScrolling === "touch");
}
function Ae(e) {
  let t = e.length;
  for (; t--; ) {
    const n = e[t];
    if (C(n, "Missing node"), Ft(n)) return n;
  }
  return null;
}
function Fe(e) {
  return e && Number(getComputedStyle(e).zIndex) || 0;
}
function Ne(e) {
  const t = [];
  for (; e; )
    t.push(e), e = st(e);
  return t;
}
function st(e) {
  const { parentNode: t } = e;
  return Tt(t) ? t.host : t;
}
function Nt(e, t) {
  return e.x < t.x + t.width && e.x + e.width > t.x && e.y < t.y + t.height && e.y + e.height > t.y;
}
function _t({
  groupElement: e,
  hitRegion: t,
  pointerEventTarget: n
}) {
  if (!Ye(n) || n.contains(e) || e.contains(n))
    return !0;
  if (Ot(n, e) > 0) {
    let o = n;
    for (; o; ) {
      if (o.contains(e))
        return !0;
      if (Nt(o.getBoundingClientRect(), t))
        return !1;
      o = o.parentElement;
    }
  }
  return !0;
}
function we(e, t) {
  const n = [];
  return t.forEach((o, i) => {
    if (i.disabled)
      return;
    const s = Ze(i), u = Dt(i.orientation, s, {
      x: e.clientX,
      y: e.clientY
    });
    u && u.distance.x <= 0 && u.distance.y <= 0 && _t({
      groupElement: i.element,
      hitRegion: u.hitRegion.rect,
      pointerEventTarget: e.target
    }) && n.push(u.hitRegion);
  }), n;
}
function $t(e, t) {
  if (e.length !== t.length)
    return !1;
  for (let n = 0; n < e.length; n++)
    if (e[n] != t[n])
      return !1;
  return !0;
}
function k(e, t, n = 0) {
  return Math.abs(T(e) - T(t)) <= n;
}
function A(e, t) {
  return k(e, t) ? 0 : e > t ? 1 : -1;
}
function Z({
  overrideDisabledPanels: e,
  panelConstraints: t,
  prevSize: n,
  size: o
}) {
  const {
    collapsedSize: i = 0,
    collapsible: s,
    disabled: u,
    maxSize: a = 100,
    minSize: r = 0
  } = t;
  if (u && !e)
    return n;
  if (A(o, r) < 0)
    if (s) {
      const l = (i + r) / 2;
      A(o, l) < 0 ? o = i : o = r;
    } else
      o = r;
  return o = Math.min(a, o), o = T(o), o;
}
function le({
  delta: e,
  initialLayout: t,
  panelConstraints: n,
  pivotIndices: o,
  prevLayout: i,
  trigger: s
}) {
  if (k(e, 0))
    return t;
  const u = s === "imperative-api", a = Object.values(t), r = Object.values(i), l = [...a], [c, m] = o;
  C(c != null, "Invalid first pivot index"), C(m != null, "Invalid second pivot index");
  let p = 0;
  switch (s) {
    case "keyboard": {
      {
        const f = e < 0 ? m : c, d = n[f];
        C(
          d,
          `Panel constraints not found for index ${f}`
        );
        const {
          collapsedSize: h = 0,
          collapsible: y,
          minSize: b = 0
        } = d;
        if (y) {
          const v = a[f];
          if (C(
            v != null,
            `Previous layout not found for panel index ${f}`
          ), k(v, h)) {
            const g = b - v;
            A(g, Math.abs(e)) > 0 && (e = e < 0 ? 0 - g : g);
          }
        }
      }
      {
        const f = e < 0 ? c : m, d = n[f];
        C(
          d,
          `No panel constraints found for index ${f}`
        );
        const {
          collapsedSize: h = 0,
          collapsible: y,
          minSize: b = 0
        } = d;
        if (y) {
          const v = a[f];
          if (C(
            v != null,
            `Previous layout not found for panel index ${f}`
          ), k(v, b)) {
            const g = v - h;
            A(g, Math.abs(e)) > 0 && (e = e < 0 ? 0 - g : g);
          }
        }
      }
      break;
    }
    default: {
      const f = e < 0 ? m : c, d = n[f];
      C(
        d,
        `Panel constraints not found for index ${f}`
      );
      const h = a[f], { collapsible: y, collapsedSize: b, minSize: v } = d;
      if (y && A(h, v) < 0)
        if (e > 0) {
          const g = v - b, w = g / 2, M = h + e;
          A(M, v) < 0 && (e = A(e, w) <= 0 ? 0 : g);
        } else {
          const g = v - b, w = 100 - g / 2, M = h - e;
          A(M, v) < 0 && (e = A(100 + e, w) > 0 ? 0 : -g);
        }
      break;
    }
  }
  {
    const f = e < 0 ? 1 : -1;
    let d = e < 0 ? m : c, h = 0;
    for (; ; ) {
      const b = a[d];
      C(
        b != null,
        `Previous layout not found for panel index ${d}`
      );
      const g = Z({
        overrideDisabledPanels: u,
        panelConstraints: n[d],
        prevSize: b,
        size: 100
      }) - b;
      if (h += g, d += f, d < 0 || d >= n.length)
        break;
    }
    const y = Math.min(Math.abs(e), Math.abs(h));
    e = e < 0 ? 0 - y : y;
  }
  {
    let d = e < 0 ? c : m;
    for (; d >= 0 && d < n.length; ) {
      const h = Math.abs(e) - Math.abs(p), y = a[d];
      C(
        y != null,
        `Previous layout not found for panel index ${d}`
      );
      const b = y - h, v = Z({
        overrideDisabledPanels: u,
        panelConstraints: n[d],
        prevSize: y,
        size: b
      });
      if (!k(y, v) && (p += y - v, l[d] = v, p.toFixed(3).localeCompare(Math.abs(e).toFixed(3), void 0, {
        numeric: !0
      }) >= 0))
        break;
      e < 0 ? d-- : d++;
    }
  }
  if ($t(r, l))
    return i;
  {
    const f = e < 0 ? m : c, d = a[f];
    C(
      d != null,
      `Previous layout not found for panel index ${f}`
    );
    const h = d + p, y = Z({
      overrideDisabledPanels: u,
      panelConstraints: n[f],
      prevSize: d,
      size: h
    });
    if (l[f] = y, !k(y, h)) {
      let b = h - y, g = e < 0 ? m : c;
      for (; g >= 0 && g < n.length; ) {
        const w = l[g];
        C(
          w != null,
          `Previous layout not found for panel index ${g}`
        );
        const M = w + b, L = Z({
          overrideDisabledPanels: u,
          panelConstraints: n[g],
          prevSize: w,
          size: M
        });
        if (k(w, L) || (b -= L - w, l[g] = L), k(b, 0))
          break;
        e > 0 ? g-- : g++;
      }
    }
  }
  const S = Object.values(l).reduce(
    (f, d) => d + f,
    0
  );
  if (!k(S, 100, 0.1))
    return i;
  const z = Object.keys(i);
  return l.reduce((f, d, h) => (f[z[h]] = d, f), {});
}
function W(e, t) {
  if (Object.keys(e).length !== Object.keys(t).length)
    return !1;
  for (const n in e)
    if (t[n] === void 0 || A(e[n], t[n]) !== 0)
      return !1;
  return !0;
}
function K({
  layout: e,
  panelConstraints: t
}) {
  const n = Object.values(e), o = [...n], i = o.reduce(
    (a, r) => a + r,
    0
  );
  if (o.length !== t.length)
    throw Error(
      `Invalid ${t.length} panel layout: ${o.map((a) => `${a}%`).join(", ")}`
    );
  if (!k(i, 100) && o.length > 0)
    for (let a = 0; a < t.length; a++) {
      const r = o[a];
      C(r != null, `No layout data found for index ${a}`);
      const l = 100 / i * r;
      o[a] = l;
    }
  let s = 0;
  for (let a = 0; a < t.length; a++) {
    const r = n[a];
    C(r != null, `No layout data found for index ${a}`);
    const l = o[a];
    C(l != null, `No layout data found for index ${a}`);
    const c = Z({
      overrideDisabledPanels: !0,
      panelConstraints: t[a],
      prevSize: r,
      size: l
    });
    l != c && (s += l - c, o[a] = c);
  }
  if (!k(s, 0))
    for (let a = 0; a < t.length; a++) {
      const r = o[a];
      C(r != null, `No layout data found for index ${a}`);
      const l = r + s, c = Z({
        overrideDisabledPanels: !0,
        panelConstraints: t[a],
        prevSize: r,
        size: l
      });
      if (r !== c && (s -= c - r, o[a] = c, k(s, 0)))
        break;
    }
  const u = Object.keys(e);
  return o.reduce((a, r, l) => (a[u[l]] = r, a), {});
}
function at({
  groupId: e,
  panelId: t
}) {
  const n = () => {
    const r = X();
    for (const [
      l,
      {
        defaultLayoutDeferred: c,
        derivedPanelConstraints: m,
        layout: p,
        groupSize: S,
        separatorToPanels: z
      }
    ] of r)
      if (l.id === e)
        return {
          defaultLayoutDeferred: c,
          derivedPanelConstraints: m,
          group: l,
          groupSize: S,
          layout: p,
          separatorToPanels: z
        };
    throw Error(`Group ${e} not found`);
  }, o = () => {
    const r = n().derivedPanelConstraints.find(
      (l) => l.panelId === t
    );
    if (r !== void 0)
      return r;
    throw Error(`Panel constraints not found for Panel ${t}`);
  }, i = () => {
    const r = n().group.panels.find((l) => l.id === t);
    if (r !== void 0)
      return r;
    throw Error(`Layout not found for Panel ${t}`);
  }, s = () => {
    const r = n().layout[t];
    if (r !== void 0)
      return r;
    throw Error(`Layout not found for Panel ${t}`);
  }, u = ({
    nextSize: r,
    panels: l,
    prevLayout: c,
    derivedPanelConstraints: m
  }) => {
    const p = s(), S = l.findIndex((h) => h.id === t), z = S === 0, f = S === l.length - 1;
    if (f && r < p && (z || l.slice(0, S).every((h, y) => {
      const b = m[y];
      return b?.collapsible && k(b.collapsedSize, c[b.panelId]);
    }))) {
      const h = l.slice(0, S).reduce((y, b) => y + c[b.id], 0);
      return {
        ...c,
        [t]: T(100 - h)
      };
    }
    return le({
      delta: f ? p - r : r - p,
      initialLayout: c,
      panelConstraints: m,
      pivotIndices: f ? [S - 1, S] : [S, S + 1],
      prevLayout: c,
      trigger: "imperative-api"
    });
  }, a = (r) => {
    const l = s();
    if (r === l)
      return;
    const {
      defaultLayoutDeferred: c,
      derivedPanelConstraints: m,
      group: p,
      groupSize: S,
      layout: z,
      separatorToPanels: f
    } = n(), d = u({
      nextSize: r,
      panels: p.panels,
      prevLayout: z,
      derivedPanelConstraints: m
    }), h = K({
      layout: d,
      panelConstraints: m
    });
    W(z, h) || j(p, {
      defaultLayoutDeferred: c,
      derivedPanelConstraints: m,
      groupSize: S,
      layout: h,
      separatorToPanels: f
    });
  };
  return {
    collapse: () => {
      const { collapsible: r, collapsedSize: l } = o(), { mutableValues: c } = i(), m = s();
      r && m !== l && (c.expandToSize = m, a(l));
    },
    expand: () => {
      const { collapsible: r, collapsedSize: l, minSize: c } = o(), { mutableValues: m } = i(), p = s();
      if (r && p === l) {
        let S = m.expandToSize ?? c;
        S === 0 && (S = 1), a(S);
      }
    },
    getSize: () => {
      const { group: r } = n(), l = s(), { element: c } = i(), m = r.orientation === "horizontal" ? c.offsetWidth : c.offsetHeight;
      return {
        asPercentage: l,
        inPixels: m
      };
    },
    isCollapsed: () => {
      const { collapsible: r, collapsedSize: l } = o(), c = s();
      return r && k(l, c);
    },
    resize: (r) => {
      const { group: l } = n(), { element: c } = i(), m = ne({ group: l }), p = ie({
        groupSize: m,
        panelElement: c,
        styleProp: r
      }), S = T(p / m * 100);
      a(S);
    }
  };
}
function _e(e) {
  if (e.defaultPrevented)
    return;
  const t = X();
  we(e, t).forEach((o) => {
    if (o.separator && !o.separator.disableDoubleClick) {
      const i = o.panels.find(
        (s) => s.panelConstraints.defaultSize !== void 0
      );
      if (i) {
        const s = i.panelConstraints.defaultSize, u = at({
          groupId: o.group.id,
          panelId: i.id
        });
        u && s !== void 0 && (u.resize(s), e.preventDefault());
      }
    }
  });
}
function pe(e) {
  const t = X();
  for (const [n] of t)
    if (n.separators.some(
      (o) => o.element === e
    ))
      return n;
  throw Error("Could not find parent Group for separator element");
}
function lt({
  groupId: e
}) {
  const t = () => {
    const n = X();
    for (const [o, i] of n)
      if (o.id === e)
        return { group: o, ...i };
    throw Error(`Could not find Group with id "${e}"`);
  };
  return {
    getLayout() {
      const { defaultLayoutDeferred: n, layout: o } = t();
      return n ? {} : o;
    },
    setLayout(n) {
      const {
        defaultLayoutDeferred: o,
        derivedPanelConstraints: i,
        group: s,
        groupSize: u,
        layout: a,
        separatorToPanels: r
      } = t(), l = K({
        layout: n,
        panelConstraints: i
      });
      return o ? a : (W(a, l) || j(s, {
        defaultLayoutDeferred: o,
        derivedPanelConstraints: i,
        groupSize: u,
        layout: l,
        separatorToPanels: r
      }), l);
    }
  };
}
function U(e, t) {
  const n = pe(e), o = H(n.id, !0), i = n.separators.find(
    (m) => m.element === e
  );
  C(i, "Matching separator not found");
  const s = o.separatorToPanels.get(i);
  C(s, "Matching panels not found");
  const u = s.map((m) => n.panels.indexOf(m)), r = lt({ groupId: n.id }).getLayout(), l = le({
    delta: t,
    initialLayout: r,
    panelConstraints: o.derivedPanelConstraints,
    pivotIndices: u,
    prevLayout: r,
    trigger: "keyboard"
  }), c = K({
    layout: l,
    panelConstraints: o.derivedPanelConstraints
  });
  W(r, c) || j(
    n,
    {
      defaultLayoutDeferred: o.defaultLayoutDeferred,
      derivedPanelConstraints: o.derivedPanelConstraints,
      groupSize: o.groupSize,
      layout: c,
      separatorToPanels: o.separatorToPanels
    },
    // Keyboard resizes (arrow keys, Home/End, Enter collapse/expand) originate
    // from a real DOM event on the separator, so they are user interactions
    // just like pointer drags. This function is only reached from
    // onDocumentKeyDown. See #716.
    { isUserInteraction: !0 }
  );
}
function $e(e) {
  if (e.defaultPrevented)
    return;
  const t = e.currentTarget, n = pe(t);
  if (!n.disabled)
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault(), n.orientation === "vertical" && U(t, 5);
        break;
      }
      case "ArrowLeft": {
        e.preventDefault(), n.orientation === "horizontal" && U(t, -5);
        break;
      }
      case "ArrowRight": {
        e.preventDefault(), n.orientation === "horizontal" && U(t, 5);
        break;
      }
      case "ArrowUp": {
        e.preventDefault(), n.orientation === "vertical" && U(t, -5);
        break;
      }
      case "End": {
        e.preventDefault(), U(t, 100);
        break;
      }
      case "Enter": {
        e.preventDefault();
        const o = pe(t), i = H(o.id, !0), { derivedPanelConstraints: s, layout: u, separatorToPanels: a } = i, r = o.separators.find(
          (p) => p.element === t
        );
        C(r, "Matching separator not found");
        const l = a.get(r);
        C(l, "Matching panels not found");
        const c = l[0], m = s.find(
          (p) => p.panelId === c.id
        );
        if (C(m, "Panel metadata not found"), m.collapsible) {
          const p = u[c.id], S = m.collapsedSize === p ? o.mutableState.expandedPanelSizes[c.id] ?? m.minSize : m.collapsedSize;
          U(t, S - p);
        }
        break;
      }
      case "F6": {
        e.preventDefault();
        const i = pe(t).separators.map(
          (r) => r.element
        ), s = Array.from(i).findIndex(
          (r) => r === e.currentTarget
        );
        C(s !== null, "Index not found");
        const u = e.shiftKey ? s > 0 ? s - 1 : i.length - 1 : s + 1 < i.length ? s + 1 : 0;
        i[u].focus({
          preventScroll: !0
        });
        break;
      }
      case "Home": {
        e.preventDefault(), U(t, -100);
        break;
      }
    }
}
function je(e) {
  if (e.defaultPrevented)
    return;
  if (e.pointerType === "mouse" && e.button > 0)
    return;
  const t = X(), n = we(e, t), o = /* @__PURE__ */ new Map();
  let i = !1;
  n.forEach((s) => {
    s.separator && (i || (i = !0, s.separator.element.focus({
      // @ts-expect-error https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus#browser_compatibility
      focusVisible: !1,
      preventScroll: !0
    })));
    const u = t.get(s.group);
    u && o.set(s.group, u.layout);
  }), te({
    cursorFlags: 0,
    hitRegions: n,
    initialLayoutMap: o,
    pointerDownAtPoint: { x: e.clientX, y: e.clientY },
    state: "active"
  }), n.length && e.preventDefault();
}
function ut({
  document: e,
  event: t,
  hitRegions: n,
  initialLayoutMap: o,
  mountedGroups: i,
  pointerDownAtPoint: s,
  prevCursorFlags: u
}) {
  let a = 0;
  n.forEach((l) => {
    const { group: c, groupSize: m } = l, { orientation: p, panels: S } = c, { disableCursor: z } = c.mutableState;
    let f = 0;
    s ? p === "horizontal" ? f = (t.clientX - s.x) / m * 100 : f = (t.clientY - s.y) / m * 100 : p === "horizontal" ? f = t.clientX < 0 ? -100 : 100 : f = t.clientY < 0 ? -100 : 100;
    const d = o.get(c), h = i.get(c);
    if (!d || !h)
      return;
    const {
      defaultLayoutDeferred: y,
      derivedPanelConstraints: b,
      groupSize: v,
      layout: g,
      separatorToPanels: w
    } = h;
    if (b && g && w) {
      const M = le({
        delta: f,
        initialLayout: d,
        panelConstraints: b,
        pivotIndices: l.panels.map((L) => S.indexOf(L)),
        prevLayout: g,
        trigger: "mouse-or-touch"
      });
      if (W(M, g)) {
        if (f !== 0 && !z)
          switch (p) {
            case "horizontal": {
              a |= f < 0 ? et : tt;
              break;
            }
            case "vertical": {
              a |= f < 0 ? nt : ot;
              break;
            }
          }
      } else
        j(l.group, {
          defaultLayoutDeferred: y,
          derivedPanelConstraints: b,
          groupSize: v,
          layout: M,
          separatorToPanels: w
        });
    }
  });
  let r = 0;
  t.movementX === 0 ? r |= u & Ie : r |= a & Ie, t.movementY === 0 ? r |= u & ke : r |= a & ke, Mt(r), xe(e);
}
function He(e) {
  const t = X(), n = B();
  switch (n.state) {
    case "active":
      ut({
        document: e.currentTarget,
        event: e,
        hitRegions: n.hitRegions,
        initialLayoutMap: n.initialLayoutMap,
        mountedGroups: t,
        prevCursorFlags: n.cursorFlags
      });
  }
}
function Ve(e) {
  if (e.defaultPrevented)
    return;
  const t = B(), n = X();
  switch (t.state) {
    case "active": {
      if (
        // Skip this check for "pointerleave" events, else Firefox triggers a false positive (see #514)
        e.buttons === 0
      ) {
        te({
          cursorFlags: 0,
          state: "inactive"
        }), t.hitRegions.forEach((o) => {
          const i = H(o.group.id, !0);
          j(o.group, i, {
            isUserInteraction: !0
          });
        });
        return;
      }
      for (const o of t.hitRegions)
        if (o.separator) {
          const { element: i } = o.separator;
          i.hasPointerCapture?.(e.pointerId) || i.setPointerCapture?.(e.pointerId);
        }
      ut({
        document: e.currentTarget,
        event: e,
        hitRegions: t.hitRegions,
        initialLayoutMap: t.initialLayoutMap,
        mountedGroups: n,
        pointerDownAtPoint: t.pointerDownAtPoint,
        prevCursorFlags: t.cursorFlags
      });
      break;
    }
    default: {
      const o = we(e, n);
      o.length === 0 ? t.state !== "inactive" && te({
        cursorFlags: 0,
        state: "inactive"
      }) : te({
        cursorFlags: 0,
        hitRegions: o,
        state: "hover"
      }), xe(e.currentTarget);
      break;
    }
  }
}
function Ue(e) {
  if (e.relatedTarget instanceof HTMLIFrameElement)
    switch (B().state) {
      case "hover":
        te({
          cursorFlags: 0,
          state: "inactive"
        });
    }
}
function Be(e) {
  if (e.defaultPrevented)
    return;
  if (e.pointerType === "mouse" && e.button > 0)
    return;
  rt(e.currentTarget) && e.preventDefault();
}
function We(e) {
  let t = 0, n = 0;
  const o = {};
  for (const s of e)
    if (s.defaultSize !== void 0) {
      t++;
      const u = T(s.defaultSize);
      n += u, o[s.panelId] = u;
    } else
      o[s.panelId] = void 0;
  const i = e.length - t;
  if (i !== 0) {
    const s = T((100 - n) / i);
    for (const u of e)
      u.defaultSize === void 0 && (o[u.panelId] = s);
  }
  return o;
}
function jt(e, t, n) {
  if (!n[0])
    return;
  const i = e.panels.find((l) => l.element === t);
  if (!i || !i.onResize)
    return;
  const s = ne({ group: e }), u = e.orientation === "horizontal" ? i.element.offsetWidth : i.element.offsetHeight, a = i.mutableValues.prevSize, r = {
    asPercentage: T(u / s * 100),
    inPixels: u
  };
  i.mutableValues.prevSize = r, i.onResize(r, i.id, a);
}
function Ht(e, t) {
  if (Object.keys(e).length !== Object.keys(t).length)
    return !1;
  for (const o in e)
    if (e[o] !== t[o])
      return !1;
  return !0;
}
function Vt({
  group: e,
  nextGroupSize: t,
  prevGroupSize: n,
  prevLayout: o
}) {
  if (n <= 0 || t <= 0 || n === t)
    return o;
  let i = 0, s = 0, u = !1;
  const a = /* @__PURE__ */ new Map(), r = [];
  for (const m of e.panels) {
    const p = o[m.id] ?? 0;
    switch (m.panelConstraints.groupResizeBehavior) {
      case "preserve-pixel-size": {
        u = !0;
        const S = p / 100 * n, z = T(
          S / t * 100
        );
        a.set(m.id, z), i += z;
        break;
      }
      case "preserve-relative-size":
      default: {
        r.push(m.id), s += p;
        break;
      }
    }
  }
  if (!u || r.length === 0)
    return o;
  const l = 100 - i, c = { ...o };
  if (a.forEach((m, p) => {
    c[p] = m;
  }), s > 0)
    for (const m of r) {
      const p = o[m] ?? 0;
      c[m] = T(
        p / s * l
      );
    }
  else {
    const m = T(
      l / r.length
    );
    for (const p of r)
      c[p] = m;
  }
  return c;
}
function Ut(e, t) {
  const n = e.map((i) => i.id), o = Object.keys(t);
  if (n.length !== o.length)
    return !1;
  for (const i of n)
    if (!o.includes(i))
      return !1;
  return !0;
}
const J = /* @__PURE__ */ new Map();
function Bt(e) {
  let t = !0;
  C(
    e.element.ownerDocument.defaultView,
    "Cannot register an unmounted Group"
  );
  const n = e.element.ownerDocument.defaultView.ResizeObserver, o = /* @__PURE__ */ new Set(), i = /* @__PURE__ */ new Set(), s = new n((f) => {
    for (const d of f) {
      const { borderBoxSize: h, target: y } = d;
      if (y === e.element) {
        if (t) {
          const b = ne({ group: e });
          if (b === 0)
            return;
          const v = H(e.id);
          if (!v)
            return;
          const g = ve(e), w = v.defaultLayoutDeferred ? We(g) : v.layout, M = Vt({
            group: e,
            nextGroupSize: b,
            prevGroupSize: v.groupSize,
            prevLayout: w
          }), L = K({
            layout: M,
            panelConstraints: g
          });
          if (!v.defaultLayoutDeferred && W(v.layout, L) && Ht(
            v.derivedPanelConstraints,
            g
          ) && v.groupSize === b)
            return;
          j(e, {
            defaultLayoutDeferred: !1,
            derivedPanelConstraints: g,
            groupSize: b,
            layout: L,
            separatorToPanels: v.separatorToPanels
          });
        }
      } else
        jt(e, y, h);
    }
  });
  s.observe(e.element), e.panels.forEach((f) => {
    C(
      !o.has(f.id),
      `Panel ids must be unique; id "${f.id}" was used more than once`
    ), o.add(f.id), f.onResize && s.observe(f.element);
  });
  const u = ne({ group: e }), a = ve(e), r = e.panels.map(({ id: f }) => f).join(",");
  let l = e.mutableState.defaultLayout;
  l && (Ut(e.panels, l) || (l = void 0));
  const c = e.mutableState.layouts[r] ?? l ?? We(a), m = K({
    layout: c,
    panelConstraints: a
  }), p = e.element.ownerDocument;
  J.set(
    p,
    (J.get(p) ?? 0) + 1
  );
  const S = /* @__PURE__ */ new Map();
  return Ze(e).forEach((f) => {
    f.separator && S.set(f.separator, f.panels);
  }), j(e, {
    defaultLayoutDeferred: u === 0,
    derivedPanelConstraints: a,
    groupSize: u,
    layout: m,
    separatorToPanels: S
  }), e.separators.forEach((f) => {
    C(
      !i.has(f.id),
      `Separator ids must be unique; id "${f.id}" was used more than once`
    ), i.add(f.id), f.element.addEventListener("keydown", $e);
  }), J.get(p) === 1 && (p.addEventListener("contextmenu", Ge, !0), p.addEventListener("dblclick", _e, !0), p.addEventListener("pointerdown", je, !0), p.addEventListener("pointerleave", He), p.addEventListener("pointermove", Ve), p.addEventListener("pointerout", Ue), p.addEventListener("pointerup", Be, !0)), function() {
    t = !1, J.set(
      p,
      Math.max(0, (J.get(p) ?? 0) - 1)
    ), kt(e), e.separators.forEach((d) => {
      d.element.removeEventListener("keydown", $e);
    }), J.get(p) || (p.removeEventListener(
      "contextmenu",
      Ge,
      !0
    ), p.removeEventListener(
      "dblclick",
      _e,
      !0
    ), p.removeEventListener(
      "pointerdown",
      je,
      !0
    ), p.removeEventListener("pointerleave", He), p.removeEventListener("pointermove", Ve), p.removeEventListener("pointerout", Ue), p.removeEventListener("pointerup", Be, !0)), s.disconnect();
  };
}
function Wt() {
  const [e, t] = Q({}), n = re(() => t({}), []);
  return [e, n];
}
function Le(e) {
  const t = mt();
  return `${e ?? t}`;
}
const q = typeof window < "u" ? Ke : me;
function se(e) {
  const t = O(e);
  return q(() => {
    t.current = e;
  }, [e]), re(
    (...n) => t.current?.(...n),
    [t]
  );
}
function Ce(...e) {
  return se((t) => {
    e.forEach((n) => {
      if (n)
        switch (typeof n) {
          case "function": {
            n(t);
            break;
          }
          case "object": {
            n.current = t;
            break;
          }
        }
    });
  });
}
function Re(e) {
  const t = O({ ...e });
  return q(() => {
    for (const n in e)
      t.current[n] = e[n];
  }, [e]), t.current;
}
const ct = gt(null);
function Kt(e, t) {
  const n = O({
    getLayout: () => ({}),
    setLayout: Et
  });
  Xe(t, () => n.current, []), q(() => {
    Object.assign(
      n.current,
      lt({ groupId: e })
    );
  });
}
function Xt({
  children: e,
  className: t,
  defaultLayout: n,
  disableCursor: o,
  disabled: i,
  elementRef: s,
  groupRef: u,
  id: a,
  onLayoutChange: r,
  onLayoutChanged: l,
  orientation: c = "horizontal",
  resizeTargetMinimumSize: m = {
    coarse: 20,
    fine: 10
  },
  style: p,
  ...S
}) {
  const z = O({
    onLayoutChange: {},
    onLayoutChanged: {}
  }), f = se((x) => {
    W(z.current.onLayoutChange, x) || (z.current.onLayoutChange = x, r?.(x));
  }), d = se(
    (x, P) => {
      W(z.current.onLayoutChanged, x) || (z.current.onLayoutChanged = x, l?.(x, { isUserInteraction: P }));
    }
  ), h = Le(a), y = O(null), [b, v] = Wt(), g = O({
    lastExpandedPanelSizes: {},
    layouts: {},
    panels: [],
    resizeTargetMinimumSize: m,
    separators: []
  }), w = Ce(y, s);
  Kt(h, u);
  const M = se(
    (x, P) => {
      const I = B(), R = Oe(x), E = H(x);
      if (E) {
        let D = !1;
        switch (I.state) {
          case "active": {
            D = I.hitRegions.some(
              (V) => V.group === R
            );
            break;
          }
        }
        return {
          flexGrow: E.layout[P] ?? 1,
          pointerEvents: D ? "none" : void 0
        };
      }
      if (n?.[P])
        return {
          flexGrow: n?.[P]
        };
    }
  ), L = Re({
    defaultLayout: n,
    disableCursor: o
  }), G = Se(
    () => ({
      get disableCursor() {
        return !!L.disableCursor;
      },
      getPanelStyles: M,
      id: h,
      orientation: c,
      registerPanel: (x) => {
        const P = g.current;
        return P.panels = be(c, [
          ...P.panels,
          x
        ]), v(), () => {
          P.panels = P.panels.filter(
            (I) => I !== x
          ), v();
        };
      },
      registerSeparator: (x) => {
        const P = g.current;
        return P.separators = be(c, [
          ...P.separators,
          x
        ]), v(), () => {
          P.separators = P.separators.filter(
            (I) => I !== x
          ), v();
        };
      },
      updatePanelProps: (x, { disabled: P }) => {
        const R = g.current.panels.find(
          (V) => V.id === x
        );
        R && (R.panelConstraints.disabled = P);
        const E = Oe(h), D = H(h);
        E && D && j(E, {
          ...D,
          derivedPanelConstraints: ve(E)
        });
      },
      updateSeparatorProps: (x, {
        disabled: P,
        disableDoubleClick: I
      }) => {
        const E = g.current.separators.find(
          (D) => D.id === x
        );
        E && (E.disabled = P, E.disableDoubleClick = I);
      }
    }),
    [M, h, v, c, L]
  ), N = O(null);
  return q(() => {
    const x = y.current;
    if (x === null)
      return;
    const P = g.current;
    let I;
    if (L.defaultLayout !== void 0 && Object.keys(L.defaultLayout).length === P.panels.length) {
      I = {};
      for (const _ of P.panels) {
        const Y = L.defaultLayout[_.id];
        Y !== void 0 && (I[_.id] = Y);
      }
    }
    const R = {
      disabled: !!i,
      element: x,
      id: h,
      mutableState: {
        defaultLayout: I,
        disableCursor: !!L.disableCursor,
        expandedPanelSizes: g.current.lastExpandedPanelSizes,
        layouts: g.current.layouts
      },
      orientation: c,
      panels: P.panels,
      resizeTargetMinimumSize: P.resizeTargetMinimumSize,
      separators: P.separators
    };
    N.current = R;
    const E = Bt(R), { defaultLayoutDeferred: D, derivedPanelConstraints: V, layout: ue } = H(R.id, !0);
    !D && V.length > 0 && (f(ue), d(ue, !1));
    const oe = Pe(h, (_) => {
      const { defaultLayoutDeferred: Y, derivedPanelConstraints: Ee, layout: ce } = _.next;
      if (Y || Ee.length === 0)
        return;
      const ft = R.panels.map(({ id: $ }) => $).join(",");
      R.mutableState.layouts[ft] = ce, Ee.forEach(($) => {
        if ($.collapsible) {
          const { layout: ge } = _.prev ?? {};
          if (ge) {
            const pt = k(
              $.collapsedSize,
              ce[$.panelId]
            ), ht = k(
              $.collapsedSize,
              ge[$.panelId]
            );
            pt && !ht && (R.mutableState.expandedPanelSizes[$.panelId] = ge[$.panelId]);
          }
        }
      });
      const dt = B().state !== "active";
      f(ce), dt && d(ce, _.isUserInteraction);
    });
    return () => {
      N.current = null, E(), oe();
    };
  }, [
    i,
    h,
    d,
    f,
    c,
    b,
    L
  ]), me(() => {
    const x = N.current;
    x && (x.mutableState.defaultLayout = n, x.mutableState.disableCursor = !!o);
  }), /* @__PURE__ */ ae(ct.Provider, { value: G, children: /* @__PURE__ */ ae(
    "div",
    {
      ...S,
      className: t,
      "data-group": !0,
      "data-testid": h,
      id: h,
      ref: w,
      style: {
        height: "100%",
        width: "100%",
        overflow: "hidden",
        ...p,
        display: "flex",
        flexDirection: c === "horizontal" ? "row" : "column",
        flexWrap: "nowrap",
        // Inform the browser that the library is handling touch events for this element
        // but still allow users to scroll content within panels in the non-resizing direction
        // NOTE This is not an inherited style
        // See github.com/bvaughn/react-resizable-panels/issues/662
        touchAction: c === "horizontal" ? "pan-y" : "pan-x"
      },
      children: e
    }
  ) });
}
Xt.displayName = "Group";
function he(e, t) {
  return `react-resizable-panels:${[e, ...t].join(":")}`;
}
function qt({
  id: e,
  panelIds: t,
  storage: n
}) {
  const o = he(e, []), i = n.getItem(o);
  if (i)
    try {
      const s = JSON.parse(i);
      if (t) {
        const u = t.join(","), a = s[u];
        if (a && Array.isArray(a.layout) && t.length === a.layout.length) {
          const r = {};
          for (let l = 0; l < t.length; l++)
            r[t[l]] = a.layout[l];
          return r;
        }
      } else {
        const u = Object.keys(s);
        if (u.length === 1) {
          const a = s[u[0]];
          if (a && Array.isArray(a.layout)) {
            const r = u[0].split(",");
            if (r.length === a.layout.length) {
              const l = {};
              for (let c = 0; c < r.length; c++)
                l[r[c]] = a.layout[c];
              return l;
            }
          }
        }
      }
    } catch {
    }
}
function sn({
  debounceSaveMs: e = 100,
  onlySaveAfterUserInteractions: t,
  panelIds: n,
  storage: o = localStorage,
  ...i
}) {
  const s = n !== void 0, u = "id" in i ? i.id : i.groupId, a = he(u, n ?? []), r = qe(
    Yt,
    () => o.getItem(a),
    () => o.getItem(a)
  ), l = Se(() => {
    if (r) {
      const d = JSON.parse(r), h = Object.values(d);
      if (Array.from(h).every((y) => typeof y == "number"))
        return d;
    }
  }, [r]), c = Se(() => {
    if (!l)
      return qt({
        id: u,
        panelIds: n,
        storage: o
      });
  }, [l, u, n, o]), m = l ?? c, p = O(null), S = re(() => {
    const d = p.current;
    d && (p.current = null, clearTimeout(d));
  }, []);
  Ke(() => () => {
    S();
  }, [S]);
  const z = re(
    // The hook persists every layout commit -- including library-driven ones --
    // because it owns its own storage and the goal is to remember whatever
    // layout the user is currently looking at. Consumers that only want to
    // persist on user interaction should branch on `isUserInteraction` in
    // their own callback (see #716) rather than via this hook.
    (d, h) => {
      if (t && !h.isUserInteraction)
        return;
      S();
      let y;
      s ? y = he(u, Object.keys(d)) : y = he(u, []);
      try {
        o.setItem(y, JSON.stringify(d));
      } catch (b) {
        console.error(b);
      }
    },
    [
      S,
      s,
      u,
      t,
      o
    ]
  ), f = re(
    (d) => {
      S(), e === 0 ? z(d, { isUserInteraction: !1 }) : p.current = setTimeout(() => {
        z(d, { isUserInteraction: !1 });
      }, e);
    },
    [S, e, z]
  );
  return {
    /**
     * Pass this value to `Group` as the `defaultLayout` prop.
     */
    defaultLayout: m,
    /**
     * Attach this callback on the `Group` as the `onLayoutChange` prop.
     *
     * @deprecated Use the {@link onLayoutChanged} prop instead.
     */
    onLayoutChange: f,
    /**
     * Attach this callback on the `Group` as the `onLayoutChanged` prop.
     */
    onLayoutChanged: z
  };
}
function Yt() {
  return function() {
  };
}
function an() {
  return Q(null);
}
function ln() {
  return O(null);
}
function Me() {
  const e = yt(ct);
  return C(
    e,
    "Group Context not found; did you render a Panel or Separator outside of a Group?"
  ), e;
}
function Jt(e, t) {
  const { id: n } = Me(), o = O({
    collapse: ye,
    expand: ye,
    getSize: () => ({
      asPercentage: 0,
      inPixels: 0
    }),
    isCollapsed: () => !1,
    resize: ye
  });
  Xe(t, () => o.current, []), q(() => {
    Object.assign(
      o.current,
      at({ groupId: n, panelId: e })
    );
  });
}
function Zt({
  children: e,
  className: t,
  collapsedSize: n = "0%",
  collapsible: o = !1,
  defaultSize: i,
  disabled: s,
  elementRef: u,
  groupResizeBehavior: a = "preserve-relative-size",
  id: r,
  maxSize: l = "100%",
  minSize: c = "0%",
  onResize: m,
  panelRef: p,
  style: S,
  ...z
}) {
  const f = !!r, d = Le(r), h = Re({
    disabled: s
  }), y = O(null), b = Ce(y, u), {
    getPanelStyles: v,
    id: g,
    orientation: w,
    registerPanel: M,
    updatePanelProps: L
  } = Me(), G = m !== null, N = se(
    (R, E, D) => {
      m?.(R, r, D);
    }
  );
  q(() => {
    const R = y.current;
    if (R !== null) {
      const E = {
        element: R,
        id: d,
        idIsStable: f,
        mutableValues: {
          expandToSize: void 0,
          prevSize: void 0
        },
        onResize: G ? N : void 0,
        panelConstraints: {
          groupResizeBehavior: a,
          collapsedSize: n,
          collapsible: o,
          defaultSize: i,
          disabled: h.disabled,
          maxSize: l,
          minSize: c
        }
      };
      return M(E);
    }
  }, [
    a,
    n,
    o,
    i,
    G,
    d,
    f,
    l,
    c,
    N,
    M,
    h
  ]), me(() => {
    L(d, { disabled: s });
  }, [s, d, L]), Jt(d, p);
  const x = () => {
    const R = v(g, d);
    if (R)
      return JSON.stringify(R);
  }, P = qe(
    (R) => Pe(g, R),
    x,
    x
  );
  let I;
  return P ? I = JSON.parse(P) : i !== void 0 ? I = {
    flexGrow: void 0,
    flexShrink: void 0,
    flexBasis: i
  } : I = { flexGrow: 1 }, /* @__PURE__ */ ae(
    "div",
    {
      ...z,
      "data-disabled": s || void 0,
      "data-panel": !0,
      "data-testid": d,
      id: d,
      ref: b,
      style: {
        ...Qt,
        display: "flex",
        flexBasis: 0,
        flexShrink: 1,
        overflow: "visible",
        ...I
      },
      children: /* @__PURE__ */ ae(
        "div",
        {
          className: t,
          style: {
            maxHeight: "100%",
            maxWidth: "100%",
            flexGrow: 1,
            overflow: "auto",
            ...S,
            // Inform the browser that the library is handling touch events for this element
            // but still allow users to scroll content within panels in the non-resizing direction
            // NOTE This is not an inherited style
            // See github.com/bvaughn/react-resizable-panels/issues/662
            touchAction: w === "horizontal" ? "pan-y" : "pan-x"
          },
          children: e
        }
      )
    }
  );
}
Zt.displayName = "Panel";
const Qt = {
  minHeight: 0,
  maxHeight: "100%",
  height: "auto",
  minWidth: 0,
  maxWidth: "100%",
  width: "auto",
  border: "none",
  borderWidth: 0,
  padding: 0,
  margin: 0
};
function un() {
  return Q(null);
}
function cn() {
  return O(null);
}
function en({
  layout: e,
  panelConstraints: t,
  panelId: n,
  panelIndex: o
}) {
  let i, s;
  const u = e[n], a = t.find(
    (r) => r.panelId === n
  );
  if (a) {
    const r = a.maxSize, l = a.collapsible ? a.collapsedSize : a.minSize, c = [o, o + 1];
    s = K({
      layout: le({
        delta: l - u,
        initialLayout: e,
        panelConstraints: t,
        pivotIndices: c,
        prevLayout: e
      }),
      panelConstraints: t
    })[n], i = K({
      layout: le({
        delta: r - u,
        initialLayout: e,
        panelConstraints: t,
        pivotIndices: c,
        prevLayout: e
      }),
      panelConstraints: t
    })[n];
  }
  return {
    valueControls: n,
    valueMax: i,
    valueMin: s,
    valueNow: u
  };
}
function tn({
  children: e,
  className: t,
  disabled: n,
  disableDoubleClick: o,
  elementRef: i,
  id: s,
  style: u,
  ...a
}) {
  const r = Le(s), l = Re({
    disabled: n,
    disableDoubleClick: o
  }), [c, m] = Q({}), [p, S] = Q("inactive"), [z, f] = Q(!1), d = O(null), h = Ce(d, i), {
    disableCursor: y,
    id: b,
    orientation: v,
    registerSeparator: g,
    updateSeparatorProps: w
  } = Me(), M = v === "horizontal" ? "vertical" : "horizontal";
  q(() => {
    const N = d.current;
    if (N !== null) {
      const x = {
        disabled: l.disabled,
        disableDoubleClick: l.disableDoubleClick,
        element: N,
        id: r
      }, P = g(x), I = Rt(
        (E) => {
          S(
            E.next.state !== "inactive" && E.next.hitRegions.some(
              (D) => D.separator === x
            ) ? E.next.state : "inactive"
          );
        }
      ), R = Pe(
        b,
        (E) => {
          const { derivedPanelConstraints: D, layout: V, separatorToPanels: ue } = E.next, oe = ue.get(x);
          if (oe) {
            const _ = oe[0], Y = oe.indexOf(_);
            m(
              en({
                layout: V,
                panelConstraints: D,
                panelId: _.id,
                panelIndex: Y
              })
            );
          }
        }
      );
      return () => {
        I(), R(), P();
      };
    }
  }, [b, r, g, l]), me(() => {
    w(r, { disabled: n, disableDoubleClick: o });
  }, [n, o, r, w]);
  let L;
  n && !y && (L = "not-allowed");
  let G;
  if (n)
    G = "disabled";
  else
    switch (p) {
      case "active": {
        G = "active";
        break;
      }
      default:
        z ? G = "focus" : G = p;
    }
  return /* @__PURE__ */ ae(
    "div",
    {
      ...a,
      "aria-controls": c.valueControls,
      "aria-disabled": n || void 0,
      "aria-orientation": M,
      "aria-valuemax": c.valueMax,
      "aria-valuemin": c.valueMin,
      "aria-valuenow": c.valueNow,
      children: e,
      className: t,
      "data-separator": G,
      "data-testid": r,
      id: r,
      onBlur: () => f(!1),
      onFocus: () => f(!0),
      ref: h,
      role: "separator",
      style: {
        flexBasis: "auto",
        cursor: L,
        ...u,
        flexGrow: 0,
        flexShrink: 0,
        // Inform the browser that the library is handling touch events for this element
        // See github.com/bvaughn/react-resizable-panels/issues/662
        touchAction: "none"
      },
      tabIndex: n ? void 0 : 0
    }
  );
}
tn.displayName = "Separator";
export {
  Xt as Group,
  Zt as Panel,
  tn as Separator,
  Ct as isCoarsePointer,
  sn as useDefaultLayout,
  an as useGroupCallbackRef,
  ln as useGroupRef,
  un as usePanelCallbackRef,
  cn as usePanelRef
};
//# sourceMappingURL=react-resizable-panels.js.map
