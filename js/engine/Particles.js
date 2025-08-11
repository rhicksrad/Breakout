import { randRange, clamp } from './Utils.js';

class Particle {
  constructor(x,y,color){
    this.x = x; this.y = y;
    this.vx = randRange(-140,140);
    this.vy = randRange(-200, -60);
    this.life = randRange(0.4, 0.9);
    this.age = 0;
    this.size = randRange(1.5, 3.5);
    this.color = color || 'white';
  }
  update(dt){
    this.age += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 600 * dt;
  }
  get alive(){ return this.age < this.life; }
}

export default class Particles {
  constructor(renderer){
    this.renderer = renderer;
    this.particles = [];
    this.enabled = true;
  }
  emit(x,y,color,amount=16){
    if(!this.enabled) return;
    for(let i=0;i<amount;i++) this.particles.push(new Particle(x,y,color));
  }
  update(dt){
    this.particles = this.particles.filter(p=>p.alive);
    for(const p of this.particles) p.update(dt);
  }
  render(ctx){
    if(!this.enabled) return;
    ctx.save();
    for(const p of this.particles){
      const t = clamp(1 - p.age / p.life, 0, 1);
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size*0.5, p.y - p.size*0.5, p.size, p.size);
    }
    ctx.restore();
  }
}


