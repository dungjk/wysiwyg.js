// http://stackoverflow.com/questions/97962/debounce-clicks-when-submitting-a-web-form
export function debounce(callback, wait, cancelprevious) {
  var timeout;
  return function () {
    if (timeout) {
      if (!cancelprevious) return;
      clearTimeout(timeout);
    }
    var context = this,
      args = arguments;
    timeout = setTimeout(function () {
      timeout = null;
      callback.apply(context, args);
    }, wait);
  };
}

// save/restore selection
// http://stackoverflow.com/questions/13949059/persisting-the-changes-of-range-objects-after-selection-in-html/13950376#13950376
export function saveSelection(containerNode) {
  var sel = window.getSelection();
  if (sel.rangeCount > 0) return sel.getRangeAt(0);
  return null;
}
export function restoreSelection(containerNode, savedSel) {
  if (!savedSel) return;
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedSel);
}
