export default class Menu {
  constructor(game, storage){
    this.game = game;
    this.storage = storage;

    this.main = document.getElementById('menu-main');
    this.pause = document.getElementById('menu-pause');
    this.settings = document.getElementById('menu-settings');
    this.achievements = document.getElementById('menu-achievements');
    this.achList = document.getElementById('achievements-list');

    this.toggleSfx = document.getElementById('toggle-sfx');
    this.toggleMusic = document.getElementById('toggle-music');
    this.toggleParticles = document.getElementById('toggle-particles');
    this.selectTheme = document.getElementById('select-theme');
    this.rangeSensitivity = document.getElementById('range-sensitivity');

    // Restore settings
    const sfx = storage.get('sfx', true);
    const particles = storage.get('particles', true);
    const music = storage.get('music', true);
    const theme = storage.get('theme', 'neon');
    const sensitivity = storage.get('sensitivity', 1);
    document.body.setAttribute('data-theme', theme);
    game.audio.setEnabled(sfx);
    game.particles.enabled = particles;
    game.audio.setMusicEnabled(music);
    game.input.sensitivity = sensitivity;
    this.toggleSfx.checked = sfx;
    this.toggleParticles.checked = particles;
    this.toggleMusic.checked = music;
    this.selectTheme.value = theme;
    this.rangeSensitivity.value = sensitivity;

    this._bind();
    this._renderAchievements();
  }

  _bind(){
    const playBtn = document.getElementById('btn-play');
    playBtn?.addEventListener('click', ()=>{
      this.main.classList.add('hidden');
      this.game.start();
      const canvas = document.getElementById('game-canvas');
      canvas?.focus({ preventScroll: true });
    });
    document.getElementById('btn-settings')?.addEventListener('click', ()=> this._open(this.settings));
    document.querySelector('[data-open-settings]')?.addEventListener('click', ()=> this._open(this.settings));
    document.querySelector('[data-close-settings]')?.addEventListener('click', ()=> this._close(this.settings));

    document.getElementById('btn-achievements')?.addEventListener('click', ()=> this._open(this.achievements));
    document.querySelector('[data-close-achievements]')?.addEventListener('click', ()=> this._close(this.achievements));

    document.getElementById('btn-resume')?.addEventListener('click', ()=>{ this._close(this.pause); this.game.resume(); });
    document.getElementById('btn-restart')?.addEventListener('click', ()=>{ this._close(this.pause); this.game.start(); });
    document.getElementById('btn-exit')?.addEventListener('click', ()=>{ this._close(this.pause); this.main.classList.remove('hidden'); });

    window.addEventListener('game:state', (e)=>{
      const s = e.detail;
      if(s === 'paused') this._open(this.pause);
      else this._close(this.pause);
      if(s === 'menu') this.main.classList.remove('hidden');
    });

    // Settings controls
    this.toggleSfx.addEventListener('change', ()=>{ this.game.audio.setEnabled(this.toggleSfx.checked); this.storage.set('sfx', this.toggleSfx.checked); });
    this.toggleParticles.addEventListener('change', ()=>{ this.game.particles.enabled = this.toggleParticles.checked; this.storage.set('particles', this.toggleParticles.checked); });
    this.toggleMusic.addEventListener('change', ()=>{ this.game.audio.setMusicEnabled(this.toggleMusic.checked); this.storage.set('music', this.toggleMusic.checked); });
    this.selectTheme.addEventListener('change', ()=>{ document.body.setAttribute('data-theme', this.selectTheme.value); this.storage.set('theme', this.selectTheme.value); });
    this.rangeSensitivity.addEventListener('input', ()=>{ this.game.input.sensitivity = parseFloat(this.rangeSensitivity.value); this.storage.set('sensitivity', this.rangeSensitivity.value); });

    // Pause via keyboard P
    window.addEventListener('keydown', (e)=>{
      if((e.key === 'p' || e.key === 'P') && this.game.state === 'playing'){
        this.game.togglePause();
      }
    });

    window.addEventListener('game:achievement', ()=> this._renderAchievements());
  }

  _open(el){ el.classList.remove('hidden'); }
  _close(el){ el.classList.add('hidden'); }

  _renderAchievements(){
    const known = [
      ['first_brick', 'First Blood — Destroy your first brick'],
      ['multiball', 'Chaos Mode — Activate Multiball'],
      ['level_5', 'On a Roll — Reach Level 5'],
      ['score_10000', 'Stacked — Score 10,000 points'],
    ];
    const unlocked = new Set(this.game.achievements);
    this.achList.innerHTML = '';
    for(const [key, label] of known){
      const item = document.createElement('div');
      item.className = 'achievement glass ' + (unlocked.has(key) ? 'unlocked' : '');
      item.textContent = label;
      this.achList.appendChild(item);
    }
  }
}


