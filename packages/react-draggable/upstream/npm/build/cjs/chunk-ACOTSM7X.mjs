// lib/Draggable.tsx
import * as React2 from "react";
import PropTypes2 from "prop-types";
import ReactDOM2 from "react-dom";
import { clsx } from "clsx";

// lib/utils/shims.ts
function findInArray(array, callback) {
  for (let i = 0, length = array.length; i < length; i++) {
    if (callback.apply(callback, [array[i], i, array])) return array[i];
  }
}
function isFunction(func) {
  return typeof func === "function" || Object.prototype.toString.call(func) === "[object Function]";
}
function isNum(num) {
  return typeof num === "number" && !isNaN(num);
}
function int(a) {
  return parseInt(a, 10);
}
function dontSetMe(props, propName, componentName) {
  if (props[propName]) {
    return new Error(`Invalid prop ${propName} passed to ${componentName} - do not set this, set it on the child.`);
  }
}

// lib/utils/getPrefix.ts
var prefixes = ["Moz", "Webkit", "O", "ms"];
function getPrefix(prop = "transform") {
  var _a, _b;
  if (typeof window === "undefined") return "";
  const style = (_b = (_a = window.document) == null ? void 0 : _a.documentElement) == null ? void 0 : _b.style;
  if (!style) return "";
  if (prop in style) return "";
  for (let i = 0; i < prefixes.length; i++) {
    if (browserPrefixToKey(prop, prefixes[i]) in style) return prefixes[i];
  }
  return "";
}
function browserPrefixToKey(prop, prefix) {
  return prefix ? `${prefix}${kebabToTitleCase(prop)}` : prop;
}
function kebabToTitleCase(str) {
  let out = "";
  let shouldCapitalize = true;
  for (let i = 0; i < str.length; i++) {
    if (shouldCapitalize) {
      out += str[i].toUpperCase();
      shouldCapitalize = false;
    } else if (str[i] === "-") {
      shouldCapitalize = true;
    } else {
      out += str[i];
    }
  }
  return out;
}
var getPrefix_default = getPrefix();

// lib/utils/domFns.ts
var matchesSelectorFunc = "";
function matchesSelector(el, selector) {
  var _a;
  if (!matchesSelectorFunc) {
    matchesSelectorFunc = (_a = findInArray([
      "matches",
      "webkitMatchesSelector",
      "mozMatchesSelector",
      "msMatchesSelector",
      "oMatchesSelector"
    ], function(method) {
      return isFunction(el[method]);
    })) != null ? _a : "";
  }
  const matchFn = el[matchesSelectorFunc];
  if (!isFunction(matchFn)) return false;
  return Boolean(matchFn.call(el, selector));
}
function matchesSelectorAndParentsTo(el, selector, baseNode) {
  let node = el;
  do {
    if (matchesSelector(node, selector)) return true;
    if (node === baseNode) return false;
    node = node.parentNode;
  } while (node);
  return false;
}
function addEvent(el, event, handler, inputOptions) {
  if (!el) return;
  const options = { capture: true, ...inputOptions };
  const listener = handler;
  if (el.addEventListener) {
    el.addEventListener(event, listener, options);
  } else if (el.attachEvent) {
    el.attachEvent("on" + event, listener);
  } else {
    el["on" + event] = listener;
  }
}
function removeEvent(el, event, handler, inputOptions) {
  if (!el) return;
  const options = { capture: true, ...inputOptions };
  const listener = handler;
  if (el.removeEventListener) {
    el.removeEventListener(event, listener, options);
  } else if (el.detachEvent) {
    el.detachEvent("on" + event, listener);
  } else {
    el["on" + event] = null;
  }
}
function outerHeight(node) {
  let height = node.clientHeight;
  const computedStyle = node.ownerDocument.defaultView.getComputedStyle(node);
  height += int(computedStyle.borderTopWidth);
  height += int(computedStyle.borderBottomWidth);
  return height;
}
function outerWidth(node) {
  let width = node.clientWidth;
  const computedStyle = node.ownerDocument.defaultView.getComputedStyle(node);
  width += int(computedStyle.borderLeftWidth);
  width += int(computedStyle.borderRightWidth);
  return width;
}
function innerHeight(node) {
  let height = node.clientHeight;
  const computedStyle = node.ownerDocument.defaultView.getComputedStyle(node);
  height -= int(computedStyle.paddingTop);
  height -= int(computedStyle.paddingBottom);
  return height;
}
function innerWidth(node) {
  let width = node.clientWidth;
  const computedStyle = node.ownerDocument.defaultView.getComputedStyle(node);
  width -= int(computedStyle.paddingLeft);
  width -= int(computedStyle.paddingRight);
  return width;
}
function offsetXYFromParent(evt, offsetParent, scale) {
  const isBody = offsetParent === offsetParent.ownerDocument.body;
  const offsetParentRect = isBody ? { left: 0, top: 0 } : offsetParent.getBoundingClientRect();
  const x = (evt.clientX + offsetParent.scrollLeft - offsetParentRect.left) / scale;
  const y = (evt.clientY + offsetParent.scrollTop - offsetParentRect.top) / scale;
  return { x, y };
}
function createCSSTransform(controlPos, positionOffset) {
  const translation = getTranslation(controlPos, positionOffset, "px");
  return { [browserPrefixToKey("transform", getPrefix_default)]: translation };
}
function createSVGTransform(controlPos, positionOffset) {
  const translation = getTranslation(controlPos, positionOffset, "");
  return translation;
}
function getTranslation({ x, y }, positionOffset, unitSuffix) {
  let translation = `translate(${x}${unitSuffix},${y}${unitSuffix})`;
  if (positionOffset) {
    const defaultX = `${typeof positionOffset.x === "string" ? positionOffset.x : positionOffset.x + unitSuffix}`;
    const defaultY = `${typeof positionOffset.y === "string" ? positionOffset.y : positionOffset.y + unitSuffix}`;
    translation = `translate(${defaultX}, ${defaultY})` + translation;
  }
  return translation;
}
function getTouch(e, identifier) {
  return e.targetTouches && findInArray(e.targetTouches, (t) => identifier === t.identifier) || e.changedTouches && findInArray(e.changedTouches, (t) => identifier === t.identifier);
}
function getTouchIdentifier(e) {
  if (e.targetTouches && e.targetTouches[0]) return e.targetTouches[0].identifier;
  if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].identifier;
}
function getDefaultNonce() {
  return typeof __webpack_nonce__ !== "undefined" ? __webpack_nonce__ : void 0;
}
function addUserSelectStyles(doc, nonce) {
  if (!doc) return;
  let styleEl = doc.getElementById("react-draggable-style-el");
  if (!styleEl) {
    styleEl = doc.createElement("style");
    styleEl.type = "text/css";
    styleEl.id = "react-draggable-style-el";
    const resolvedNonce = nonce != null ? nonce : getDefaultNonce();
    if (resolvedNonce) styleEl.setAttribute("nonce", resolvedNonce);
    styleEl.innerHTML = ".react-draggable-transparent-selection *::-moz-selection {all: inherit;}\n";
    styleEl.innerHTML += ".react-draggable-transparent-selection *::selection {all: inherit;}\n";
    doc.getElementsByTagName("head")[0].appendChild(styleEl);
  }
  if (doc.body) addClassName(doc.body, "react-draggable-transparent-selection");
}
function scheduleRemoveUserSelectStyles(doc) {
  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(() => {
      removeUserSelectStyles(doc);
    });
  } else {
    removeUserSelectStyles(doc);
  }
}
function removeUserSelectStyles(doc) {
  if (!doc) return;
  try {
    if (doc.body) removeClassName(doc.body, "react-draggable-transparent-selection");
    const ieSelection = doc.selection;
    if (ieSelection) {
      ieSelection.empty();
    } else {
      const selection = (doc.defaultView || window).getSelection();
      if (selection && selection.type !== "Caret") {
        selection.removeAllRanges();
      }
    }
  } catch {
  }
}
function addClassName(el, className) {
  if (el.classList) {
    el.classList.add(className);
  } else {
    if (!el.className.match(new RegExp(`(?:^|\\s)${className}(?!\\S)`))) {
      el.className += ` ${className}`;
    }
  }
}
function removeClassName(el, className) {
  if (el.classList) {
    el.classList.remove(className);
  } else {
    el.className = el.className.replace(new RegExp(`(?:^|\\s)${className}(?!\\S)`, "g"), "");
  }
}

// lib/utils/positionFns.ts
function getBoundPosition(draggable, x, y) {
  if (!draggable.props.bounds) return [x, y];
  let { bounds } = draggable.props;
  bounds = typeof bounds === "string" ? bounds : cloneBounds(bounds);
  const node = findDOMNode(draggable);
  if (typeof bounds === "string") {
    const { ownerDocument } = node;
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) {
      throw new Error("Cannot resolve the owner window of the draggable node.");
    }
    let boundNode;
    if (bounds === "parent") {
      boundNode = node.parentNode;
    } else {
      const rootNode = node.getRootNode();
      boundNode = rootNode.querySelector(bounds);
    }
    if (!(boundNode instanceof ownerWindow.HTMLElement)) {
      throw new Error('Bounds selector "' + bounds + '" could not find an element.');
    }
    const boundNodeEl = boundNode;
    const nodeStyle = ownerWindow.getComputedStyle(node);
    const boundNodeStyle = ownerWindow.getComputedStyle(boundNodeEl);
    bounds = {
      left: -node.offsetLeft + int(boundNodeStyle.paddingLeft) + int(nodeStyle.marginLeft),
      top: -node.offsetTop + int(boundNodeStyle.paddingTop) + int(nodeStyle.marginTop),
      right: innerWidth(boundNodeEl) - outerWidth(node) - node.offsetLeft + int(boundNodeStyle.paddingRight) - int(nodeStyle.marginRight),
      bottom: innerHeight(boundNodeEl) - outerHeight(node) - node.offsetTop + int(boundNodeStyle.paddingBottom) - int(nodeStyle.marginBottom)
    };
  }
  if (isNum(bounds.right)) x = Math.min(x, bounds.right);
  if (isNum(bounds.bottom)) y = Math.min(y, bounds.bottom);
  if (isNum(bounds.left)) x = Math.max(x, bounds.left);
  if (isNum(bounds.top)) y = Math.max(y, bounds.top);
  return [x, y];
}
function snapToGrid(grid, pendingX, pendingY) {
  const x = Math.round(pendingX / grid[0]) * grid[0];
  const y = Math.round(pendingY / grid[1]) * grid[1];
  return [x, y];
}
function canDragX(draggable) {
  return draggable.props.axis === "both" || draggable.props.axis === "x";
}
function canDragY(draggable) {
  return draggable.props.axis === "both" || draggable.props.axis === "y";
}
function getControlPosition(e, touchIdentifier, draggableCore) {
  const touchObj = typeof touchIdentifier === "number" ? getTouch(e, touchIdentifier) : null;
  if (typeof touchIdentifier === "number" && !touchObj) return null;
  const node = findDOMNode(draggableCore);
  const offsetParent = draggableCore.props.offsetParent || node.offsetParent || node.ownerDocument.body;
  return offsetXYFromParent(touchObj || e, offsetParent, draggableCore.props.scale);
}
function createCoreData(draggable, x, y) {
  const isStart = !isNum(draggable.lastX);
  const node = findDOMNode(draggable);
  if (isStart) {
    return {
      node,
      deltaX: 0,
      deltaY: 0,
      lastX: x,
      lastY: y,
      x,
      y
    };
  } else {
    return {
      node,
      deltaX: x - draggable.lastX,
      deltaY: y - draggable.lastY,
      lastX: draggable.lastX,
      lastY: draggable.lastY,
      x,
      y
    };
  }
}
function createDraggableData(draggable, coreData) {
  const scale = draggable.props.scale;
  return {
    node: coreData.node,
    x: draggable.state.x + coreData.deltaX / scale,
    y: draggable.state.y + coreData.deltaY / scale,
    deltaX: coreData.deltaX / scale,
    deltaY: coreData.deltaY / scale,
    lastX: draggable.state.x,
    lastY: draggable.state.y
  };
}
function cloneBounds(bounds) {
  return {
    left: bounds.left,
    top: bounds.top,
    right: bounds.right,
    bottom: bounds.bottom
  };
}
function findDOMNode(draggable) {
  const node = draggable.findDOMNode();
  if (!node) {
    throw new Error("<DraggableCore>: Unmounted during event!");
  }
  return node;
}

// lib/DraggableCore.tsx
import * as React from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

// lib/utils/log.ts
var log = typeof process !== "undefined" && process.env.DRAGGABLE_DEBUG ? console.log.bind(console) : function noop() {
};
var log_default = log;

// lib/DraggableCore.tsx
var eventsFor = {
  touch: {
    start: "touchstart",
    move: "touchmove",
    stop: "touchend"
  },
  mouse: {
    start: "mousedown",
    move: "mousemove",
    stop: "mouseup"
  }
};
var dragEventFor = eventsFor.mouse;
var DraggableCore = class extends React.Component {
  constructor() {
    super(...arguments);
    this.dragging = false;
    // Used while dragging to determine deltas.
    this.lastX = NaN;
    this.lastY = NaN;
    this.touchIdentifier = null;
    this.mounted = false;
    this.handleDragStart = (e) => {
      this.props.onMouseDown(e);
      if (!this.props.allowAnyClick && (typeof e.button === "number" && e.button !== 0 || e.ctrlKey)) return false;
      const thisNode = this.findDOMNode();
      if (!thisNode || !thisNode.ownerDocument || !thisNode.ownerDocument.body) {
        throw new Error("<DraggableCore> not mounted on DragStart!");
      }
      const { ownerDocument } = thisNode;
      if (this.props.disabled || !(e.target instanceof ownerDocument.defaultView.Node) || this.props.handle && !matchesSelectorAndParentsTo(e.target, this.props.handle, thisNode) || this.props.cancel && matchesSelectorAndParentsTo(e.target, this.props.cancel, thisNode)) {
        return;
      }
      if (e.type === "touchstart" && !this.props.allowMobileScroll) e.preventDefault();
      const touchIdentifier = getTouchIdentifier(e);
      this.touchIdentifier = touchIdentifier;
      const position = getControlPosition(e, touchIdentifier, this);
      if (position == null) return;
      const { x, y } = position;
      const coreEvent = createCoreData(this, x, y);
      log_default("DraggableCore: handleDragStart: %j", coreEvent);
      log_default("calling", this.props.onStart);
      const shouldUpdate = this.props.onStart(e, coreEvent);
      if (shouldUpdate === false || this.mounted === false) return;
      if (this.props.enableUserSelectHack) addUserSelectStyles(ownerDocument, this.props.nonce);
      this.dragging = true;
      this.lastX = x;
      this.lastY = y;
      addEvent(ownerDocument, dragEventFor.move, this.handleDrag);
      addEvent(ownerDocument, dragEventFor.stop, this.handleDragStop);
    };
    this.handleDrag = (e) => {
      const position = getControlPosition(e, this.touchIdentifier, this);
      if (position == null) return;
      let { x, y } = position;
      if (Array.isArray(this.props.grid)) {
        let deltaX = x - this.lastX, deltaY = y - this.lastY;
        [deltaX, deltaY] = snapToGrid(this.props.grid, deltaX, deltaY);
        if (!deltaX && !deltaY) return;
        x = this.lastX + deltaX;
        y = this.lastY + deltaY;
      }
      const coreEvent = createCoreData(this, x, y);
      log_default("DraggableCore: handleDrag: %j", coreEvent);
      const shouldUpdate = this.props.onDrag(e, coreEvent);
      if (shouldUpdate === false || this.mounted === false) {
        try {
          this.handleDragStop(new MouseEvent("mouseup"));
        } catch {
          const event = document.createEvent("MouseEvents");
          event.initMouseEvent("mouseup", true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
          this.handleDragStop(event);
        }
        return;
      }
      this.lastX = x;
      this.lastY = y;
    };
    this.handleDragStop = (e) => {
      if (!this.dragging) return;
      const position = getControlPosition(e, this.touchIdentifier, this);
      if (position == null) return;
      let { x, y } = position;
      if (Array.isArray(this.props.grid)) {
        let deltaX = x - this.lastX || 0;
        let deltaY = y - this.lastY || 0;
        [deltaX, deltaY] = snapToGrid(this.props.grid, deltaX, deltaY);
        x = this.lastX + deltaX;
        y = this.lastY + deltaY;
      }
      const coreEvent = createCoreData(this, x, y);
      const shouldContinue = this.props.onStop(e, coreEvent);
      if (shouldContinue === false || this.mounted === false) return false;
      const thisNode = this.findDOMNode();
      if (thisNode) {
        if (this.props.enableUserSelectHack) scheduleRemoveUserSelectStyles(thisNode.ownerDocument);
      }
      log_default("DraggableCore: handleDragStop: %j", coreEvent);
      this.dragging = false;
      this.lastX = NaN;
      this.lastY = NaN;
      if (thisNode) {
        log_default("DraggableCore: Removing handlers");
        removeEvent(thisNode.ownerDocument, dragEventFor.move, this.handleDrag);
        removeEvent(thisNode.ownerDocument, dragEventFor.stop, this.handleDragStop);
      }
    };
    this.onMouseDown = (e) => {
      dragEventFor = eventsFor.mouse;
      return this.handleDragStart(e);
    };
    this.onMouseUp = (e) => {
      dragEventFor = eventsFor.mouse;
      return this.handleDragStop(e);
    };
    // Same as onMouseDown (start drag), but now consider this a touch device.
    this.onTouchStart = (e) => {
      dragEventFor = eventsFor.touch;
      return this.handleDragStart(e);
    };
    this.onTouchEnd = (e) => {
      dragEventFor = eventsFor.touch;
      return this.handleDragStop(e);
    };
  }
  componentDidMount() {
    this.mounted = true;
    const thisNode = this.findDOMNode();
    if (thisNode) {
      addEvent(thisNode, eventsFor.touch.start, this.onTouchStart, { passive: false });
    }
  }
  componentWillUnmount() {
    this.mounted = false;
    const thisNode = this.findDOMNode();
    if (thisNode) {
      const { ownerDocument } = thisNode;
      removeEvent(ownerDocument, eventsFor.mouse.move, this.handleDrag);
      removeEvent(ownerDocument, eventsFor.touch.move, this.handleDrag);
      removeEvent(ownerDocument, eventsFor.mouse.stop, this.handleDragStop);
      removeEvent(ownerDocument, eventsFor.touch.stop, this.handleDragStop);
      removeEvent(thisNode, eventsFor.touch.start, this.onTouchStart, { passive: false });
      if (this.props.enableUserSelectHack) scheduleRemoveUserSelectStyles(ownerDocument);
    }
  }
  // React 19 removed ReactDOM.findDOMNode, so nodeRef is now required.
  // For backward compatibility with React 18 and earlier, we still support findDOMNode if available.
  findDOMNode() {
    var _a;
    if ((_a = this.props) == null ? void 0 : _a.nodeRef) {
      return this.props.nodeRef.current;
    }
    const legacyReactDOM = ReactDOM;
    if (typeof legacyReactDOM.findDOMNode === "function") {
      return legacyReactDOM.findDOMNode(this);
    }
    log_default(
      "react-draggable: ReactDOM.findDOMNode is not available in React 19+. You must provide a nodeRef prop. See: https://github.com/react-grid-layout/react-draggable#noderef"
    );
    return null;
  }
  render() {
    return React.cloneElement(React.Children.only(this.props.children), {
      // Note: mouseMove handler is attached to document so it will still function
      // when the user drags quickly and leaves the bounds of the element.
      onMouseDown: this.onMouseDown,
      onMouseUp: this.onMouseUp,
      // onTouchStart is added on `componentDidMount` so they can be added with
      // {passive: false}, which allows it to cancel. See
      // https://developers.google.com/web/updates/2017/01/scrolling-intervention
      onTouchEnd: this.onTouchEnd
    });
  }
};
DraggableCore.displayName = "DraggableCore";
// Both the annotation and the `?` are load-bearing:
//  - The index-signature annotation stops tsc from inferring the
//    PropTypes.Requireable<...> types and emitting `import PropTypes from
//    'prop-types'` into the generated public .d.ts, which would force consumers
//    to install @types/prop-types (the v4.5.0 hand-written typings had none).
//  - The `?` keeps `propTypes` from being a *required* member of the public
//    type. React <= 18's JSX LibraryManagedAttributes only consults a
//    component's `propTypes` when it is required (`C extends {propTypes: ...}`);
//    when it does, this index-signature `propTypes` makes `defaultProps` stop
//    marking props optional, so consumers are forced to pass every prop.
//    Optional dodges that branch; React 19 ignores `propTypes` entirely. The
//    typings/tsconfig.react18.json check guards against a regression here.
// Do not remove. See lib/Draggable.tsx for the same guard.
DraggableCore.propTypes = {
  /**
   * `allowAnyClick` allows dragging using any mouse button.
   * By default, we only accept the left button.
   *
   * Defaults to `false`.
   */
  allowAnyClick: PropTypes.bool,
  /**
   * `allowMobileScroll` turns off cancellation of the 'touchstart' event
   * on mobile devices. Only enable this if you are having trouble with click
   * events. Prefer using 'handle' / 'cancel' instead.
   *
   * Defaults to `false`.
   */
  allowMobileScroll: PropTypes.bool,
  children: PropTypes.node.isRequired,
  /**
   * `disabled`, if true, stops the <Draggable> from dragging. All handlers,
   * with the exception of `onMouseDown`, will not fire.
   */
  disabled: PropTypes.bool,
  /**
   * By default, we add 'user-select:none' attributes to the document body
   * to prevent ugly text selection during drag. If this is causing problems
   * for your app, set this to `false`.
   */
  enableUserSelectHack: PropTypes.bool,
  /**
   * `offsetParent`, if set, uses the passed DOM node to compute drag offsets
   * instead of using the parent node.
   */
  offsetParent: function(props, propName) {
    if (props[propName] && props[propName].nodeType !== 1) {
      throw new Error("Draggable's offsetParent must be a DOM Node.");
    }
  },
  /**
   * `grid` specifies the x and y that dragging should snap to.
   */
  grid: PropTypes.arrayOf(PropTypes.number),
  /**
   * `handle` specifies a selector to be used as the handle that initiates drag.
   *
   * Example:
   *
   * ```jsx
   *   let App = React.createClass({
   *       render: function () {
   *         return (
   *            <Draggable handle=".handle">
   *              <div>
   *                  <div className="handle">Click me to drag</div>
   *                  <div>This is some other content</div>
   *              </div>
   *           </Draggable>
   *         );
   *       }
   *   });
   * ```
   */
  handle: PropTypes.string,
  /**
   * `cancel` specifies a selector to be used to prevent drag initialization.
   *
   * Example:
   *
   * ```jsx
   *   let App = React.createClass({
   *       render: function () {
   *           return(
   *               <Draggable cancel=".cancel">
   *                   <div>
   *                     <div className="cancel">You can't drag from here</div>
   *                     <div>Dragging here works fine</div>
   *                   </div>
   *               </Draggable>
   *           );
   *       }
   *   });
   * ```
   */
  cancel: PropTypes.string,
  /* If running in React Strict mode, ReactDOM.findDOMNode() is deprecated.
   * Unfortunately, in order for <Draggable> to work properly, we need raw access
   * to the underlying DOM node. If you want to avoid the warning, pass a `nodeRef`
   * as in this example:
   *
   * function MyComponent() {
   *   const nodeRef = React.useRef(null);
   *   return (
   *     <Draggable nodeRef={nodeRef}>
   *       <div ref={nodeRef}>Example Target</div>
   *     </Draggable>
   *   );
   * }
   *
   * This can be used for arbitrarily nested components, so long as the ref ends up
   * pointing to the actual child DOM node and not a custom component.
   */
  nodeRef: PropTypes.object,
  /**
   * `nonce` is applied to the dynamically-injected <style> element used by the
   * user-select hack, so it isn't blocked under a strict Content Security
   * Policy (`style-src` without `'unsafe-inline'`). If omitted, webpack's
   * `__webpack_nonce__` global is used when available.
   */
  nonce: PropTypes.string,
  /**
   * Called when dragging starts.
   * If this function returns the boolean false, dragging will be canceled.
   */
  onStart: PropTypes.func,
  /**
   * Called while dragging.
   * If this function returns the boolean false, dragging will be canceled.
   */
  onDrag: PropTypes.func,
  /**
   * Called when dragging stops.
   * If this function returns the boolean false, the drag will remain active.
   */
  onStop: PropTypes.func,
  /**
   * A workaround option which can be passed if onMouseDown needs to be accessed,
   * since it'll always be blocked (as there is internal use of onMouseDown)
   */
  onMouseDown: PropTypes.func,
  /**
   * `scale`, if set, applies scaling while dragging an element
   */
  scale: PropTypes.number,
  /**
   * These properties should be defined on the child, not here.
   */
  className: dontSetMe,
  style: dontSetMe,
  transform: dontSetMe
};
// Typed as the full `DraggableCoreProps` (not just the default-provided subset)
// so React's JSX LibraryManagedAttributes treats EVERY prop as optional for
// consumers, matching the historical hand-written typings. At runtime only the
// default-able props are actually populated.
DraggableCore.defaultProps = {
  allowAnyClick: false,
  // by default only accept left click
  allowMobileScroll: false,
  disabled: false,
  enableUserSelectHack: true,
  onStart: function() {
  },
  onDrag: function() {
  },
  onStop: function() {
  },
  onMouseDown: function() {
  },
  scale: 1
};

// lib/Draggable.tsx
var Draggable = class extends React2.Component {
  constructor(props) {
    super(props);
    this.onDragStart = (e, coreData) => {
      log_default("Draggable: onDragStart: %j", coreData);
      const shouldStart = this.props.onStart(e, createDraggableData(this, coreData));
      if (shouldStart === false) return false;
      this.setState({ dragging: true, dragged: true });
    };
    this.onDrag = (e, coreData) => {
      if (!this.state.dragging) return false;
      log_default("Draggable: onDrag: %j", coreData);
      const uiData = createDraggableData(this, coreData);
      const newState = {
        x: uiData.x,
        y: uiData.y,
        slackX: 0,
        slackY: 0
      };
      if (this.props.bounds) {
        const { x, y } = newState;
        newState.x += this.state.slackX;
        newState.y += this.state.slackY;
        const [newStateX, newStateY] = getBoundPosition(this, newState.x, newState.y);
        newState.x = newStateX;
        newState.y = newStateY;
        newState.slackX = this.state.slackX + (x - newState.x);
        newState.slackY = this.state.slackY + (y - newState.y);
        uiData.x = newState.x;
        uiData.y = newState.y;
        uiData.deltaX = newState.x - this.state.x;
        uiData.deltaY = newState.y - this.state.y;
      }
      const shouldUpdate = this.props.onDrag(e, uiData);
      if (shouldUpdate === false) return false;
      this.setState(newState);
    };
    this.onDragStop = (e, coreData) => {
      if (!this.state.dragging) return false;
      const shouldContinue = this.props.onStop(e, createDraggableData(this, coreData));
      if (shouldContinue === false) return false;
      log_default("Draggable: onDragStop: %j", coreData);
      const newState = {
        dragging: false,
        slackX: 0,
        slackY: 0
      };
      const controlled = Boolean(this.props.position);
      if (controlled) {
        const { x, y } = this.props.position;
        newState.x = x;
        newState.y = y;
      }
      this.setState(newState);
    };
    this.state = {
      // Whether or not we are currently dragging.
      dragging: false,
      // Whether or not we have been dragged before.
      dragged: false,
      // Current transform x and y.
      x: props.position ? props.position.x : props.defaultPosition.x,
      y: props.position ? props.position.y : props.defaultPosition.y,
      prevPropsPosition: { ...props.position },
      // Used for compensating for out-of-bounds drags
      slackX: 0,
      slackY: 0,
      // Can only determine if SVG after mounting
      isElementSVG: false
    };
    if (props.position && !(props.onDrag || props.onStop)) {
      console.warn("A `position` was applied to this <Draggable>, without drag handlers. This will make this component effectively undraggable. Please attach `onDrag` or `onStop` handlers so you can adjust the `position` of this element.");
    }
  }
  // React 16.3+
  // Arity (props, state)
  static getDerivedStateFromProps({ position }, { prevPropsPosition }) {
    if (position && (!prevPropsPosition || position.x !== prevPropsPosition.x || position.y !== prevPropsPosition.y)) {
      log_default("Draggable: getDerivedStateFromProps %j", { position, prevPropsPosition });
      return {
        x: position.x,
        y: position.y,
        prevPropsPosition: { ...position }
      };
    }
    return null;
  }
  componentDidMount() {
    if (typeof window.SVGElement !== "undefined" && this.findDOMNode() instanceof window.SVGElement) {
      this.setState({ isElementSVG: true });
    }
  }
  componentWillUnmount() {
    if (this.state.dragging) {
      this.setState({ dragging: false });
    }
  }
  // React 19 removed ReactDOM.findDOMNode, so nodeRef is now required.
  // For backward compatibility with React 18 and earlier, we still support findDOMNode if available.
  findDOMNode() {
    var _a;
    if ((_a = this.props) == null ? void 0 : _a.nodeRef) {
      return this.props.nodeRef.current;
    }
    const legacyReactDOM = ReactDOM2;
    if (typeof legacyReactDOM.findDOMNode === "function") {
      return legacyReactDOM.findDOMNode(this);
    }
    return null;
  }
  render() {
    const {
      axis,
      bounds,
      children,
      defaultPosition,
      defaultClassName,
      defaultClassNameDragging,
      defaultClassNameDragged,
      position,
      positionOffset,
      scale,
      ...draggableCoreProps
    } = this.props;
    let style = {};
    let svgTransform = null;
    const controlled = Boolean(position);
    const draggable = !controlled || this.state.dragging;
    const validPosition = position || defaultPosition;
    const transformOpts = {
      // Set left if horizontal drag is enabled
      x: canDragX(this) && draggable ? this.state.x : validPosition.x,
      // Set top if vertical drag is enabled
      y: canDragY(this) && draggable ? this.state.y : validPosition.y
    };
    if (this.state.isElementSVG) {
      svgTransform = createSVGTransform(transformOpts, positionOffset);
    } else {
      style = createCSSTransform(transformOpts, positionOffset);
    }
    const onlyChild = React2.Children.only(children);
    const className = clsx(onlyChild.props.className || "", defaultClassName, {
      [defaultClassNameDragging]: this.state.dragging,
      [defaultClassNameDragged]: this.state.dragged
    });
    return /* @__PURE__ */ React2.createElement(DraggableCore, { ...draggableCoreProps, onStart: this.onDragStart, onDrag: this.onDrag, onStop: this.onDragStop }, React2.cloneElement(onlyChild, {
      className,
      style: { ...onlyChild.props.style, ...style },
      transform: svgTransform
    }));
  }
};
Draggable.displayName = "Draggable";
// Both the annotation and the `?` are load-bearing:
//  - The index-signature annotation stops tsc from inferring the
//    PropTypes.Requireable<...> types and emitting `import PropTypes from
//    'prop-types'` into the generated public .d.ts, which would force consumers
//    to install @types/prop-types (the v4.5.0 hand-written typings had none).
//  - The `?` keeps `propTypes` from being a *required* member of the public
//    type. React <= 18's JSX LibraryManagedAttributes only consults a
//    component's `propTypes` when it is required (`C extends {propTypes: ...}`);
//    when it does, this index-signature `propTypes` makes `defaultProps` stop
//    marking props optional, so consumers are forced to pass every prop.
//    Optional dodges that branch; React 19 ignores `propTypes` entirely. The
//    typings/tsconfig.react18.json check guards against a regression here.
// Do not remove. See lib/DraggableCore.tsx for the same guard.
Draggable.propTypes = {
  // Accepts all props <DraggableCore> accepts.
  ...DraggableCore.propTypes,
  /**
   * `axis` determines which axis the draggable can move.
   *
   *  Note that all callbacks will still return data as normal. This only
   *  controls flushing to the DOM.
   *
   * 'both' allows movement horizontally and vertically.
   * 'x' limits movement to horizontal axis.
   * 'y' limits movement to vertical axis.
   * 'none' limits all movement.
   *
   * Defaults to 'both'.
   */
  axis: PropTypes2.oneOf(["both", "x", "y", "none"]),
  /**
   * `bounds` determines the range of movement available to the element.
   * Available values are:
   *
   * 'parent' restricts movement within the Draggable's parent node.
   *
   * Alternatively, pass an object with the following properties, all of which are optional:
   *
   * {left: LEFT_BOUND, right: RIGHT_BOUND, bottom: BOTTOM_BOUND, top: TOP_BOUND}
   *
   * All values are in px.
   *
   * Example:
   *
   * ```jsx
   *   let App = React.createClass({
   *       render: function () {
   *         return (
   *            <Draggable bounds={{right: 300, bottom: 300}}>
   *              <div>Content</div>
   *           </Draggable>
   *         );
   *       }
   *   });
   * ```
   */
  bounds: PropTypes2.oneOfType([
    PropTypes2.shape({
      left: PropTypes2.number,
      right: PropTypes2.number,
      top: PropTypes2.number,
      bottom: PropTypes2.number
    }),
    PropTypes2.string,
    PropTypes2.oneOf([false])
  ]),
  defaultClassName: PropTypes2.string,
  defaultClassNameDragging: PropTypes2.string,
  defaultClassNameDragged: PropTypes2.string,
  /**
   * `defaultPosition` specifies the x and y that the dragged item should start at
   *
   * Example:
   *
   * ```jsx
   *      let App = React.createClass({
   *          render: function () {
   *              return (
   *                  <Draggable defaultPosition={{x: 25, y: 25}}>
   *                      <div>I start with transformX: 25px and transformY: 25px;</div>
   *                  </Draggable>
   *              );
   *          }
   *      });
   * ```
   */
  defaultPosition: PropTypes2.shape({
    x: PropTypes2.number,
    y: PropTypes2.number
  }),
  positionOffset: PropTypes2.shape({
    x: PropTypes2.oneOfType([PropTypes2.number, PropTypes2.string]),
    y: PropTypes2.oneOfType([PropTypes2.number, PropTypes2.string])
  }),
  /**
   * `position`, if present, defines the current position of the element.
   *
   *  This is similar to how form elements in React work - if no `position` is supplied, the component
   *  is uncontrolled.
   *
   * Example:
   *
   * ```jsx
   *      let App = React.createClass({
   *          render: function () {
   *              return (
   *                  <Draggable position={{x: 25, y: 25}}>
   *                      <div>I start with transformX: 25px and transformY: 25px;</div>
   *                  </Draggable>
   *              );
   *          }
   *      });
   * ```
   */
  position: PropTypes2.shape({
    x: PropTypes2.number,
    y: PropTypes2.number
  }),
  /**
   * These properties should be defined on the child, not here.
   */
  className: dontSetMe,
  style: dontSetMe,
  transform: dontSetMe
};
// Typed as the full `DraggableProps` (not just the default-provided subset) so
// React's JSX LibraryManagedAttributes treats EVERY prop as optional for
// consumers, matching the historical hand-written typings. At runtime only the
// default-able props are actually populated.
Draggable.defaultProps = {
  ...DraggableCore.defaultProps,
  axis: "both",
  bounds: false,
  defaultClassName: "react-draggable",
  defaultClassNameDragging: "react-draggable-dragging",
  defaultClassNameDragged: "react-draggable-dragged",
  defaultPosition: { x: 0, y: 0 },
  scale: 1
};

export {
  DraggableCore,
  Draggable
};
//# sourceMappingURL=chunk-ACOTSM7X.mjs.map