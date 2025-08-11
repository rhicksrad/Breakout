export default class Brick {
  constructor(x,y,w,h,hp,color){
    this.x=x; this.y=y; this.w=w; this.h=h; this.hp=hp; this.color=color;
    this.destroyed = false;
  }
  hit(){
    this.hp -= 1;
    if(this.hp <= 0){ this.destroyed = true; }
  }
  render(ctx){
    if(this.destroyed) return;
    const r = 7;
    ctx.save();
    const x=this.x, y=this.y, w=this.w, h=this.h;
    const g1 = ctx.createLinearGradient(x, y, x+w, y+h);
    g1.addColorStop(0, '#ffffffcc');
    g1.addColorStop(1, this.color);
    ctx.fillStyle = g1;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    roundRect(ctx, x+0.5, y+0.5, w-1, h-1, r);
    ctx.fill();
    // inner sheen
    const g2 = ctx.createLinearGradient(x, y, x, y+h);
    g2.addColorStop(0, 'rgba(255,255,255,0.35)');
    g2.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    g2.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g2;
    roundRect(ctx, x+2, y+2, w-4, h*0.45, r*0.6);
    ctx.fill();
    if(this.hasPower){
      // Pulsing neon glow and icon
      const t = (performance.now() % 1000) / 1000;
      const pulse = 0.6 + Math.sin(t * Math.PI*2) * 0.4;
      ctx.save();
      ctx.shadowColor = 'rgba(124,255,0,0.9)';
      ctx.shadowBlur = 14 * pulse + 8;
      ctx.strokeStyle = `rgba(124,255,0,${0.7 + 0.3*pulse})`;
      ctx.lineWidth = 2;
      roundRect(ctx, x+1, y+1, w-2, h-2, r-1);
      ctx.stroke();
      ctx.restore();
      // Center icon
      ctx.fillStyle = '#0a2500';
      ctx.font = `${Math.floor(h*0.7)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚡', x + w/2, y + h/2 + 1);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}


