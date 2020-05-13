import { MathPI } from "./math";

/**
 * read file as data-url
 * @param {File} file
 * @param {(type: string, result: ArrayBuffer) => void} callback
 */
export function filecontents(file, callback) {
  // base64 a 2GB video is insane: artificial clamp at 64MB
  if (file.size > 0x4000000) {
    callback();
    return;
  }

  // read file as data-url
  var normalize_dataurl = (orientation?: number) => {
    var filereader = new FileReader();
    filereader.onload = (e) => {
      if (!orientation || orientation == 1 || orientation > 8)
        return callback(file.type, e.target.result);
      // normalize
      var img = new Image();
      img.src = e.target.result as any;
      img.onload = () => {
        var width = img.width;
        var height = img.height;
        if (width > height) {
          var max_width = 4096;
          if (width > max_width) {
            height *= max_width / width;
            width = max_width;
          }
        } else {
          var max_height = 4096;
          if (height > max_height) {
            width *= max_height / height;
            height = max_height;
          }
        }
        var canvas = document.createElement("canvas");
        var ctx = canvas.getContext("2d");
        canvas.width = width;
        canvas.height = height;
        ctx.save();
        if (orientation > 4) {
          canvas.width = height;
          canvas.height = width;
        }
        switch (orientation) {
          case 2:
            ctx.translate(width, 0);
            ctx.scale(-1, 1);
            break;
          case 3:
            ctx.translate(width, height);
            ctx.rotate(MathPI);
            break;
          case 4:
            ctx.translate(0, height);
            ctx.scale(1, -1);
            break;
          case 5:
            ctx.rotate(0.5 * MathPI);
            ctx.scale(1, -1);
            break;
          case 6:
            ctx.rotate(0.5 * MathPI);
            ctx.translate(0, -height);
            break;
          case 7:
            ctx.rotate(0.5 * MathPI);
            ctx.translate(width, -height);
            ctx.scale(-1, 1);
            break;
          case 8:
            ctx.rotate(-0.5 * MathPI);
            ctx.translate(-width, 0);
            break;
        }
        ctx.drawImage(img, 0, 0, width, height);
        ctx.restore();
        var dataURL = canvas.toDataURL("image/jpeg", 0.99);
        callback(file.type, dataURL);
      };
    };
    filereader.onerror = (e) => {
      callback();
    };
    filereader.readAsDataURL(file);
  };
  if (!window.DataView) return normalize_dataurl();

  // get orientation - https://stackoverflow.com/questions/7584794/accessing-jpeg-exif-rotation-data-in-javascript-on-the-client-side
  var filereader = new FileReader();
  filereader.onload = (e) => {
    var contents = e.target.result;
    var view = new DataView(contents as any);
    // Not a JPEG at all?
    if (view.getUint16(0, false) != 0xffd8) return normalize_dataurl();
    var length = view.byteLength,
      offset = 2;
    while (offset < length) {
      // Missing EXIF?
      if (view.getUint16(offset + 2, false) <= 8) return normalize_dataurl();
      var marker = view.getUint16(offset, false);
      offset += 2;
      if (marker == 0xffe1) {
        if (view.getUint32((offset += 2), false) != 0x45786966)
          return normalize_dataurl();
        var little = view.getUint16((offset += 6), false) == 0x4949;
        offset += view.getUint32(offset + 4, little);
        var tags = view.getUint16(offset, little);
        offset += 2;
        for (var i = 0; i < tags; ++i) {
          if (view.getUint16(offset + i * 12, little) == 0x0112) {
            var orientation = view.getUint16(offset + i * 12 + 8, little);
            return normalize_dataurl(orientation);
          }
        }
      } else if ((marker & 0xff00) != 0xff00) break;
      else offset += view.getUint16(offset, false);
    }
    return normalize_dataurl();
  };
  filereader.onerror = (e) => {
    callback();
  };
  filereader.readAsArrayBuffer(file);
}

export function filecontents_multiple(files, callback) {
  // Keep callback-order - supporting browser without 'Promise'
  var callbacks = [],
    callnext = 0;
  for (
    var i = 0;
    i < files.length;
    ++i // can't use forEach() with 'FileList'
  ) {
    ((i) => {
      filecontents(files[i], (type, dataurl) => {
        callbacks[i] = () => {
          if (dataurl) {
            // empty on error
            callback(type, dataurl);
          }
        };
        // trigger callbacks in order
        while (callnext in callbacks) {
          callbacks[callnext]();
          callnext++;
        }
        if (callnext == files.length) callbacks = null;
      });
    })(i);
  }
}
