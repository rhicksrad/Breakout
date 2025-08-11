export function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t){
  return a + (b - a) * t;
}

export function randRange(min, max){
  return Math.random() * (max - min) + min;
}

export function pick(array){
  return array[Math.floor(Math.random() * array.length)];
}

export function nowMs(){
  return performance.now();
}

export function hsvToRgb(h, s, v){
  let r, g, b;
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - f * s);
  let t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return { r: Math.round(r*255), g: Math.round(g*255), b: Math.round(b*255) };
}

export function rgbToHex({r,g,b}){
  return `#${((1<<24) + (r<<16) + (g<<8) + b).toString(16).slice(1)}`;
}

export function easeOutCubic(t){
  return 1 - Math.pow(1 - t, 3);
}


