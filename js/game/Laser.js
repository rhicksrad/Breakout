export class LaserBolt {
  constructor(x, y){
    this.x = x; this.y = y; this.vy = -900; this.width = 3; this.height = 16; this.dead = false;
  }
  update(dt){ this.y += this.vy * dt; if(this.y < -20) this.dead = true; }
  render(ctx){
    ctx.save();
    ctx.fillStyle = '#ff88ff';
    ctx.shadowBlur = 8; ctx.shadowColor = '#ff88ff';
    ctx.fillRect(this.x - this.width/2, this.y - this.height, this.width, this.height);
    ctx.restore();
  }
}


