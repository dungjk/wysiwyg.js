import "./wysiwyg.scss";
import { debounce, saveSelection, restoreSelection, htmlEncode } from "./utils";
import {
  addEvent,
  removeEvent,
  cancelEvent,
  addClass,
  removeClass,
  isOrContainsNode,
  isMediaNode,
  appendChild,
  insertBefore,
  setAttribute,
  setStyle,
} from "./dom";
import { HSVtoRGB } from "./colors";
import { MathMin, MathMax, MathFloor } from "./math";
import { filecontents_multiple } from "./file-content";

// http://stackoverflow.com/questions/12603397/calculate-width-height-of-the-selected-text-javascript
// http://stackoverflow.com/questions/6846230/coordinates-of-selected-text-in-browser-page
var getSelectionRect = () => {
  var sel = window.getSelection();
  if (!sel.rangeCount) return false;
  var range = sel.getRangeAt(0).cloneRange();
  var boundingRect = range.getBoundingClientRect();
  // Safari 5.1 returns null, IE9 returns 0/0/0/0 if image selected
  if (
    boundingRect &&
    boundingRect.left &&
    boundingRect.top &&
    boundingRect.right &&
    boundingRect.bottom
  )
    return {
      // Modern browsers return floating-point numbers
      left: boundingRect.left,
      top: boundingRect.top,
      width: boundingRect.right - boundingRect.left,
      height: boundingRect.bottom - boundingRect.top,
    };
  // on Webkit 'range.getBoundingClientRect()' sometimes return 0/0/0/0 - but 'range.getClientRects()' works
  var rects: DOMRectList = range.getClientRects
    ? range.getClientRects()
    : (([] as any) as DOMRectList);
  for (var i = 0; i < rects.length; ++i) {
    var rect = rects[i];
    if (rect.left && rect.top && rect.right && rect.bottom)
      return {
        // Modern browsers return floating-point numbers
        left: rect.left,
        top: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top,
      };
  }
  return false;
};

var getSelectionCollapsed = (containerNode) => {
  var sel = window.getSelection();
  if (sel.isCollapsed) return true;
  return false;
};

// http://stackoverflow.com/questions/7781963/js-get-array-of-all-selected-nodes-in-contenteditable-div
var getSelectedNodes = (containerNode) => {
  var sel = window.getSelection();
  if (!sel.rangeCount) return [];
  var nodes = [];
  for (var i = 0; i < sel.rangeCount; ++i) {
    var range = sel.getRangeAt(i),
      node = range.startContainer,
      endNode = range.endContainer;
    while (node) {
      // add this node?
      if (node != containerNode) {
        var node_inside_selection = false;
        if (sel.containsNode)
          node_inside_selection = sel.containsNode(node, true);
        // IE11
        else {
          // http://stackoverflow.com/questions/5884210/how-to-find-if-a-htmlelement-is-enclosed-in-selected-text
          var noderange = document.createRange();
          noderange.selectNodeContents(node);
          for (var i = 0; i < sel.rangeCount; ++i) {
            var range = sel.getRangeAt(i);
            // start after or end before -> skip node
            if (
              range.compareBoundaryPoints(range.END_TO_START, noderange) >= 0 &&
              range.compareBoundaryPoints(range.START_TO_END, noderange) <= 0
            ) {
              node_inside_selection = true;
              break;
            }
          }
        }
        if (node_inside_selection) nodes.push(node);
      }
      // http://stackoverflow.com/questions/667951/how-to-get-nodes-lying-inside-a-range-with-javascript
      var nextNode = (node, container) => {
        if (node.firstChild) return node.firstChild;
        while (node) {
          if (node == container)
            // do not walk out of the container
            return null;
          if (node.nextSibling) return node.nextSibling;
          node = node.parentNode;
        }
        return null;
      };
      node = nextNode(node, node == endNode ? endNode : containerNode);
    }
  }
  // Fallback
  if (
    nodes.length == 0 &&
    isOrContainsNode(containerNode, sel.focusNode) &&
    sel.focusNode != containerNode
  )
    nodes.push(sel.focusNode);
  return nodes;
};

// http://stackoverflow.com/questions/8513368/collapse-selection-to-start-of-selection-not-div
var collapseSelectionEnd = () => {
  var sel = window.getSelection();
  if (!sel.isCollapsed) {
    // Form-submits via Enter throw 'NS_ERROR_FAILURE' on Firefox 34
    try {
      sel.collapseToEnd();
    } catch (e) {}
  }
};

// http://stackoverflow.com/questions/15157435/get-last-character-before-caret-position-in-javascript
// http://stackoverflow.com/questions/11247737/how-can-i-get-the-word-that-the-caret-is-upon-inside-a-contenteditable-div
var expandSelectionCaret = (containerNode, preceding, following) => {
  var sel = window.getSelection() as any;
  if (sel.modify) {
    for (var i = 0; i < preceding; ++i)
      sel.modify("extend", "backward", "character");
    for (var i = 0; i < following; ++i)
      sel.modify("extend", "forward", "character");
  } else {
    // not so easy if the steps would cover multiple nodes ...
    var range = sel.getRangeAt(0);
    range.setStart(range.startContainer, range.startOffset - preceding);
    range.setEnd(range.endContainer, range.endOffset + following);
    sel.removeAllRanges();
    sel.addRange(range);
  }
};

// http://stackoverflow.com/questions/4652734/return-html-from-a-user-selected-text/4652824#4652824
var getSelectionHtml = (containerNode) => {
  if (getSelectionCollapsed(containerNode)) return null;
  var sel = window.getSelection();
  if (sel.rangeCount) {
    var container = document.createElement("div"),
      len = sel.rangeCount;
    for (var i = 0; i < len; ++i) {
      var contents = sel.getRangeAt(i).cloneContents();
      appendChild(container, contents);
    }
    return container.innerHTML;
  }
  return null;
};

var selectionInside = (containerNode, force?: boolean) => {
  // selection inside editor?
  var sel = window.getSelection();
  if (
    isOrContainsNode(containerNode, sel.anchorNode) &&
    isOrContainsNode(containerNode, sel.focusNode)
  ) {
    return true;
  }
  // selection at least partly outside editor
  if (!force) return false;
  // force selection to editor
  var range = document.createRange();
  range.selectNodeContents(containerNode);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
};

// http://stackoverflow.com/questions/6690752/insert-html-at-caret-in-a-contenteditable-div/6691294#6691294
// http://stackoverflow.com/questions/4823691/insert-an-html-element-in-a-contenteditable-element
// http://stackoverflow.com/questions/6139107/programatically-select-text-in-a-contenteditable-html-element
var pasteHtmlAtCaret = (containerNode, html) => {
  var sel = window.getSelection();
  if (sel.getRangeAt && sel.rangeCount) {
    var range = sel.getRangeAt(0);
    // Range.createContextualFragment() would be useful here but is
    // only relatively recently standardized and is not supported in
    // some browsers (IE9, for one)
    var el = document.createElement("div");
    el.innerHTML = html;
    var frag = document.createDocumentFragment();
    var node: ChildNode;
    var lastNode: Node;
    while ((node = el.firstChild)) {
      lastNode = appendChild(frag, node);
    }
    if (isOrContainsNode(containerNode, range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(frag);
    } else {
      appendChild(containerNode, frag);
    }
    // Preserve the selection
    if (lastNode) {
      range = range.cloneRange();
      range.setStartAfter(lastNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
};

// Create editor
const wysiwyg = (element, options) => {
  var toolbar = options.toolbar;
  var buttons = options.buttons;
  var selectionbuttons = options.selectionbuttons;
  var suggester = options.suggester;
  var interceptenter = options.interceptenter;
  var hijackContextmenu = !!options.hijackmenu;
  var editorWidth = options.width || -1;
  var editorHeight = options.height || -1;

  var nodeContainer =
    typeof element == "string" ? document.querySelector(element) : element;

  var node_textarea = nodeContainer.querySelector("textarea");
  var commands;
  var hotkeys = {};
  var toolbar_top = toolbar == "top";
  var toolbar_bottom = toolbar == "bottom";
  var toolbar_demand = toolbar == "demand";

  // initialize editor
  var nodeContenteditable = nodeContainer.querySelector(
    "[contenteditable=true]"
  );
  if (!nodeContenteditable) {
    nodeContenteditable = document.createElement("div");
    setAttribute(nodeContenteditable, "contentEditable", "true");
    var placeholder = node_textarea.placeholder;
    if (placeholder) {
      setAttribute(nodeContenteditable, "data-placeholder", placeholder);
    }
    insertBefore(nodeContainer, nodeContenteditable, nodeContainer.firstChild);
  }

  editorWidth > 0 && setStyle(nodeContainer, "width", editorWidth + "px");
  editorHeight > 0 &&
    setStyle(nodeContenteditable, "height", editorHeight + "px");

  // Simulate ':focus-within'
  var remove_focus_timeout = null;
  var add_class_focus = () => {
    if (remove_focus_timeout) clearTimeout(remove_focus_timeout);
    remove_focus_timeout = null;
    addClass(nodeContainer, "focus");
    if (toolbar_demand) addClass(nodeContainer, "focused");
  };
  var remove_class_focus = () => {
    if (remove_focus_timeout || document.activeElement == nodeContenteditable) {
      return;
    }
    remove_focus_timeout = setTimeout(() => {
      remove_focus_timeout = null;
      removeClass(nodeContainer, "focus");
    }, 50);
  };
  addEvent(nodeContenteditable, "focus", add_class_focus);
  addEvent(nodeContenteditable, "blur", remove_class_focus);
  // register form-reset
  if (node_textarea && node_textarea.form) {
    addEvent(node_textarea.form, "reset", remove_class_focus);
  }

  // Insert-link popup
  var create_insertlink = (popup, modify_a_href) => {
    var textbox = document.createElement("input");
    textbox.placeholder = "www.example.com";
    if (modify_a_href) textbox.value = modify_a_href.href;
    textbox.autofocus = true;
    if (modify_a_href) {
      addEvent(textbox, "input", (e) => {
        var url = textbox.value.trim();
        if (url) modify_a_href.href = url;
      });
    }
    addEvent(textbox, "keypress", (e) => {
      var key = e.which || e.keyCode;
      if (key != 13) return;
      var url = textbox.value.trim();
      if (modify_a_href) {
      } else if (url) {
        var url_scheme = url;
        if (!/^[a-z0-9]+:\/\//.test(url)) {
          url_scheme = "http://" + url;
        }
        if (commands.getSelectedHTML()) {
          commands.insertLink(url_scheme);
        } else {
          commands.insertHTML(
            '<a href="' +
              htmlEncode(url_scheme) +
              '">' +
              htmlEncode(url) +
              "</a>"
          );
        }
      }
      commands.closePopup().collapseSelection();
      nodeContenteditable.focus();
    });
    addClass(popup, "hyperlink");
    appendChild(popup, textbox);
    // set focus
    window.setTimeout(() => {
      textbox.focus();
      add_class_focus();
    }, 1);
  };

  // Color-palette popup
  function createColorpalette(popup, forecolor) {
    // create table
    var table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    for (
      var row = 1;
      row < 15;
      ++row // should be '16' - but last line looks so dark
    ) {
      var tr = document.createElement("tr");
      for (
        var col = 0;
        col < 25;
        ++col // last column is grayscale
      ) {
        var color;
        if (col == 24) {
          var gray = MathFloor((255 / 13) * (14 - row)).toString(16);
          var hexg = (gray.length < 2 ? "0" : "") + gray;
          color = "#" + hexg + hexg + hexg;
        } else {
          var hue = col / 24;
          var saturation = row <= 8 ? row / 8 : 1;
          var value = row > 8 ? (16 - row) / 8 : 1;
          color = HSVtoRGB(hue, saturation, value);
        }
        var td = document.createElement("td");
        td.style.backgroundColor = color;
        td.title = color;
        addEvent(td, "click", function (e) {
          var color = this.title;
          if (forecolor) {
            commands.forecolor(color).closePopup().collapseSelection();
          } else {
            commands.highlight(color).closePopup().collapseSelection();
          }
          cancelEvent(e);
        });
        appendChild(tr, td);
      }
      appendChild(table, tr);
    }
    addClass(popup, "palette");
    appendChild(popup, table);
  }

  // open popup and apply position
  var popup_position = (
    popup,
    left,
    // left+top relative to container
    top
  ) => {
    // Test parents, el.getBoundingClientRect() does not work within 'position:fixed'
    var node = nodeContainer,
      popup_parent = node.offsetParent;
    while (node) {
      var node_style = getComputedStyle(node);
      if (node_style["position"] != "static") break;
      left += node.offsetLeft;
      top += node.offsetTop;
      popup_parent = node;
      node = node.offsetParent;
    }
    // Move popup as high as possible in the DOM tree
    appendChild(popup_parent, popup);
    // Trim to viewport
    var rect = popup_parent.getBoundingClientRect();
    var documentElement = document.documentElement;
    var viewport_width = MathMin(
      window.innerWidth,
      MathMax(documentElement.offsetWidth, documentElement.scrollWidth)
    );
    var viewport_height = window.innerHeight;
    var popup_width = popup.offsetWidth; // accurate to integer
    var popup_height = popup.offsetHeight;
    if (rect.left + left < 1) left = 1 - rect.left;
    else if (rect.left + left + popup_width > viewport_width - 1)
      left = MathMax(
        1 - rect.left,
        viewport_width - 1 - rect.left - popup_width
      );
    if (rect.top + top < 1) {
      top = 1 - rect.top;
    } else if (rect.top + top + popup_height > viewport_height - 1) {
      top = MathMax(
        1 - rect.top,
        viewport_height - 1 - rect.top - popup_height
      );
    }
    // Set offset
    popup.style.left = parseInt(left) + "px";
    popup.style.top = parseInt(top) + "px";
  };
  // open popup and apply position
  var popup_type = null;
  var create_popup = (down, type, create_content, argument) => {
    // popup already open?
    var popup = commands.activePopup();
    if (popup && popup_type === type) {
      removeClass(popup, "animate-down");
      removeClass(popup, "animate-up");
    } else {
      // either run 'commands.closePopup().openPopup()' or remove children
      popup = commands.openPopup();
      addClass(popup, "wysiwyg-popup");
      addClass(popup, down ? "animate-down" : "animate-up");
      popup_type = type;
    }
    // re-fill content
    while (popup.firstChild) popup.removeChild(popup.firstChild);
    create_content(popup, argument);
    return popup;
  };
  var open_popup_button = (button, type, create_content, argument?) => {
    var popup = create_popup(
      toolbar_top ? true : false,
      type,
      create_content,
      argument
    );
    // Popup position - point to top/bottom-center of the button
    var container_offset = nodeContainer.getBoundingClientRect();
    var button_offset = button.getBoundingClientRect();
    var left =
      button_offset.left -
      container_offset.left +
      button.offsetWidth / 2 -
      popup.offsetWidth / 2;
    var top = button_offset.top - container_offset.top;
    if (toolbar_top) top += button.offsetHeight;
    else top -= popup.offsetHeight;
    popup_position(popup, left, top);
  };
  var popup_selection_position = (popup, rect) => {
    // Popup position - point to center of the selection
    var container_offset = nodeContainer.getBoundingClientRect();
    var contenteditable_offset = nodeContenteditable.getBoundingClientRect();
    var left =
      rect.left +
      rect.width / 2 -
      popup.offsetWidth / 2 +
      contenteditable_offset.left -
      container_offset.left;
    var top =
      rect.top +
      rect.height +
      contenteditable_offset.top -
      container_offset.top;
    popup_position(popup, left, top);
  };
  var open_popup_selection = (rect, type, create_content, argument?) => {
    var popup = create_popup(true, type, create_content, argument);
    popup_selection_position(popup, rect);
  };

  // Fill buttons (on toolbar or on selection)
  var recent_selection_rect = null,
    recent_selection_link = null;
  var fill_buttons = (toolbar_container, selection_rect, buttons, hotkeys?) => {
    buttons.forEach((button) => {
      // Custom button
      if (button instanceof HTMLElement) {
        appendChild(toolbar_container, button);
        // Simulate ':focus-within'
        addEvent(button, "focus", add_class_focus);
        addEvent(button, "blur", remove_class_focus);
        return;
      }

      // Create a button
      var element = document.createElement("button");
      addClass(element, "btn");
      if ("icon" in button) {
        var htmlparser = document.implementation.createHTMLDocument("");
        htmlparser.body.innerHTML = button.icon;
        for (
          var child = htmlparser.body.firstChild;
          child !== null;
          child = child.nextSibling
        ) {
          appendChild(element, child);
        }
      }
      if ("attr" in button) {
        Object.keys(button.attr).forEach((k) => {
          setAttribute(element, k, button.attr[k]);
        });
      }
      // Simulate ':focus-within'
      addEvent(element, "focus", add_class_focus);
      addEvent(element, "blur", remove_class_focus);

      // Create handler
      var handler = null;
      if ("click" in button) {
        handler = () => {
          button.click(commands, element);
        };
      } else if ("popup" in button) {
        handler = () => {
          var fill_popup = (popup) => {
            button.popup(commands, popup, element);
          };
          if (selection_rect) {
            open_popup_selection(
              selection_rect,
              fill_popup.toString(),
              fill_popup
            );
          } else open_popup_button(element, fill_popup.toString(), fill_popup);
        };
      } else if ("browse" in button || "dataurl" in button) {
        handler = () => {
          // remove popup
          commands.closePopup().collapseSelection();
          // open browse dialog
          var input = document.createElement("input");
          input.type = "file";
          input.multiple = true;
          input.style.display = "none";
          addEvent(input, "change", (e) => {
            var remove_input = "dataurl" in button;
            if (!e.target.files) remove_input = true;
            else if ("browse" in button) {
              var files = (evt.target as any).files;
              for (
                var i = 0;
                i < files.length;
                ++i // can't use forEach() with 'FileList'
              )
                button.browse(commands, input, files[i], element);
            } else {
              filecontents_multiple(
                (evt.target as any).files,
                (type, dataurl) => {
                  button.dataurl(commands, type, dataurl, element);
                }
              );
            }
            if (remove_input) input.parentNode.removeChild(input);
            cancelEvent(e);
          });
          appendChild(nodeContainer, input);
          var evt = document.createEvent("MouseEvents");
          evt.initEvent("click", true, false);
          input.dispatchEvent(evt);
        };
      } else if ("action" in button) {
        handler = () => {
          switch (button.action) {
            case "link":
              if (selection_rect)
                open_popup_selection(
                  selection_rect,
                  "link",
                  create_insertlink,
                  recent_selection_link
                );
              else
                open_popup_button(
                  element,
                  "link",
                  create_insertlink,
                  recent_selection_link
                );
              break;
            case "bold":
              commands.bold().closePopup().collapseSelection();
              break;
            case "italic":
              commands.italic().closePopup().collapseSelection();
              break;
            case "underline":
              commands.underline().closePopup().collapseSelection();
              break;
            case "strikethrough":
              commands.strikethrough().closePopup().collapseSelection();
              break;
            case "colortext":
              if (selection_rect)
                open_popup_selection(
                  selection_rect,
                  "colortext",
                  createColorpalette,
                  true
                );
              else
                open_popup_button(
                  element,
                  "colortext",
                  createColorpalette,
                  true
                );
              break;
            case "colorfill":
              if (selection_rect)
                open_popup_selection(
                  selection_rect,
                  "colorfill",
                  createColorpalette,
                  false
                );
              else
                open_popup_button(
                  element,
                  "colorfill",
                  createColorpalette,
                  false
                );
              break;
            case "subscript":
              commands.subscript().closePopup().collapseSelection();
              break;
            case "superscript":
              commands.superscript().closePopup().collapseSelection();
              break;
            case "orderedlist":
              commands.orderedList().closePopup().collapseSelection();
              break;
            case "unorderedlist":
              commands.unorderedList().closePopup().collapseSelection();
              break;
            case "clearformat":
              commands.removeFormat().closePopup().collapseSelection();
              break;
          }
        };
      }
      element.onclick = (e) => {
        if (handler) handler();
        cancelEvent(e);
      };
      appendChild(toolbar_container, element);

      // Hotkey
      if ("hotkey" in button && handler && hotkeys) {
        hotkeys[button.hotkey.toLowerCase()] = handler;
      }
    });
  };

  // Handle suggester
  var typed_suggestion = null,
    suggestion_sequence = 1,
    first_suggestion_html = null;
  var finish_suggestion = (insert_html?) => {
    // fire suggestion
    if (insert_html) {
      commands
        .expandSelection(typed_suggestion.length, 0)
        .insertHTML(insert_html);
    }
    typed_suggestion = null;
    first_suggestion_html = null;
    suggestion_sequence += 1;
    commands.closePopup();
  };
  var suggester_keydown = (
    key,
    character,
    shiftKey,
    altKey,
    ctrlKey,
    metaKey
  ) => {
    if (key == 13 && first_suggestion_html) {
      finish_suggestion(first_suggestion_html);
      return false; // swallow enter
    }
    return true;
  };
  var ask_suggestions = () => {
    if (!typed_suggestion) return;
    var current_sequence = suggestion_sequence;
    var open_suggester = (suggestions) => {
      if (!recent_selection_rect || current_sequence != suggestion_sequence)
        return;
      first_suggestion_html = null;
      // Empty suggestions means: stop suggestion handling
      if (!suggestions) {
        finish_suggestion();
        return;
      }
      // Show suggester
      var fill_popup = (popup) => {
        suggestions.forEach((suggestion) => {
          var element = document.createElement("div");
          addClass(element, "suggestion");
          element.innerHTML = suggestion.label;
          addEvent(element, "click", (e) => {
            finish_suggestion(suggestion.insert);
            cancelEvent(e);
          });
          appendChild(popup, element);

          // Store suggestion to handle 'Enter'
          if (first_suggestion_html === null) {
            first_suggestion_html = suggestion.insert;
          }
        });
      };
      open_popup_selection(recent_selection_rect, "suggestion", fill_popup);
    };
    // Ask to start/continue a suggestion
    if (!suggester(typed_suggestion, open_suggester)) finish_suggestion();
  };
  var debounced_suggestions = debounce(ask_suggestions, 100, true);
  var suggester_keypress = (
    key,
    character,
    shiftKey,
    altKey,
    ctrlKey,
    metaKey
  ) => {
    // Special keys
    switch (key) {
      case 8: // backspace
        if (typed_suggestion) typed_suggestion = typed_suggestion.slice(0, -1);
        if (typed_suggestion)
          // if still text -> continue, else abort
          break;
        finish_suggestion();
        return true;
      case 13: // enter
      case 27: // escape
      case 33: // pageUp
      case 34: // pageDown
      case 35: // end
      case 36: // home
      case 37: // left
      case 38: // up
      case 39: // right
      case 40: // down
        if (typed_suggestion) finish_suggestion();
        return true;
      default:
        if (!typed_suggestion) typed_suggestion = "";
        typed_suggestion += character;
        break;
    }
    // Throttle requests
    debounced_suggestions();
    return true;
  };

  // Create contenteditable
  var onKeyDown = (key, character, shiftKey, altKey, ctrlKey, metaKey) => {
    // submit form on enter-key
    if (
      interceptenter &&
      key == 13 &&
      !shiftKey &&
      !altKey &&
      !ctrlKey &&
      !metaKey
    ) {
      commands.sync();
      if (interceptenter()) {
        commands.closePopup();
        return false; // swallow enter
      }
    }
    // Exec hotkey (onkeydown because e.g. CTRL+B would oben the bookmarks)
    if (character && !shiftKey && !altKey && ctrlKey && !metaKey) {
      var hotkey = character.toLowerCase();
      if (hotkeys[hotkey]) {
        hotkeys[hotkey]();
        return false; // prevent default
      }
    }
    // Handle suggester
    if (suggester) {
      return suggester_keydown(
        key,
        character,
        shiftKey,
        altKey,
        ctrlKey,
        metaKey
      );
    }
  };
  var onKeyPress = (key, character, shiftKey, altKey, ctrlKey, metaKey) => {
    // Handle suggester
    if (suggester) {
      return suggester_keypress(
        key,
        character,
        shiftKey,
        altKey,
        ctrlKey,
        metaKey
      );
    }
  };
  // tslint:disable-next-line: no-function-expression
  var onSelection = function (collapsed, rect, nodes, rightclick) {
    recent_selection_rect = collapsed ? rect || recent_selection_rect : null;
    recent_selection_link = null;
    // Fix type error - https://github.com/wysiwygjs/wysiwyg.js/issues/4
    if (!rect) {
      finish_suggestion();
      return;
    }
    // Collapsed selection
    if (collapsed) {
      // Active suggestion: apply toolbar-position
      if (typed_suggestion !== null) {
        var popup = commands.activePopup();
        if (popup) {
          removeClass(popup, "animate-down");
          removeClass(popup, "animate-up");
          popup_selection_position(popup, rect);
        }
        return;
      }
    }
    // Click on a link opens the link-popup
    for (var i = 0; i < nodes.length; ++i) {
      var node = nodes[i];
      var closest =
        node.closest || // latest
        function (selector) {
          // IE + Edge - https://github.com/nefe/You-Dont-Need-jQuery
          var node = this;
          while (node) {
            var matchesSelector =
              node.matches ||
              node.webkitMatchesSelector ||
              node.mozMatchesSelector ||
              node.msMatchesSelector;
            if (matchesSelector && matchesSelector.call(node, selector))
              return node;
            node = node.parentElement;
          }
          return null;
        };
      recent_selection_link = closest.call(node, "a");
      if (recent_selection_link) break;
    }
    // Show selection popup?
    var show_popup = true;
    // 'right-click' always opens the popup
    if (rightclick) {
    } else if (!selectionbuttons)
      // No selection-popup wanted?
      show_popup = false;
    // Selected popup wanted, but nothing selected (=selection collapsed)
    else if (collapsed) show_popup = false;
    // Image selected -> skip toolbar-popup (better would be an 'image-popup')
    else
      nodes.forEach((node) => {
        if (isMediaNode(node)) show_popup = false;
      });
    if (!show_popup) {
      finish_suggestion();
      return;
    }
    // fill buttons
    open_popup_selection(rect, "selection", (popup) => {
      var toolbar_element = document.createElement("div");
      addClass(toolbar_element, "toolbar");
      appendChild(popup, toolbar_element);
      fill_buttons(toolbar_element, rect, selectionbuttons);
    });
  };
  var onOpenpopup = () => {
    add_class_focus();
  };
  var onClosepopup = () => {
    finish_suggestion();
    remove_class_focus();
  };

  // Sync Editor with Textarea
  var syncTextarea = null,
    debounced_syncTextarea = null;
  if (node_textarea) {
    // copy placeholder from the textarea to the contenteditor
    if (!nodeContenteditable.innerHTML && node_textarea.value)
      nodeContenteditable.innerHTML = node_textarea.value;

    // sync html from the contenteditor to the textarea
    var previous_html = nodeContenteditable.innerHTML;
    syncTextarea = () => {
      var new_html = nodeContenteditable.innerHTML;
      if (new_html.match(/^<br[/ ]*>$/i)) {
        nodeContenteditable.innerHTML = "";
        new_html = "";
      }
      if (new_html == previous_html) return;
      // HTML changed
      node_textarea.value = new_html;
      previous_html = new_html;
    };

    // Focus/Blur events
    addEvent(nodeContenteditable, "focus", () => {
      // forward focus/blur to the textarea
      var event = document.createEvent("Event");
      event.initEvent("focus", false, false);
      node_textarea.dispatchEvent(event);
    });
    addEvent(nodeContenteditable, "blur", () => {
      // sync textarea immediately
      syncTextarea();
      // forward focus/blur to the textarea
      var event = document.createEvent("Event");
      event.initEvent("blur", false, false);
      node_textarea.dispatchEvent(event);
    });

    // debounce 'syncTextarea', because 'innerHTML' is quite burdensome
    // High timeout is save, because of "onblur" fires immediately
    debounced_syncTextarea = debounce(syncTextarea, 250, true);

    // Catch change events
    // http://stackoverflow.com/questions/1391278/contenteditable-change-events/1411296#1411296
    // http://stackoverflow.com/questions/8694054/onchange-event-with-contenteditable/8694125#8694125
    // https://github.com/mindmup/bootstrap-wysiwyg/pull/50/files
    // http://codebits.glennjones.net/editing/events-contenteditable.htm
    addEvent(nodeContenteditable, "input", debounced_syncTextarea);
    addEvent(nodeContenteditable, "propertychange", debounced_syncTextarea);
    addEvent(nodeContenteditable, "textInput", debounced_syncTextarea);
    addEvent(nodeContenteditable, "paste", debounced_syncTextarea);
    addEvent(nodeContenteditable, "cut", debounced_syncTextarea);
    addEvent(nodeContenteditable, "drop", debounced_syncTextarea);
    // MutationObserver should report everything
    if (window.MutationObserver) {
      var observer = new MutationObserver(debounced_syncTextarea);
      observer.observe(nodeContenteditable, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    // handle reset event
    var form = node_textarea.form;
    if (form) {
      addEvent(form, "reset", () => {
        nodeContenteditable.innerHTML = "";
        debounced_syncTextarea();
        callUpdates(true);
        removeClass(nodeContainer, "focused");
      });
    }
  }

  // Handle selection
  var popup_saved_selection = null, // preserve selection during popup
    debounced_handleSelection = null;
  if (onSelection) {
    var handleSelection = (clientX, clientY, rightclick) => {
      // Detect collapsed selection
      var collapsed = getSelectionCollapsed(nodeContenteditable);
      // List of all selected nodes
      var nodes = getSelectedNodes(nodeContenteditable);
      // Rectangle of the selection
      var rect =
        clientX === null || clientY === null
          ? null
          : {
              left: clientX,
              top: clientY,
              width: 0,
              height: 0,
            };
      var selectionRect = getSelectionRect();
      if (selectionRect) rect = selectionRect;
      if (rect) {
        // So far 'rect' is relative to viewport, make it relative to the editor
        var boundingrect = nodeContenteditable.getBoundingClientRect();
        rect.left -= parseInt(boundingrect.left);
        rect.top -= parseInt(boundingrect.top);
        // Trim rectangle to the editor
        if (rect.left < 0) rect.left = 0;
        if (rect.top < 0) rect.top = 0;
        if (rect.width > nodeContenteditable.offsetWidth)
          rect.width = nodeContenteditable.offsetWidth;
        if (rect.height > nodeContenteditable.offsetHeight)
          rect.height = nodeContenteditable.offsetHeight;
      } else if (nodes.length) {
        // What else could we do? Offset of first element...
        for (var i = 0; i < nodes.length; ++i) {
          var node = nodes[i];
          if (node.nodeType != Node.ELEMENT_NODE) continue;
          rect = {
            left: node.offsetLeft,
            top: node.offsetTop,
            width: node.offsetWidth,
            height: node.offsetHeight,
          };
          break;
        }
      }
      // Callback
      onSelection(collapsed, rect, nodes, rightclick);
    };
    debounced_handleSelection = debounce(handleSelection, 1);
  }

  // Open popup
  var node_popup = null;
  var popupClickClose = (e) => {
    var target = e.target || e.srcElement;
    if (target.nodeType == Node.TEXT_NODE)
      // defeat Safari bug
      target = target.parentNode;
    // Click within popup?
    if (isOrContainsNode(node_popup, target)) return;
    // close popup
    popupClose();
  };
  var popupOpen = () => {
    // Already open?
    if (node_popup) return node_popup;

    // Global click closes popup
    addEvent(window, "mousedown", popupClickClose, true);

    // Create popup element
    node_popup = document.createElement("DIV");
    var parent = nodeContenteditable.parentNode,
      next = nodeContenteditable.nextSibling;
    if (next) {
      insertBefore(parent, node_popup, next);
    } else {
      appendChild(parent, node_popup);
    }
    if (onOpenpopup) onOpenpopup();
    return node_popup;
  };
  var popupClose = () => {
    if (!node_popup) return;
    node_popup.parentNode.removeChild(node_popup);
    node_popup = null;
    removeEvent(window, "mousedown", popupClickClose, true);
    onClosepopup && onClosepopup();
  };

  // Key events
  // http://sandbox.thewikies.com/html5-experiments/key-events.html
  var keyHandler = (e, phase) => {
    // https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent
    // http://stackoverflow.com/questions/1444477/keycode-and-charcode
    // http://stackoverflow.com/questions/4285627/javascript-keycode-vs-charcode-utter-confusion
    // http://unixpapa.com/js/key.html
    var key = e.which || e.keyCode,
      character = String.fromCharCode(key || e.charCode),
      shiftKey = e.shiftKey || false,
      altKey = e.altKey || false,
      ctrlKey = e.ctrlKey || false,
      metaKey = e.metaKey || false;
    if (phase == 1) {
      // Callback
      if (
        onKeyDown &&
        onKeyDown(key, character, shiftKey, altKey, ctrlKey, metaKey) === false
      )
        cancelEvent(e); // dismiss key
    } else if (phase == 2) {
      // Callback
      if (
        onKeyPress &&
        onKeyPress(key, character, shiftKey, altKey, ctrlKey, metaKey) === false
      )
        cancelEvent(e); // dismiss key
    }
    //else if( phase == 3 )
    //{
    //    // Callback
    //    if( onKeyUp && onKeyUp(key, character, shiftKey, altKey, ctrlKey, metaKey) === false )
    //        cancelEvent( e ); // dismiss key
    //}

    // Keys can change the selection
    if (popup_saved_selection) {
      popup_saved_selection = saveSelection(nodeContenteditable);
    }
    if (phase == 2 || phase == 3) {
      if (debounced_handleSelection) {
        debounced_handleSelection(null, null, false);
      }
    }
    // Most keys can cause text-changes
    if (phase == 2 && debounced_syncTextarea) {
      switch (key) {
        case 33: // pageUp
        case 34: // pageDown
        case 35: // end
        case 36: // home
        case 37: // left
        case 38: // up
        case 39: // right
        case 40: // down
          // cursors do not
          break;
        default:
          // call change handler
          debounced_syncTextarea();
          break;
      }
    }
  };
  addEvent(nodeContenteditable, "keydown", (e) => {
    keyHandler(e, 1);
  });
  addEvent(nodeContenteditable, "keypress", (e) => {
    keyHandler(e, 2);
  });
  addEvent(nodeContenteditable, "keyup", (e) => {
    keyHandler(e, 3);
  });

  // Mouse events
  var mouseHandler = (e, rightclick?: boolean) => {
    // mouse position
    var clientX = null,
      clientY = null;
    if (e.clientX && e.clientY) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else if (e.pageX && e.pageY) {
      clientX = e.pageX - window.pageXOffset;
      clientY = e.pageY - window.pageYOffset;
    }
    // mouse button
    if (e.which && e.which == 3) rightclick = true;
    else if (e.button && e.button == 2) rightclick = true;

    // remove event handler
    removeEvent(window, "mouseup", mouseHandler);
    // Callback selection
    if (popup_saved_selection)
      popup_saved_selection = saveSelection(nodeContenteditable);
    if (!hijackContextmenu && rightclick) return;
    if (debounced_handleSelection)
      debounced_handleSelection(clientX, clientY, rightclick);
  };
  var mouse_down_target = null;
  addEvent(nodeContenteditable, "mousedown", (e) => {
    // catch event if 'mouseup' outside 'contenteditable'
    removeEvent(window, "mouseup", mouseHandler);
    addEvent(window, "mouseup", mouseHandler);
    // remember target
    mouse_down_target = e.target;
  });
  addEvent(nodeContenteditable, "mouseup", (e) => {
    // Select image (improve user experience on Webkit)
    var node = e.target;
    if (
      node &&
      node.nodeType == Node.ELEMENT_NODE &&
      node === mouse_down_target &&
      isMediaNode(node) &&
      isOrContainsNode(nodeContenteditable, node, true)
    ) {
      var selection = window.getSelection();
      var range = document.createRange();
      range.setStartBefore(node);
      range.setEndAfter(node);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    // handle click
    mouseHandler(e);
    // Trigger change
    if (debounced_syncTextarea) debounced_syncTextarea();
  });
  addEvent(nodeContenteditable, "dblclick", (e) => {
    mouseHandler(e);
  });
  addEvent(nodeContenteditable, "selectionchange", (e) => {
    mouseHandler(e);
  });
  if (hijackContextmenu) {
    addEvent(nodeContenteditable, "contextmenu", (e) => {
      mouseHandler(e, true);
      cancelEvent(e);
    });
  }

  // exec command
  // https://developer.mozilla.org/en-US/docs/Web/API/document.execCommand
  // http://www.quirksmode.org/dom/execCommand.html
  function execCommand(command, param?, force_selection?: boolean) {
    // give selection to contenteditable element
    restoreSelection(nodeContenteditable, popup_saved_selection);
    // tried to avoid forcing focus(), but ... - https://github.com/wysiwygjs/wysiwyg.js/issues/51
    nodeContenteditable.focus();
    if (!selectionInside(nodeContenteditable, force_selection)) {
      // returns 'selection inside editor'
      return false;
    }

    // Buggy, call within 'try/catch'
    try {
      if (
        document.queryCommandSupported &&
        !document.queryCommandSupported(command)
      )
        return false;
      return document.execCommand(command, false, param);
    } catch (e) {}
    return false;
  }

  // copy/paste images from clipboard
  function pasteDropFile(datatransfer) {
    if (!datatransfer) return false;
    var insert_files = [];
    // From clipboard
    if (datatransfer.items) {
      var items = datatransfer.items;
      for (var i = 0; i < items.length; ++i) {
        var item = items[i];
        if (!item.type.match(/^image\//)) continue;
        var file = item.getAsFile();
        insert_files.push(file);
      }
    }
    // From explorer/finder
    else if (datatransfer.files) {
      var files = datatransfer.files;
      for (var i = 0; i < files.length; ++i) insert_files.push(files[i]);
    }
    if (!insert_files.length) return false;
    filecontents_multiple(insert_files, (type, dataurl) => {
      execCommand("insertImage", dataurl);
    });
    return true;
  }
  addEvent(nodeContenteditable, "paste", (e) => {
    if (pasteDropFile(e.clipboardData)) cancelEvent(e); // dismiss paste
  });
  addEvent(nodeContenteditable, "drop", (e) => {
    if (pasteDropFile(e.dataTransfer)) cancelEvent(e); // dismiss drop
  });

  // Command structure
  function callUpdates(selection_destroyed?: boolean) {
    // change-handler
    if (debounced_syncTextarea) debounced_syncTextarea();
    // handle saved selection
    if (selection_destroyed) {
      collapseSelectionEnd();
      popup_saved_selection = null; // selection destroyed
    } else if (popup_saved_selection) {
      popup_saved_selection = saveSelection(nodeContenteditable);
    }
  }
  commands = {
    // properties
    sync: function () {
      // sync textarea immediately
      if (syncTextarea) syncTextarea();
      return this;
    },
    getHTML: () => {
      return nodeContenteditable.innerHTML;
    },
    setHTML: function (html) {
      nodeContenteditable.innerHTML = html || "";
      callUpdates(true); // selection destroyed
      return this;
    },
    getSelectedHTML: () => {
      restoreSelection(nodeContenteditable, popup_saved_selection);
      if (!selectionInside(nodeContenteditable)) return null;
      return getSelectionHtml(nodeContenteditable);
    },
    // selection and popup
    collapseSelection: function () {
      collapseSelectionEnd();
      popup_saved_selection = null; // selection destroyed
      return this;
    },
    expandSelection: function (preceding, following) {
      restoreSelection(nodeContenteditable, popup_saved_selection);
      if (!selectionInside(nodeContenteditable)) return this;
      expandSelectionCaret(nodeContenteditable, preceding, following);
      popup_saved_selection = saveSelection(nodeContenteditable); // save new selection
      return this;
    },
    openPopup: () => {
      if (!popup_saved_selection)
        popup_saved_selection = saveSelection(nodeContenteditable); // save current selection
      return popupOpen();
    },
    activePopup: () => {
      return node_popup;
    },
    closePopup: function () {
      popupClose();
      return this;
    },
    // formats
    removeFormat: function () {
      execCommand("removeFormat");
      execCommand("unlink");
      callUpdates();
      return this;
    },
    bold: function () {
      execCommand("bold");
      callUpdates();
      return this;
    },
    italic: function () {
      execCommand("italic");
      callUpdates();
      return this;
    },
    underline: function () {
      execCommand("underline");
      callUpdates();
      return this;
    },
    strikethrough: function () {
      execCommand("strikeThrough");
      callUpdates();
      return this;
    },
    forecolor: function (color) {
      execCommand("foreColor", color);
      callUpdates();
      return this;
    },
    highlight: function (color) {
      // http://stackoverflow.com/questions/2756931/highlight-the-text-of-the-dom-range-element
      if (!execCommand("hiliteColor", color)) {
        // some browsers apply 'backColor' to the whole block
        execCommand("backColor", color);
      }
      callUpdates();
      return this;
    },
    fontName: function (name) {
      execCommand("fontName", name);
      callUpdates();
      return this;
    },
    fontSize: function (size) {
      execCommand("fontSize", size);
      callUpdates();
      return this;
    },
    subscript: function () {
      execCommand("subscript");
      callUpdates();
      return this;
    },
    superscript: function () {
      execCommand("superscript");
      callUpdates();
      return this;
    },
    insertLink: function (url) {
      execCommand("createLink", url);
      callUpdates(true); // selection destroyed
      return this;
    },
    insertImage: function (url) {
      execCommand("insertImage", url, true);
      callUpdates(true); // selection destroyed
      return this;
    },
    insertHTML: function (html) {
      if (!execCommand("insertHTML", html, true)) {
        // IE 11 still does not support 'insertHTML'
        restoreSelection(nodeContenteditable, popup_saved_selection);
        selectionInside(nodeContenteditable, true);
        pasteHtmlAtCaret(nodeContenteditable, html);
      }
      callUpdates(true); // selection destroyed
      return this;
    },
    orderedList: function () {
      execCommand("insertOrderedList");
      callUpdates();
      return this;
    },
    unorderedList: function () {
      execCommand("insertUnorderedList");
      callUpdates();
      return this;
    },
  };

  // Create toolbar
  if (buttons) {
    var toolbar_element = document.createElement("div");
    addClass(toolbar_element, "toolbar");
    if (toolbar_top) {
      addClass(toolbar_element, "toolbar-top");
      insertBefore(nodeContainer, toolbar_element, nodeContainer.firstChild);
    } else if (toolbar_bottom) {
      addClass(toolbar_element, "toolbar-bottom");
      appendChild(nodeContainer, toolbar_element);
    } else {
      var toolbar_wrapper = document.createElement("div");
      addClass(toolbar_wrapper, "toolbar-auto");
      appendChild(nodeContainer, toolbar_wrapper);
      appendChild(toolbar_wrapper, toolbar_element);
    }
    fill_buttons(toolbar_element, null, buttons, hotkeys);
  }

  return commands;
};

export default wysiwyg;
