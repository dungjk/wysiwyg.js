// http://stackoverflow.com/questions/12949590/how-to-detach-event-in-ie-6-7-8-9-using-javascript
export function addEvent(element, type, handler, useCapture?: boolean) {
  element.addEventListener(type, handler, useCapture ? true : false);
}
export function removeEvent(element, type, handler, useCapture?: boolean) {
  element.removeEventListener(type, handler, useCapture ? true : false);
}
// prevent default
export function cancelEvent(e) {
  e.preventDefault();
  e.stopPropagation();
}

export function addClass(element, classname) {
  if (element.classList) element.classList.add(classname);
  // IE9
  else element.className += " " + classname;
}
export function removeClass(element, classname) {
  if (element.classList) element.classList.remove(classname);
}

// http://stackoverflow.com/questions/2234979/how-to-check-in-javascript-if-one-element-is-a-child-of-another
export function isOrContainsNode(ancestor, descendant, within?: boolean) {
  var node = within ? descendant.parentNode : descendant;
  while (node) {
    if (node === ancestor) return true;
    node = node.parentNode;
  }
  return false;
}
export function isMediaNode(node) {
  var name = node.nodeName;
  return (
    name == "IMG" ||
    name == "PICTURE" ||
    name == "SVG" ||
    name == "VIDEO" ||
    name == "AUDIO" ||
    name == "IFRAME" ||
    name == "MAP" ||
    name == "OBJECT" ||
    name == "EMBED"
  );
}

/**
 * Append DOM node to parent
 * @param {HTMLElement} parent
 * @param {HTMLElement} child
 */
export function appendChild(parent, child) {
  return parent && parent.appendChild(child);
}

/**
 * Insert an DOM element into parent before refChild
 * @param {HTMLElement} parent
 * @param {HTMLElement} newChild
 * @param {HTMLElement} refChild
 */
export function insertBefore(parent, newChild, refChild) {
  parent.insertBefore(newChild, refChild);
}

/**
 * Set DOM element attribute value
 * @param {HTMLElement} element
 * @param {String} name
 * @param {String} value
 */
export function setAttribute(element, name, value) {
  element.setAttribute(name, value);
}

/**
 * Set DOM element style
 * @param {HTMLElement} element
 * @param {String} name
 * @param {String} value
 */
export function setStyle(element, name, value) {
  element.style[name] = value;
}
