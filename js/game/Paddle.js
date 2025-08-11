import { clamp, lerp } from '../engine/Utils.js';

export default class Paddle {
  constructor(game){
    this.game = game;
    this.width = 120;
    this.height = 16;
    this.x = game.renderer.width / 2;
    this.y = game.renderer.height - 60;
    this.speed = 980;
    this.targetXNorm = 0.5; // normalized [0,1]
    this.expandTimer = 0;
  }

  reset(){
    this.width = 120;
    this.expandTimer = 0;
    this.x = this.game.renderer.width / 2;
  }

  update(dt){
    const canvas = this.game.renderer;
    if(this.expandTimer > 0){
      this.expandTimer -= dt;
      this.width = lerp(this.width, 180, 0.2);
    } else {
      this.width = lerp(this.width, 120, 0.15);
    }

    // Keyboard movement
    const dir = this.game.input.getMovementDirection();
    if(dir !== 0){
      this.x += dir * this.speed * dt * this.game.input.sensitivity;
    } else {
      // Pointer movement
      const target = clamp(this.game.input.pointerX, 0, 1) * canvas.width;
      this.x = lerp(this.x, target, 0.22 * this.game.input.sensitivity);
    }
    const half = this.width/2;
    this.x = clamp(this.x, half+6, canvas.width - half - 6);
  }

  render(ctx){
    ctx.save();
    const half = this.width/2;
    const r = 8;
    const x = this.x - half, y = this.y - this.height/2, w = this.width, h = this.height;
    const grad = ctx.createLinearGradient(x, y, x, y+h);
    grad.addColorStop(0, '#ffffffcc');
    grad.addColorStop(1, '#ffffff22');
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
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


