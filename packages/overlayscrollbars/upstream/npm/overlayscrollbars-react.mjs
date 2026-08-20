import w, { useMemo as C, useRef as d, useEffect as p, forwardRef as E, useImperativeHandle as O } from "react";
import { OverlayScrollbars as I } from "overlayscrollbars";
const S = () => {
  if (typeof window > "u") {
    const n = () => {
    };
    return [n, n];
  }
  let l, o;
  const t = window, c = typeof t.requestIdleCallback == "function", a = t.requestAnimationFrame, i = t.cancelAnimationFrame, r = c ? t.requestIdleCallback : a, u = c ? t.cancelIdleCallback : i, s = () => {
    u(l), i(o);
  };
  return [
    (n, e) => {
      s(), l = r(
        c ? () => {
          s(), o = a(n);
        } : n,
        typeof e == "object" ? e : { timeout: 2233 }
      );
    },
    s
  ];
}, F = (l) => {
  const { options: o, events: t, defer: c } = l || {}, [a, i] = C(S, []), r = d(null), u = d(c), s = d(o), n = d(t);
  return p(() => {
    u.current = c;
  }, [c]), p(() => {
    const { current: e } = r;
    s.current = o, I.valid(e) && e.options(o || {}, !0);
  }, [o]), p(() => {
    const { current: e } = r;
    n.current = t, I.valid(e) && e.on(t || {}, !0);
  }, [t]), p(
    () => () => {
      var e;
      i(), (e = r.current) == null || e.destroy();
    },
    []
  ), C(
    () => [
      (e) => {
        const v = r.current;
        if (I.valid(v))
          return;
        const f = u.current, y = s.current || {}, b = n.current || {}, m = () => r.current = I(e, y, b);
        f ? a(m, f) : m();
      },
      () => r.current
    ],
    []
  );
}, q = (l, o) => {
  const { element: t = "div", options: c, events: a, defer: i, children: r, ...u } = l, s = t, n = d(null), e = d(null), [v, f] = F({ options: c, events: a, defer: i });
  return p(() => {
    const { current: y } = n, { current: b } = e;
    if (!y)
      return;
    const m = y;
    return v(
      t === "body" ? {
        target: m,
        cancel: {
          body: null
        }
      } : {
        target: m,
        elements: {
          viewport: b,
          content: b
        }
      }
    ), () => {
      var R;
      return (R = f()) == null ? void 0 : R.destroy();
    };
  }, [v, t]), O(
    o,
    () => ({
      osInstance: f,
      getElement: () => n.current
    }),
    []
  ), // @ts-ignore
  /* @__PURE__ */ w.createElement(s, { "data-overlayscrollbars-initialize": "", ref: n, ...u }, t === "body" ? r : /* @__PURE__ */ w.createElement("div", { "data-overlayscrollbars-contents": "", ref: e }, r));
}, g = E(q);
export {
  g as OverlayScrollbarsComponent,
  F as useOverlayScrollbars
};
//# sourceMappingURL=overlayscrollbars-react.mjs.map
