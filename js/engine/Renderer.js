export default class Renderer {
  constructor(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Logical (CSS pixel) size
    this.width = 900; this.height = 600;
    this.shakeTime = 0; this.shakeStrength = 0;
    this.resizeToContainer();
  }

  resizeToContainer(){
    const bounds = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(1, Math.round(bounds.width));
    const cssH = Math.max(1, Math.round(bounds.height));
    this.width = cssW; this.height = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixel space
  }

  beginFrame(){
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    if(this.shakeTime > 0){
      const dx = (Math.random()-0.5) * this.shakeStrength;
      const dy = (Math.random()-0.5) * this.shakeStrength;
      ctx.translate(dx, dy);
      this.shakeTime -= 1/60;
    }
  }

  endFrame(){
    this.ctx.restore();
  }

  shake(duration=0.2, strength=6){
    this.shakeTime = Math.max(this.shakeTime, duration);
    this.shakeStrength = Math.max(this.shakeStrength, strength);
  }
}


