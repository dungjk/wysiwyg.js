import { MathFloor } from "./math";

// http://stackoverflow.com/questions/17242144/javascript-convert-hsb-hsv-color-to-rgb-accurately
export function HSVtoRGB(h, s, v) {
  var r, g, b, i, f, p, q, t;
  i = MathFloor(h * 6);
  f = h * 6 - i;
  p = v * (1 - s);
  q = v * (1 - f * s);
  t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      (r = v), (g = t), (b = p);
      break;
    case 1:
      (r = q), (g = v), (b = p);
      break;
    case 2:
      (r = p), (g = v), (b = t);
      break;
    case 3:
      (r = p), (g = q), (b = v);
      break;
    case 4:
      (r = t), (g = p), (b = v);
      break;
    case 5:
      (r = v), (g = p), (b = q);
      break;
  }
  var hr = MathFloor(r * 255).toString(16);
  var hg = MathFloor(g * 255).toString(16);
  var hb = MathFloor(b * 255).toString(16);
  return (
    "#" +
    (hr.length < 2 ? "0" : "") +
    hr +
    (hg.length < 2 ? "0" : "") +
    hg +
    (hb.length < 2 ? "0" : "") +
    hb
  );
}
