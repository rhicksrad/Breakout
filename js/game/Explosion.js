export default class Explosion {
  constructor(x, y, radius=48){
    this.x = x; this.y = y; this.radius = radius; this.age = 0; this.life = 0.35; this.done = false;
  }
  update(dt, game){
    this.age += dt; if(this.age > this.life) this.done = true;
    // Damage bricks inside radius once
    if(this.age - dt <= 0.05){
      const r2 = this.radius*this.radius;
      for(const b of game.bricks){
        if(b.destroyed) continue;
        const cx = b.x + b.w/2, cy = b.y + b.h/2;
        const dx = cx - this.x, dy = cy - this.y;
        if(dx*dx + dy*dy <= r2){ b.hp = 0; b.destroyed = true; game.addScore(50); }
      }
      game.renderer.shake(0.25, 10);
      game.audio.play('brick', { pitch: 0.6 });
    }
  }
  render(ctx){
    const t = Math.min(this.age / this.life, 1);
    const r = this.radius * (0.6 + 0.6*t);
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
    g.addColorStop(0, `rgba(255,200,120,${1-t})`);
    g.addColorStop(1, `rgba(255,80,100,0)`);
    ctx.save();
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, r, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }
}


