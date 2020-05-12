import { HSVtoRGB } from "./colors";
import { addEvent, addClass } from "./dom";

// Color-palette popup
export function createColorpalette(popup, forecolor, callback) {
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
        var gray = Math.floor((255 / 13) * (14 - row)).toString(16);
        var hexg = (gray.length < 2 ? "0" : "") + gray;
        color = `#${hexg}${hexg}${hexg}`;
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
        } else commands.highlight(color).closePopup().collapseSelection();
        cancelEvent(e);
      });
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  addClass(popup, "palette");
  popup.appendChild(table);
}
