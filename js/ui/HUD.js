export default class HUD {
  constructor(game){
    this.game = game;
    this.scoreEl = document.getElementById('hud-score');
    this.bestEl = document.getElementById('hud-best');
    this.levelEl = document.getElementById('hud-level');
    this.livesEl = document.getElementById('hud-lives');
    this.multEl = document.getElementById('hud-multiplier');
    this.laserEl = document.getElementById('hud-laser');
    this.bombsEl = document.getElementById('hud-bombs');
    this.toastContainer = document.getElementById('toast-container');
    this._bind();
  }

  _bind(){
    window.addEventListener('game:score', (e)=>{
      const { score, best } = e.detail;
      this.scoreEl.textContent = score;
      this.bestEl.textContent = best;
      if(score >= 10000) this.game.unlock('score_10000');
    });
    window.addEventListener('game:level', (e)=>{
      const lvl = e.detail; this.levelEl.textContent = lvl;
      if(lvl >= 5) this.game.unlock('level_5');
    });
    window.addEventListener('game:lives', (e)=>{ this.livesEl.textContent = e.detail; });
    window.addEventListener('game:laser', (e)=>{ this.laserEl.textContent = e.detail > 0 ? 'On' : 'Off'; });
    window.addEventListener('game:bombs', (e)=>{ this.bombsEl.textContent = e.detail; });

    window.addEventListener('game:toast', (e)=>{
      const { message, type } = e.detail;
      const item = document.createElement('div');
      item.className = `toast ${type}`;
      item.textContent = message;
      this.toastContainer.appendChild(item);
      setTimeout(()=> item.remove(), 2300);
    });
  }
}


