import { randRange } from '../engine/Utils.js';

export default class PowerUp {
  constructor(type, x, y){
    this.type = type; // expand | multiball | slow | shield
    this.x = x; this.y = y; this.vy = 140;
    this.size = 18;
    this.col = {
      expand: '#a0ff8a',
      multiball: '#ffd074',
      slow: '#8ac7ff',
      shield: '#ffa0e5',
      laser: '#ff88ff',
      bomb: '#ffaf6c',
      pierce: '#9cf0ff',
      x2: '#b0ff6c'
    }[type] || 'white';
    this.symbol = {
      expand: '+', multiball: '×', slow: '⏵', shield: '🛡️',
      laser: '⚡', bomb: '💣', pierce: '⟂', x2: '2x'
    }[type] || '?';
    this.dead = false;
  }

  apply(game){
    switch(this.type){
      case 'expand': game.paddle.expandTimer = Math.max(game.paddle.expandTimer, 10); break;
      case 'multiball': game.spawnExtraBalls(2); game.unlock('multiball'); break;
      case 'slow': game.slowBalls(8); break;
      case 'shield': game.activateShield(12); break;
      case 'laser': game.activateLaser(10); break;
      case 'bomb': game.grantBomb(1); break;
      case 'pierce': game.activatePierce(12); break;
      case 'x2': game.activateMultiplier(20, 2); break;
    }
    game.audio.play('power');
    game.toast(`${this.type.toUpperCase()}!`, 'positive');
  }

  update(dt){ this.y += this.vy * dt; }

  render(ctx){
    const s = this.size;
    ctx.save();
    ctx.fillStyle = this.col;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(this.x, this.y, s/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#06232f';
    ctx.font = `${Math.floor(s*0.7)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.symbol, this.x, this.y + 1);
    ctx.restore();
  }
}

export function randomPowerType(){
  const list = ['expand','multiball','slow','shield','laser','bomb','pierce','x2'];
  return list[Math.floor(randRange(0, list.length))];
}


