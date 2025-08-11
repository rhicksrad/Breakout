import { clamp } from '../engine/Utils.js';

export default class Ball {
  constructor(game, x, y){
    this.game = game;
    this.x = x; this.y = y;
    this.radius = 7;
    this.speed = 520;
    this.vx = 0; this.vy = 0;
    this.stuckToPaddle = true;
    this.color = '#b2f5ff';
    this.slowTimer = 0;
  }

  launch(){
    const angle = (-Math.PI/3) + (Math.random() * (Math.PI/6));
    const s = this.speed;
    this.vx = Math.cos(angle) * s;
    this.vy = Math.sin(angle) * s;
    this.stuckToPaddle = false;
  }

  update(dt){
    const canvas = this.game.renderer;
    const paddle = this.game.paddle;
    if(this.stuckToPaddle){
      this.x = paddle.x;
      this.y = paddle.y - paddle.height/2 - this.radius - 2;
      if(this.game.input.consumeLaunch()){
        this.launch();
      }
      return;
    }

    if(this.slowTimer > 0){ this.slowTimer -= dt; }
    const slowFactor = this.slowTimer > 0 ? 0.7 : 1;

    this.x += this.vx * dt * slowFactor;
    this.y += this.vy * dt * slowFactor;

    // Wall collisions
    if(this.x < this.radius){ this.x = this.radius; this.vx *= -1; this.game.audio.play('bounce'); }
    if(this.x > canvas.width - this.radius){ this.x = canvas.width - this.radius; this.vx *= -1; this.game.audio.play('bounce'); }
    if(this.y < this.radius + 4){ this.y = this.radius + 4; this.vy *= -1; this.game.audio.play('bounce'); }

    // Bottom out
    if(this.y > canvas.height + this.radius){
      this.game.ballOut(this);
    }

    // Paddle collision
    const half = paddle.width/2;
    if(this.y + this.radius >= paddle.y - paddle.height/2 &&
       this.y - this.radius <= paddle.y + paddle.height/2 &&
       this.x >= paddle.x - half && this.x <= paddle.x + half && this.vy > 0){
      const hitPos = (this.x - paddle.x) / half; // -1..1
      const angle = (-Math.PI/4) + (hitPos * (Math.PI/3));
      const speed = Math.min(Math.hypot(this.vx, this.vy) * 1.02, 1000);
      this.vx = Math.sin(angle) * speed;
      this.vy = -Math.abs(Math.cos(angle) * speed);
      this.y = paddle.y - paddle.height/2 - this.radius - 1;
      this.game.audio.play('bounce');
    }
  }

  render(ctx){
    ctx.save();
    const g = ctx.createRadialGradient(this.x - 2, this.y - 4, 2, this.x, this.y, this.radius);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, this.color);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}


