import { nowMs, clamp, randRange } from '../engine/Utils.js';
import Paddle from './Paddle.js';
import Ball from './Ball.js';
import Level from './Level.js';
import PowerUp, { randomPowerType } from './PowerUp.js';
import { LaserBolt } from './Laser.js';
import Explosion from './Explosion.js';

export default class Game {
  constructor({ renderer, input, audio, particles, storage }){
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.particles = particles;
    this.storage = storage;

    this.state = 'menu'; // 'menu' | 'playing' | 'paused' | 'gameover'
    this.levelIndex = 1;
    this.score = 0; this.best = storage.get('best', 0);
    this.lives = 3; this.multiplier = 1;
    this.paddle = new Paddle(this);
    this.balls = [];
    this.bricks = [];
    this.powerups = [];
    this.shieldTimer = 0;
    this.achievements = new Set(storage.get('achievements', []));
    this.laserTimer = 0;
    this.pierceTimer = 0;
    this.bombs = 0;
    this.laserBolts = [];
    this.explosions = [];

    this._lastTime = nowMs();
    this._loop = this._loop.bind(this);

    requestAnimationFrame(this._loop);
    this._broadcastState();
  }

  _loop(){
    const now = nowMs();
    const dt = Math.min((now - this._lastTime)/1000, 1/20);
    this._lastTime = now;

    if(this.state === 'playing'){
      this.update(dt);
      this.render();
    } else {
      // still render some ambient elements
      this.render(true);
    }
    requestAnimationFrame(this._loop);
  }

  start(){
    this.state = 'playing';
    this.levelIndex = 1;
    this.score = 0; this.lives = 3; this.multiplier = 1;
    this.paddle.reset();
    this.balls = []; this.powerups = []; this.bricks = [];
    this.spawnBall();
    this.loadLevel(this.levelIndex);
    this._broadcastState();
  }

  loadLevel(i){
    const lvl = new Level(i);
    this.bricks = lvl.build(this.renderer.width);
    this.audio.play('level');
    window.dispatchEvent(new CustomEvent('game:level', { detail: i }));
  }

  spawnBall(){
    const ball = new Ball(this, this.paddle.x, this.paddle.y - 30);
    this.balls.push(ball);
  }

  spawnExtraBalls(count){
    const main = this.balls[0];
    for(let i=0;i<count;i++){
      const b = new Ball(this, main.x, main.y);
      b.stuckToPaddle = false;
      const angle = randRange(-Math.PI*0.8, -Math.PI*0.2);
      const s = main.speed * randRange(0.9,1.1);
      b.vx = Math.cos(angle) * s; b.vy = Math.sin(angle) * s;
      this.balls.push(b);
    }
  }

  slowBalls(duration){
    for(const b of this.balls){ b.slowTimer = Math.max(b.slowTimer, duration); }
  }

  activateShield(duration){ this.shieldTimer = Math.max(this.shieldTimer, duration); }

  update(dt){
    if(this.shieldTimer > 0) this.shieldTimer -= dt;
    const before = this.laserTimer;
    if(this.laserTimer > 0) this.laserTimer -= dt;
    if((before <= 0 && this.laserTimer > 0) || (before > 0 && this.laserTimer <= 0)){
      window.dispatchEvent(new CustomEvent('game:laser', { detail: this.laserTimer }));
    }
    if(this.pierceTimer > 0) this.pierceTimer -= dt;
    this.paddle.update(dt);
    this.particles.update(dt);

    for(const b of this.balls) b.update(dt);
    this.handleCollisions();

    // Handle special inputs
    if(this.input.consumeFire()) this.tryFireLaser();
    if(this.input.consumeBomb()) this.detonateBomb();

    // Update powerups
    for(const p of this.powerups){ p.update(dt); }

    // Update lasers
    for(const l of this.laserBolts) l.update(dt);
    this.laserBolts = this.laserBolts.filter(l=>!l.dead);

    // Update explosions
    for(const ex of this.explosions) ex.update(dt, this);
    this.explosions = this.explosions.filter(ex=>!ex.done);
    const paddle = this.paddle;
    this.powerups = this.powerups.filter(p=>{
      if(p.y > this.renderer.height + 20) return false;
      const hit = Math.abs(p.y - paddle.y) < 18 && Math.abs(p.x - paddle.x) < (paddle.width/2 + 12);
      if(hit){ p.apply(this); return false; }
      return true;
    });

    // Check level clear
    if(this.bricks.every(b=>b.destroyed)){
      this.levelIndex += 1;
      this.loadLevel(this.levelIndex);
      // Slight difficulty increase
      for(const b of this.balls){ b.speed *= 1.04; }
      this.toast(`Level ${this.levelIndex}`, 'info');
    }
  }

  handleCollisions(){
    for(const ball of this.balls){
      if(ball.stuckToPaddle) continue;
      for(const brick of this.bricks){
        if(brick.destroyed) continue;
        if(circleRectIntersect(ball.x, ball.y, ball.radius, brick)){
          // Reflect
          const overlapX = (ball.x < brick.x + brick.w/2) ? (ball.x + ball.radius - brick.x) : (brick.x + brick.w - (ball.x - ball.radius));
          const overlapY = (ball.y < brick.y + brick.h/2) ? (ball.y + ball.radius - brick.y) : (brick.y + brick.h - (ball.y - ball.radius));
          const piercing = this.pierceTimer > 0;
          if(!piercing){ if(overlapX < overlapY){ ball.vx *= -1; } else { ball.vy *= -1; } }

          brick.hit();
          this.addScore(50 * this.multiplier);
          this.particles.emit(ball.x, ball.y, brick.color, 12);
          this.audio.play('brick');
          if(brick.destroyed){
            this.renderer.shake(0.12, 6);
            // Powerup chance
            if(brick.hasPower || Math.random() < 0.12){
              const type = randomPowerType();
              this.powerups.push(new PowerUp(type, brick.x + brick.w/2, brick.y + brick.h/2));
            }
            if(!this.achievements.has('first_brick')) this.unlock('first_brick');
          }
        }
      }
    }

    // Laser vs bricks
    for(const bolt of this.laserBolts){
      for(const brick of this.bricks){
        if(brick.destroyed) continue;
        if(pointInRect(bolt.x, bolt.y - bolt.height/2, brick)){
          brick.hp = 0; brick.destroyed = true; this.addScore(60);
          this.particles.emit(bolt.x, bolt.y, brick.color, 10);
          bolt.dead = true; break;
        }
      }
    }
  }

  render(ambientOnly=false){
    const { ctx } = this.renderer;
    const canvas = this.renderer;
    this.renderer.beginFrame();

    // Playfield glow
    ctx.save();
    const pad = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.strokeRect(pad, pad, canvas.width - pad*2, canvas.height - pad*2);
    ctx.restore();

    // Shield line
    if(this.shieldTimer > 0){
      ctx.save();
      ctx.strokeStyle = 'rgba(255,120,220,0.6)';
      ctx.lineWidth = 3;
      const y = this.paddle.y + 12;
      ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(canvas.width-20, y); ctx.stroke();
      ctx.restore();
    }

    // Bricks
    for(const b of this.bricks) b.render(ctx);

    // Powerups
    for(const p of this.powerups) p.render(ctx);

    // Paddle
    this.paddle.render(ctx);

    // Balls
    for(const b of this.balls) b.render(ctx);

    // Lasers
    for(const l of this.laserBolts) l.render(ctx);

    // Explosions
    for(const ex of this.explosions) ex.render(ctx);

    // Particles
    this.particles.render(ctx);

    this.renderer.endFrame();
  }

  addScore(amount){
    this.score += amount;
    if(this.score > this.best){ this.best = this.score; this.storage.set('best', this.best); }
    window.dispatchEvent(new CustomEvent('game:score', { detail: { score: this.score, best: this.best } }));
  }

  ballOut(ball){
    // Shield absorbs one miss
    if(this.shieldTimer > 0){
      this.shieldTimer = 0;
      ball.vy *= -1; ball.y = this.paddle.y - 30;
      this.toast('Shield saved you!', 'info');
      return;
    }
    const idx = this.balls.indexOf(ball);
    if(idx >= 0) this.balls.splice(idx,1);
    if(this.balls.length === 0){
      this.lives -= 1;
      window.dispatchEvent(new CustomEvent('game:lives', { detail: this.lives }));
      this.audio.play('lose');
      if(this.lives <= 0){ this.gameOver(); return; }
      this.spawnBall();
    }
  }

  gameOver(){
    this.state = 'menu';
    this.toast(`Game Over — Score ${this.score}`, 'info');
    this._broadcastState();
  }

  togglePause(){
    if(this.state !== 'playing'){ return; }
    this.state = 'paused';
    this._broadcastState();
  }

  resume(){
    if(this.state !== 'paused') return;
    this.state = 'playing';
    this._broadcastState();
  }

  _broadcastState(){
    window.dispatchEvent(new CustomEvent('game:state', { detail: this.state }));
    window.dispatchEvent(new CustomEvent('game:level', { detail: this.levelIndex }));
    window.dispatchEvent(new CustomEvent('game:lives', { detail: this.lives }));
    window.dispatchEvent(new CustomEvent('game:score', { detail: { score: this.score, best: this.best } }));
  }

  toast(message, type='info'){
    window.dispatchEvent(new CustomEvent('game:toast', { detail: { message, type } }));
  }

  unlock(key){
    const map = {
      'first_brick': 'First Blood — Destroy your first brick',
      'multiball': 'Chaos Mode — Activate Multiball',
      'level_5': 'On a Roll — Reach Level 5',
      'score_10000': 'Stacked — Score 10,000 points',
    };
    if(this.achievements.has(key)) return;
    this.achievements.add(key);
    this.storage.set('achievements', Array.from(this.achievements));
    this.audio.play('achievement');
    this.toast(map[key] || key, 'positive');
    window.dispatchEvent(new CustomEvent('game:achievement', { detail: Array.from(this.achievements) }));
  }

  activateLaser(duration){ this.laserTimer = Math.max(this.laserTimer, duration); }
  activatePierce(duration){ this.pierceTimer = Math.max(this.pierceTimer, duration); }
  activateMultiplier(duration, amount){ this._multTimer = Math.max(this._multTimer||0, duration); this.multiplier = amount; }
  grantBomb(n){ this.bombs = (this.bombs||0) + (n||1); this.toast(`Bombs: ${this.bombs}`, 'info'); window.dispatchEvent(new CustomEvent('game:bombs', { detail: this.bombs })); }

  tryFireLaser(){
    if(this.laserTimer <= 0) return;
    const left = this.paddle.x - this.paddle.width/2 + 10;
    const right = this.paddle.x + this.paddle.width/2 - 10;
    const y = this.paddle.y - this.paddle.height/2 - 6;
    this.laserBolts.push(new LaserBolt(left, y));
    this.laserBolts.push(new LaserBolt(right, y));
    this.audio.play('power', { pitch: 1.2 });
  }

  detonateBomb(){
    if(this.bombs <= 0) return; this.bombs -= 1;
    const ex = new Explosion(this.paddle.x, this.paddle.y - 90, 86);
    this.explosions.push(ex);
  }
}

function circleRectIntersect(cx, cy, cr, rect){
  const rx=rect.x, ry=rect.y, rw=rect.w, rh=rect.h;
  const closestX = clamp(cx, rx, rx+rw);
  const closestY = clamp(cy, ry, ry+rh);
  const dx = cx - closestX; const dy = cy - closestY;
  return (dx*dx + dy*dy) < (cr*cr);
}


