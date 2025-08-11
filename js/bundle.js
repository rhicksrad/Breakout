(function(){
  // Tiny module loader supporting relative paths
  const MODULES = {};
  function define(id, factory){ MODULES[id] = { id, factory, exports: {}, inited: false }; }
  function resolve(baseId, req){
    if(req.startsWith('.')){
      const base = baseId.split('/'); base.pop();
      const parts = req.split('/');
      const out = base.slice(0);
      for(const p of parts){
        if(p === '' || p === '.') continue;
        if(p === '..') out.pop(); else out.push(p);
      }
      let resolved = out.join('/');
      if(!resolved.startsWith('./')) resolved = './' + resolved;
      return resolved;
    }
    return req;
  }
  function requireFrom(currentId){
    return function(req){
      const id = resolve(currentId, req);
      const mod = MODULES[id];
      if(!mod) throw new Error('Module not found: ' + id);
      if(!mod.inited){
        mod.inited = true;
        mod.factory(requireFrom(id), mod.exports, mod);
      }
      return mod.exports;
    };
  }

  // engine/Utils.js
  define('./engine/Utils.js', function(require, exports){
    function clamp(value, min, max){ return Math.max(min, Math.min(max, value)); }
    function lerp(a,b,t){ return a + (b-a)*t; }
    function randRange(min,max){ return Math.random()*(max-min)+min; }
    function pick(array){ return array[Math.floor(Math.random()*array.length)]; }
    function nowMs(){ return performance.now(); }
    function hsvToRgb(h,s,v){
      let r,g,b; let i=Math.floor(h*6); let f=h*6-i; let p=v*(1-s); let q=v*(1-f*s); let t=v*(1-(1-f)*s);
      switch(i%6){ case 0: r=v; g=t; b=p; break; case 1: r=q; g=v; b=p; break; case 2: r=p; g=v; b=t; break; case 3: r=p; g=q; b=v; break; case 4: r=t; g=p; b=v; break; case 5: r=v; g=p; b=q; break; }
      return { r: Math.round(r*255), g: Math.round(g*255), b: Math.round(b*255) };
    }
    function rgbToHex({r,g,b}){ return `#${((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1)}`; }
    function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }
    exports.clamp = clamp; exports.lerp = lerp; exports.randRange = randRange; exports.pick = pick; exports.nowMs = nowMs; exports.hsvToRgb = hsvToRgb; exports.rgbToHex = rgbToHex; exports.easeOutCubic = easeOutCubic;
  });

  // engine/Input.js
  define('./engine/Input.js', function(require, exports){
    class Input {
      constructor(canvas){ this.canvas=canvas; this.keys=new Set(); this.pointerX=0; this.isPointerDown=false; this.launchRequested=false; this.sensitivity=1; this.fireRequested=false; this.bombRequested=false; this._bind(); }
      _bind(){
        window.addEventListener('keydown',(e)=>{ this.keys.add(e.key.toLowerCase()); if(e.key===' ') this.launchRequested=true; if(e.key==='k'||e.key==='K') this.fireRequested=true; if(e.key==='l'||e.key==='L') this.bombRequested=true; if(['ArrowLeft','ArrowRight',' ','a','d','A','D','p','P'].includes(e.key)){ e.preventDefault(); } }, { passive:false });
        window.addEventListener('keyup',(e)=>{ this.keys.delete(e.key.toLowerCase()); });
        const updatePointer = (e)=>{ const rect=this.canvas.getBoundingClientRect(); if(e.touches&&e.touches[0]){ this.pointerX=(e.touches[0].clientX-rect.left)/rect.width; } else { this.pointerX=(e.clientX-rect.left)/rect.width; } };
        this.canvas.addEventListener('pointerdown',(e)=>{ this.isPointerDown=true; updatePointer(e); });
        this.canvas.addEventListener('pointermove', updatePointer);
        window.addEventListener('pointerup', ()=>{ this.isPointerDown=false; });
        this.canvas.addEventListener('touchstart',(e)=>{ this.isPointerDown=true; updatePointer(e); }, { passive:true });
        this.canvas.addEventListener('touchmove', updatePointer, { passive:true });
        window.addEventListener('touchend', ()=>{ this.isPointerDown=false; }, { passive:true });
      }
      getMovementDirection(){ let dir=0; if(this.keys.has('arrowleft')||this.keys.has('a')) dir-=1; if(this.keys.has('arrowright')||this.keys.has('d')) dir+=1; return dir; }
      consumeLaunch(){ const requested=this.launchRequested||this.isPointerDown; this.launchRequested=false; return requested; }
      consumeFire(){ const r=this.fireRequested; this.fireRequested=false; return r; }
      consumeBomb(){ const r=this.bombRequested; this.bombRequested=false; return r; }
    }
    exports.default = Input;
  });

  // engine/Audio.js
  define('./engine/Audio.js', function(require, exports){
    class AudioManager {
      constructor(){ this.ctx=null; this.enabled=true; this._unlocked=false; this._bgm=null; this.musicEnabled=true; this._scheduler=null; this._nextNoteTime=0; this._beatIndex=0; this._tempo=140; this._bindUnlock(); }
      _bindUnlock(){ const unlock=()=>{ if(this._unlocked) return; try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); const buffer=this.ctx.createBuffer(1,1,22050); const source=this.ctx.createBufferSource(); source.buffer=buffer; source.connect(this.ctx.destination); source.start(0); this.ctx.resume(); this._unlocked=true; if(this.musicEnabled) this.startMusic(); }catch(e){} window.removeEventListener('pointerdown',unlock); window.removeEventListener('keydown',unlock); }; window.addEventListener('pointerdown',unlock,{once:true}); window.addEventListener('keydown',unlock,{once:true}); }
      setEnabled(v){ this.enabled=!!v; }
      setMusicEnabled(v){ this.musicEnabled=!!v; if(!this.musicEnabled) this.stopMusic(); else this.startMusic(); }
      play(name,{pitch=1, volume=0.2}={}){ if(!this.enabled||!this.ctx) return; switch(name){ case 'bounce': this._beep(400*pitch,0.03,volume*0.5,'sine'); break; case 'brick': this._beep(240*pitch,0.05,volume*0.7,'square'); break; case 'power': this._beep(520*pitch,0.12,volume*0.6,'triangle'); break; case 'lose': this._beep(120*pitch,0.25,volume*0.6,'sawtooth'); break; case 'level': this._melody([440,660,880],0.06,volume*0.5); break; case 'achievement': this._melody([660,880,1320],0.08,volume*0.5); break; } }
      _beep(freq,dur,volume,type='sine'){ const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type=type; o.frequency.value=freq; o.connect(g); g.connect(this.ctx.destination); const now=this.ctx.currentTime; g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(volume, now+0.005); g.gain.exponentialRampToValueAtTime(0.0001, now+dur); o.start(now); o.stop(now+dur+0.02); }
      _melody(freqs,stepDur,volume){ let t=this.ctx.currentTime; freqs.forEach((f)=>{ const o=this.ctx.createOscillator(); const g=this.ctx.createGain(); o.type='triangle'; o.frequency.value=f; o.connect(g); g.connect(this.ctx.destination); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(volume, t+0.01); g.gain.exponentialRampToValueAtTime(0.0001, t+stepDur); o.start(t); o.stop(t+stepDur+0.02); t+=stepDur*0.9; }); }
      startMusic(){ if(!this.musicEnabled) return; if(!this.ctx) return; if(this._bgm) return; const ctx=this.ctx; const master=ctx.createGain(); master.gain.value=0.18; master.connect(ctx.destination); this._bgm={ master }; this._nextNoteTime=ctx.currentTime+0.05; this._beatIndex=0; const lookAhead=0.1; const intervalMs=25; const schedule=()=>{ if(!this._bgm) return; while(this._nextNoteTime < ctx.currentTime + lookAhead){ this._scheduleBeat(this._beatIndex, this._nextNoteTime, master); const secondsPerBeat = 60.0/this._tempo; this._nextNoteTime += secondsPerBeat/4; this._beatIndex = (this._beatIndex + 1) % 16; } }; this._scheduler=setInterval(schedule, intervalMs); }
      stopMusic(){ if(!this._bgm) return; if(this._scheduler) clearInterval(this._scheduler); this._scheduler=null; try{ this._bgm.master.disconnect(); }catch(_){ } this._bgm=null; }
      _scheduleBeat(step,time,master){ const ctx=this.ctx; if(step===0||step===8){ const o=ctx.createOscillator(); o.type='sine'; const g=ctx.createGain(); o.connect(g); g.connect(master); o.frequency.setValueAtTime(120,time); o.frequency.exponentialRampToValueAtTime(40,time+0.15); g.gain.setValueAtTime(0.001,time); g.gain.exponentialRampToValueAtTime(0.9,time+0.005); g.gain.exponentialRampToValueAtTime(0.0001,time+0.18); o.start(time); o.stop(time+0.2); } if(step===4||step===12){ const noise=this._createNoiseBuffer(); const src=ctx.createBufferSource(); src.buffer=noise; const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1800; bp.Q.value=1.2; const g=ctx.createGain(); g.gain.value=0.0; src.connect(bp); bp.connect(g); g.connect(master); g.gain.setValueAtTime(0.001,time); g.gain.linearRampToValueAtTime(0.5,time+0.01); g.gain.exponentialRampToValueAtTime(0.0001,time+0.12); src.start(time); src.stop(time+0.15); } if(step%2===0){ const noise=this._createNoiseBuffer(); const src=ctx.createBufferSource(); src.buffer=noise; const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=7000; hp.Q.value=0.7; const g=ctx.createGain(); const vol=(step%4===2)?0.25:0.18; src.connect(hp); hp.connect(g); g.connect(master); g.gain.setValueAtTime(0.001,time); g.gain.linearRampToValueAtTime(vol,time+0.005); g.gain.exponentialRampToValueAtTime(0.0001,time+0.05); src.start(time); src.stop(time+0.06); } const bassPattern=[0,0,7,0,-3,-3,5,-3,0,0,7,0,-5,-5,5,-5]; const base=55; const note=bassPattern[step]; if(note!==undefined){ const freq=base*Math.pow(2,note/12); const o=ctx.createOscillator(); o.type='sawtooth'; const g=ctx.createGain(); o.connect(g); g.connect(master); o.frequency.setValueAtTime(freq,time); g.gain.setValueAtTime(0.0001,time); g.gain.linearRampToValueAtTime(0.22,time+0.02); g.gain.exponentialRampToValueAtTime(0.0001,time+0.22); o.start(time); o.stop(time+0.25); } }
      _createNoiseBuffer(){ const buffer=this.ctx.createBuffer(1,4410,44100); const data=buffer.getChannelData(0); for(let i=0;i<data.length;i++){ data[i]=Math.random()*2-1; } return buffer; }
    }
    exports.default = AudioManager;
  });

  // engine/Particles.js
  define('./engine/Particles.js', function(require, exports){
    const { randRange, clamp } = require('./Utils.js');
    class Particle{ constructor(x,y,color){ this.x=x; this.y=y; this.vx=randRange(-140,140); this.vy=randRange(-200,-60); this.life=randRange(0.4,0.9); this.age=0; this.size=randRange(1.5,3.5); this.color=color||'white'; } update(dt){ this.age+=dt; this.x+=this.vx*dt; this.y+=this.vy*dt; this.vy+=600*dt; } get alive(){ return this.age < this.life; } }
    class Particles{ constructor(renderer){ this.renderer=renderer; this.particles=[]; this.enabled=true; } emit(x,y,color,amount=16){ if(!this.enabled) return; for(let i=0;i<amount;i++) this.particles.push(new Particle(x,y,color)); } update(dt){ this.particles=this.particles.filter(p=>p.alive); for(const p of this.particles) p.update(dt); } render(ctx){ if(!this.enabled) return; ctx.save(); for(const p of this.particles){ const t=clamp(1 - p.age/p.life, 0, 1); ctx.globalAlpha=t; ctx.fillStyle=p.color; ctx.fillRect(p.x - p.size*0.5, p.y - p.size*0.5, p.size, p.size); } ctx.restore(); } }
    exports.default = Particles;
  });

  // engine/Renderer.js
  define('./engine/Renderer.js', function(require, exports){
    class Renderer{
      constructor(canvas){ this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.width=900; this.height=600; this.shakeTime=0; this.shakeStrength=0; this.resizeToContainer(); }
      resizeToContainer(){ const bounds=this.canvas.getBoundingClientRect(); const dpr=Math.min(window.devicePixelRatio||1,2); const cssW=Math.max(1, Math.round(bounds.width)); const cssH=Math.max(1, Math.round(bounds.height)); this.width=cssW; this.height=cssH; this.canvas.width=Math.round(cssW*dpr); this.canvas.height=Math.round(cssH*dpr); this.ctx.setTransform(dpr,0,0,dpr,0,0); }
      beginFrame(){ const ctx=this.ctx; ctx.clearRect(0,0,this.width,this.height); ctx.save(); if(this.shakeTime>0){ const dx=(Math.random()-0.5)*this.shakeStrength; const dy=(Math.random()-0.5)*this.shakeStrength; ctx.translate(dx,dy); this.shakeTime -= 1/60; } }
      endFrame(){ this.ctx.restore(); }
      shake(duration=0.2, strength=6){ this.shakeTime=Math.max(this.shakeTime, duration); this.shakeStrength=Math.max(this.shakeStrength, strength); }
    }
    exports.default = Renderer;
  });

  // engine/Storage.js
  define('./engine/Storage.js', function(require, exports){
    class Storage{ constructor(namespace){ this.ns=namespace; } _key(k){ return `${this.ns}:${k}`; } get(k,fallback){ try{ const v=localStorage.getItem(this._key(k)); return v==null ? fallback : JSON.parse(v); }catch(_){ return fallback; } } set(k,v){ try{ localStorage.setItem(this._key(k), JSON.stringify(v)); }catch(_){ } } }
    exports.default = Storage;
  });

  // game/Brick.js
  define('./game/Brick.js', function(require, exports){
    class Brick{ constructor(x,y,w,h,hp,color){ this.x=x; this.y=y; this.w=w; this.h=h; this.hp=hp; this.color=color; this.destroyed=false; } hit(){ this.hp -= 1; if(this.hp<=0){ this.destroyed=true; } } render(ctx){ if(this.destroyed) return; const r=7; ctx.save(); const x=this.x,y=this.y,w=this.w,h=this.h; const g1=ctx.createLinearGradient(x,y,x+w,y+h); g1.addColorStop(0,'#ffffffcc'); g1.addColorStop(1,this.color); ctx.fillStyle=g1; ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1; roundRect(ctx, x+0.5, y+0.5, w-1, h-1, r); ctx.fill(); const g2=ctx.createLinearGradient(x,y,x,y+h); g2.addColorStop(0,'rgba(255,255,255,0.35)'); g2.addColorStop(0.5,'rgba(255,255,255,0.08)'); g2.addColorStop(1,'rgba(255,255,255,0.0)'); ctx.fillStyle=g2; roundRect(ctx, x+2, y+2, w-4, h*0.45, r*0.6); ctx.fill(); if(this.hasPower){ const t=(performance.now()%1000)/1000; const pulse=0.6 + Math.sin(t*Math.PI*2)*0.4; ctx.save(); ctx.shadowColor='rgba(124,255,0,0.9)'; ctx.shadowBlur=14*pulse+8; ctx.strokeStyle=`rgba(124,255,0,${0.7 + 0.3*pulse})`; ctx.lineWidth=2; roundRect(ctx, x+1, y+1, w-2, h-2, r-1); ctx.stroke(); ctx.restore(); ctx.fillStyle='#0a2500'; ctx.font=`${Math.floor(h*0.7)}px system-ui, sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('⚡', x+w/2, y+h/2+1); } ctx.stroke(); ctx.restore(); } }
    function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
    exports.default = Brick;
  });

  // game/Paddle.js
  define('./game/Paddle.js', function(require, exports){
    const { clamp, lerp } = require('../engine/Utils.js');
    class Paddle{ constructor(game){ this.game=game; this.width=120; this.height=16; this.x=game.renderer.width/2; this.y=game.renderer.height-60; this.speed=980; this.targetXNorm=0.5; this.expandTimer=0; } reset(){ this.width=120; this.expandTimer=0; this.x=this.game.renderer.width/2; } update(dt){ const canvas=this.game.renderer; if(this.expandTimer>0){ this.expandTimer-=dt; this.width=lerp(this.width,180,0.2); } else { this.width=lerp(this.width,120,0.15); } const dir=this.game.input.getMovementDirection(); if(dir!==0){ this.x += dir * this.speed * dt * this.game.input.sensitivity; } else { const target = clamp(this.game.input.pointerX, 0, 1) * canvas.width; this.x = lerp(this.x, target, 0.22 * this.game.input.sensitivity); } const half=this.width/2; this.x = clamp(this.x, half+6, canvas.width - half - 6); } render(ctx){ ctx.save(); const half=this.width/2; const r=8; const x=this.x - half, y=this.y - this.height/2, w=this.width, h=this.height; const grad=ctx.createLinearGradient(x,y,x,y+h); grad.addColorStop(0,'#ffffffcc'); grad.addColorStop(1,'#ffffff22'); ctx.fillStyle=grad; ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1; roundRect(ctx,x,y,w,h,r); ctx.fill(); ctx.stroke(); ctx.restore(); } }
    function roundRect(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x+r, y); ctx.arcTo(x+w, y, x+w, y+h, r); ctx.arcTo(x+w, y+h, x, y+h, r); ctx.arcTo(x, y+h, x, y, r); ctx.arcTo(x, y, x+w, y, r); ctx.closePath(); }
    exports.default = Paddle;
  });

  // game/Ball.js
  define('./game/Ball.js', function(require, exports){
    const { clamp } = require('../engine/Utils.js');
    class Ball{ constructor(game,x,y){ this.game=game; this.x=x; this.y=y; this.radius=7; this.speed=520; this.vx=0; this.vy=0; this.stuckToPaddle=true; this.color='#b2f5ff'; this.slowTimer=0; } launch(){ const angle=(-Math.PI/3) + (Math.random()*(Math.PI/6)); const s=this.speed; this.vx=Math.cos(angle)*s; this.vy=Math.sin(angle)*s; this.stuckToPaddle=false; } update(dt){ const canvas=this.game.renderer; const paddle=this.game.paddle; if(this.stuckToPaddle){ this.x=paddle.x; this.y=paddle.y - paddle.height/2 - this.radius - 2; if(this.game.input.consumeLaunch()){ this.launch(); } return; } if(this.slowTimer>0){ this.slowTimer-=dt; } const slowFactor=this.slowTimer>0?0.7:1; this.x += this.vx*dt*slowFactor; this.y += this.vy*dt*slowFactor; if(this.x < this.radius){ this.x=this.radius; this.vx*=-1; this.game.audio.play('bounce'); } if(this.x > canvas.width - this.radius){ this.x=canvas.width - this.radius; this.vx*=-1; this.game.audio.play('bounce'); } if(this.y < this.radius + 4){ this.y=this.radius + 4; this.vy*=-1; this.game.audio.play('bounce'); } if(this.y > canvas.height + this.radius){ this.game.ballOut(this); } const half=paddle.width/2; if(this.y + this.radius >= paddle.y - paddle.height/2 && this.y - this.radius <= paddle.y + paddle.height/2 && this.x >= paddle.x - half && this.x <= paddle.x + half && this.vy > 0){ const hitPos=(this.x - paddle.x) / half; const angle=(-Math.PI/4) + (hitPos*(Math.PI/3)); const speed=Math.min(Math.hypot(this.vx,this.vy)*1.02, 1000); this.vx=Math.sin(angle)*speed; this.vy=-Math.abs(Math.cos(angle)*speed); this.y=paddle.y - paddle.height/2 - this.radius - 1; this.game.audio.play('bounce'); } } render(ctx){ ctx.save(); const g=ctx.createRadialGradient(this.x-2, this.y-4, 2, this.x, this.y, this.radius); g.addColorStop(0,'#ffffff'); g.addColorStop(1,this.color); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(this.x,this.y,this.radius,0,Math.PI*2); ctx.fill(); ctx.restore(); } }
    exports.default = Ball;
  });

  // game/Level.js
  define('./game/Level.js', function(require, exports){
    const { hsvToRgb, rgbToHex } = require('../engine/Utils.js');
    const Brick = require('./Brick.js').default;
    class Level{ constructor(index){ this.index=index; } build(canvasWidth){ const cols=Math.min(36, 20 + Math.floor(this.index/1)); const rows=Math.min(24, 14 + Math.floor(this.index/2)); const margin=20; const spacing=5; const brickWidth=Math.floor((canvasWidth - margin*2 - spacing*(cols-1))/cols); const brickHeight=18; const bricks=[]; const hueBase=(this.index*0.05)%1; for(let r=0;r<rows;r++){ for(let c=0;c<cols;c++){ const x=margin + c*(brickWidth + spacing); const y=80 + r*(brickHeight + spacing); const toughness=1 + Math.floor((this.index + Math.floor(r/2))/3); const colorRgb=hsvToRgb((hueBase + r*0.06 + c*0.02)%1, 0.75, 0.95); const color=rgbToHex(colorRgb); const brick=new Brick(x,y,brickWidth,brickHeight,toughness,color); const p=Math.min(0.22, 0.12 + this.index*0.01); brick.hasPower = Math.random() < p; bricks.push(brick); } } return bricks; } }
    exports.default = Level;
  });

  // game/PowerUp.js
  define('./game/PowerUp.js', function(require, exports){
    const { randRange } = require('../engine/Utils.js');
    class PowerUp{ constructor(type,x,y){ this.type=type; this.x=x; this.y=y; this.vy=140; this.size=18; this.col={ expand:'#a0ff8a', multiball:'#ffd074', slow:'#8ac7ff', shield:'#ffa0e5', laser:'#ff88ff', bomb:'#ffaf6c', pierce:'#9cf0ff', x2:'#b0ff6c' }[type]||'white'; this.symbol={ expand:'+', multiball:'×', slow:'⏵', shield:'🛡️', laser:'⚡', bomb:'💣', pierce:'⟂', x2:'2x' }[type]||'?'; this.dead=false; } apply(game){ switch(this.type){ case 'expand': game.paddle.expandTimer=Math.max(game.paddle.expandTimer, 10); break; case 'multiball': game.spawnExtraBalls(2); game.unlock('multiball'); break; case 'slow': game.slowBalls(8); break; case 'shield': game.activateShield(12); break; case 'laser': game.activateLaser(10); break; case 'bomb': game.grantBomb(1); break; case 'pierce': game.activatePierce(12); break; case 'x2': game.activateMultiplier(20,2); break; } game.audio.play('power'); game.toast(`${this.type.toUpperCase()}!`,'positive'); } update(dt){ this.y += this.vy*dt; } render(ctx){ const s=this.size; ctx.save(); ctx.fillStyle=this.col; ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(this.x,this.y,s/2,0,Math.PI*2); ctx.fill(); ctx.stroke(); ctx.fillStyle='#06232f'; ctx.font=`${Math.floor(s*0.7)}px system-ui, sans-serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(this.symbol, this.x, this.y + 1); ctx.restore(); } }
    function randomPowerType(){ const list=['expand','multiball','slow','shield','laser','bomb','pierce','x2']; return list[Math.floor(randRange(0, list.length))]; }
    exports.default = PowerUp; exports.randomPowerType = randomPowerType;
  });

  // game/Game.js
  define('./game/Game.js', function(require, exports){
    const { nowMs, clamp, randRange } = require('../engine/Utils.js');
    const Paddle = require('./Paddle.js').default;
    const Ball = require('./Ball.js').default;
    const Level = require('./Level.js').default;
    const PowerUpModule = require('./PowerUp.js');
    const PowerUp = PowerUpModule.default; const randomPowerType = PowerUpModule.randomPowerType;
    class Game{
      constructor({ renderer, input, audio, particles, storage }){
        this.renderer=renderer; this.input=input; this.audio=audio; this.particles=particles; this.storage=storage;
        this.state='menu'; this.levelIndex=1; this.score=0; this.best=storage.get('best',0); this.lives=3; this.multiplier=1;
        this.paddle=new Paddle(this); this.balls=[]; this.bricks=[]; this.powerups=[]; this.shieldTimer=0;
        this.achievements=new Set(storage.get('achievements', []));
        this._lastTime=nowMs(); this._loop=this._loop.bind(this);
        requestAnimationFrame(this._loop); this._broadcastState();
      }
      _loop(){ const now=nowMs(); const dt=Math.min((now - this._lastTime)/1000, 1/20); this._lastTime=now; if(this.state==='playing'){ this.update(dt); this.render(); } else { this.render(true); } requestAnimationFrame(this._loop); }
      start(){ this.state='playing'; this.levelIndex=1; this.score=0; this.lives=3; this.multiplier=1; this.paddle.reset(); this.balls=[]; this.powerups=[]; this.bricks=[]; this.spawnBall(); this.loadLevel(this.levelIndex); this._broadcastState(); }
      loadLevel(i){ const lvl=new Level(i); this.bricks=lvl.build(this.renderer.width); this.audio.play('level'); window.dispatchEvent(new CustomEvent('game:level', { detail:i })); }
      spawnBall(){ const ball=new Ball(this, this.paddle.x, this.paddle.y - 30); this.balls.push(ball); }
      spawnExtraBalls(count){ const main=this.balls[0]; for(let i=0;i<count;i++){ const b=new Ball(this, main.x, main.y); b.stuckToPaddle=false; const angle=randRange(-Math.PI*0.8, -Math.PI*0.2); const s=main.speed*randRange(0.9,1.1); b.vx=Math.cos(angle)*s; b.vy=Math.sin(angle)*s; this.balls.push(b); } }
      slowBalls(duration){ for(const b of this.balls){ b.slowTimer=Math.max(b.slowTimer, duration); } }
      activateShield(duration){ this.shieldTimer=Math.max(this.shieldTimer, duration); }
      update(dt){ if(this.shieldTimer>0) this.shieldTimer-=dt; const before=this.laserTimer||0; if(this.laserTimer>0) this.laserTimer-=dt; if((before<=0 && this.laserTimer>0) || (before>0 && this.laserTimer<=0)){ window.dispatchEvent(new CustomEvent('game:laser', { detail:this.laserTimer })); } this.paddle.update(dt); this.particles.update(dt); for(const b of this.balls) b.update(dt); this.handleCollisions(); for(const p of this.powerups){ p.update(dt); } const paddle=this.paddle; this.powerups=this.powerups.filter(p=>{ if(p.y > this.renderer.height + 20) return false; const hit=Math.abs(p.y - paddle.y) < 18 && Math.abs(p.x - paddle.x) < (paddle.width/2 + 12); if(hit){ p.apply(this); return false; } return true; }); if(this.bricks.every(b=>b.destroyed)){ this.levelIndex+=1; this.loadLevel(this.levelIndex); for(const b of this.balls){ b.speed *= 1.04; } this.toast(`Level ${this.levelIndex}`,'info'); } }
      handleCollisions(){ for(const ball of this.balls){ if(ball.stuckToPaddle) continue; for(const brick of this.bricks){ if(brick.destroyed) continue; if(circleRectIntersect(ball.x, ball.y, ball.radius, brick)){ const overlapX = (ball.x < brick.x + brick.w/2) ? (ball.x + ball.radius - brick.x) : (brick.x + brick.w - (ball.x - ball.radius)); const overlapY = (ball.y < brick.y + brick.h/2) ? (ball.y + ball.radius - brick.y) : (brick.y + brick.h - (ball.y - ball.radius)); if(overlapX < overlapY){ ball.vx *= -1; } else { ball.vy *= -1; } brick.hit(); this.addScore(50 * this.multiplier); this.particles.emit(ball.x, ball.y, brick.color, 12); this.audio.play('brick'); if(brick.destroyed){ this.renderer.shake(0.12, 6); if(brick.hasPower || Math.random() < 0.12){ const type=randomPowerType(); this.powerups.push(new PowerUp(type, brick.x + brick.w/2, brick.y + brick.h/2)); } if(!this.achievements.has('first_brick')) this.unlock('first_brick'); } } } } }
      render(ambientOnly=false){ const ctx=this.renderer.ctx; const canvas=this.renderer; this.renderer.beginFrame(); ctx.save(); const pad=10; ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.strokeRect(pad, pad, canvas.width - pad*2, canvas.height - pad*2); ctx.restore(); if(this.shieldTimer>0){ ctx.save(); ctx.strokeStyle='rgba(255,120,220,0.6)'; ctx.lineWidth=3; const y=this.paddle.y + 12; ctx.beginPath(); ctx.moveTo(20,y); ctx.lineTo(canvas.width-20, y); ctx.stroke(); ctx.restore(); }
        for(const b of this.bricks) b.render(ctx);
        for(const p of this.powerups) p.render(ctx);
        this.paddle.render(ctx);
        for(const b of this.balls) b.render(ctx);
        this.particles.render(ctx);
        this.renderer.endFrame(); }
      addScore(amount){ this.score += amount; if(this.score > this.best){ this.best=this.score; this.storage.set('best', this.best); } window.dispatchEvent(new CustomEvent('game:score', { detail:{ score:this.score, best:this.best } })); }
      ballOut(ball){ if(this.shieldTimer>0){ this.shieldTimer=0; ball.vy*=-1; ball.y=this.paddle.y - 30; this.toast('Shield saved you!','info'); return; } const idx=this.balls.indexOf(ball); if(idx>=0) this.balls.splice(idx,1); if(this.balls.length===0){ this.lives -= 1; window.dispatchEvent(new CustomEvent('game:lives', { detail:this.lives })); this.audio.play('lose'); if(this.lives<=0){ this.gameOver(); return; } this.spawnBall(); } }
      gameOver(){ this.state='menu'; this.toast(`Game Over — Score ${this.score}`,'info'); this._broadcastState(); }
      togglePause(){ if(this.state!=='playing'){ return; } this.state='paused'; this._broadcastState(); }
      resume(){ if(this.state!=='paused') return; this.state='playing'; this._broadcastState(); }
      _broadcastState(){ window.dispatchEvent(new CustomEvent('game:state', { detail:this.state })); window.dispatchEvent(new CustomEvent('game:level', { detail:this.levelIndex })); window.dispatchEvent(new CustomEvent('game:lives', { detail:this.lives })); window.dispatchEvent(new CustomEvent('game:score', { detail:{ score:this.score, best:this.best } })); }
      toast(message,type='info'){ window.dispatchEvent(new CustomEvent('game:toast', { detail:{ message, type } })); }
      unlock(key){ const map={ 'first_brick':'First Blood — Destroy your first brick', 'multiball':'Chaos Mode — Activate Multiball', 'level_5':'On a Roll — Reach Level 5', 'score_10000':'Stacked — Score 10,000 points' }; if(this.achievements.has(key)) return; this.achievements.add(key); this.storage.set('achievements', Array.from(this.achievements)); this.audio.play('achievement'); this.toast(map[key]||key,'positive'); window.dispatchEvent(new CustomEvent('game:achievement', { detail:Array.from(this.achievements) })); }
    }
    function circleRectIntersect(cx,cy,cr,rect){ const rx=rect.x, ry=rect.y, rw=rect.w, rh=rect.h; const closestX = Math.max(rx, Math.min(cx, rx+rw)); const closestY = Math.max(ry, Math.min(cy, ry+rh)); const dx=cx-closestX; const dy=cy-closestY; return (dx*dx + dy*dy) < (cr*cr); }
    exports.default = Game;
  });

  // ui/HUD.js
  define('./ui/HUD.js', function(require, exports){
    class HUD{ constructor(game){ this.game=game; this.scoreEl=document.getElementById('hud-score'); this.bestEl=document.getElementById('hud-best'); this.levelEl=document.getElementById('hud-level'); this.livesEl=document.getElementById('hud-lives'); this.multEl=document.getElementById('hud-multiplier'); this.toastContainer=document.getElementById('toast-container'); this._bind(); }
      _bind(){ window.addEventListener('game:score',(e)=>{ const {score,best}=e.detail; this.scoreEl.textContent=score; this.bestEl.textContent=best; if(score>=10000) this.game.unlock('score_10000'); }); window.addEventListener('game:level',(e)=>{ const lvl=e.detail; this.levelEl.textContent=lvl; if(lvl>=5) this.game.unlock('level_5'); }); window.addEventListener('game:lives',(e)=>{ this.livesEl.textContent=e.detail; }); window.addEventListener('game:toast',(e)=>{ const {message,type}=e.detail; const item=document.createElement('div'); item.className=`toast ${type}`; item.textContent=message; this.toastContainer.appendChild(item); setTimeout(()=>item.remove(), 2300); }); }
    }
    exports.default = HUD;
  });

  // ui/Menu.js
  define('./ui/Menu.js', function(require, exports){
    class Menu{ constructor(game, storage){ this.game=game; this.storage=storage; this.main=document.getElementById('menu-main'); this.pause=document.getElementById('menu-pause'); this.settings=document.getElementById('menu-settings'); this.achievements=document.getElementById('menu-achievements'); this.achList=document.getElementById('achievements-list'); this.toggleSfx=document.getElementById('toggle-sfx'); this.toggleMusic=document.getElementById('toggle-music'); this.toggleParticles=document.getElementById('toggle-particles'); this.selectTheme=document.getElementById('select-theme'); this.rangeSensitivity=document.getElementById('range-sensitivity'); const sfx=storage.get('sfx',true); const particles=storage.get('particles',true); const music=storage.get('music',true); const theme=storage.get('theme','neon'); const sensitivity=storage.get('sensitivity',1); document.body.setAttribute('data-theme', theme); game.audio.setEnabled(sfx); game.particles.enabled=particles; game.audio.setMusicEnabled(music); game.input.sensitivity=sensitivity; this.toggleSfx.checked=sfx; this.toggleParticles.checked=particles; this.toggleMusic.checked=music; this.selectTheme.value=theme; this.rangeSensitivity.value=sensitivity; this._bind(); this._renderAchievements(); }
      _bind(){ const playBtn=document.getElementById('btn-play'); playBtn?.addEventListener('click',()=>{ this.main.classList.add('hidden'); this.game.start(); const canvas=document.getElementById('game-canvas'); canvas?.focus({ preventScroll:true }); }); document.getElementById('btn-settings')?.addEventListener('click',()=>this._open(this.settings)); document.querySelector('[data-open-settings]')?.addEventListener('click',()=>this._open(this.settings)); document.querySelector('[data-close-settings]')?.addEventListener('click',()=>this._close(this.settings)); document.getElementById('btn-achievements')?.addEventListener('click',()=>this._open(this.achievements)); document.querySelector('[data-close-achievements]')?.addEventListener('click',()=>this._close(this.achievements)); document.getElementById('btn-resume')?.addEventListener('click',()=>{ this._close(this.pause); this.game.resume(); }); document.getElementById('btn-restart')?.addEventListener('click',()=>{ this._close(this.pause); this.game.start(); }); document.getElementById('btn-exit')?.addEventListener('click',()=>{ this._close(this.pause); this.main.classList.remove('hidden'); }); window.addEventListener('game:state',(e)=>{ const s=e.detail; if(s==='paused') this._open(this.pause); else this._close(this.pause); if(s==='menu') this.main.classList.remove('hidden'); }); this.toggleSfx.addEventListener('change',()=>{ this.game.audio.setEnabled(this.toggleSfx.checked); this.storage.set('sfx', this.toggleSfx.checked); }); this.toggleParticles.addEventListener('change',()=>{ this.game.particles.enabled=this.toggleParticles.checked; this.storage.set('particles', this.toggleParticles.checked); }); this.toggleMusic?.addEventListener('change',()=>{ this.game.audio.setMusicEnabled(this.toggleMusic.checked); this.storage.set('music', this.toggleMusic.checked); }); this.selectTheme.addEventListener('change',()=>{ document.body.setAttribute('data-theme', this.selectTheme.value); this.storage.set('theme', this.selectTheme.value); }); this.rangeSensitivity.addEventListener('input',()=>{ this.game.input.sensitivity=parseFloat(this.rangeSensitivity.value); this.storage.set('sensitivity', this.rangeSensitivity.value); }); window.addEventListener('keydown',(e)=>{ if((e.key==='p'||e.key==='P') && this.game.state==='playing'){ this.game.togglePause(); } }); window.addEventListener('game:achievement',()=> this._renderAchievements()); }
      _open(el){ el.classList.remove('hidden'); }
      _close(el){ el.classList.add('hidden'); }
      _renderAchievements(){ const known=[ ['first_brick','First Blood — Destroy your first brick'], ['multiball','Chaos Mode — Activate Multiball'], ['level_5','On a Roll — Reach Level 5'], ['score_10000','Stacked — Score 10,000 points'] ]; const unlocked=new Set(this.game.achievements); this.achList.innerHTML=''; for(const [key,label] of known){ const item=document.createElement('div'); item.className='achievement glass ' + (unlocked.has(key)?'unlocked':''); item.textContent=label; this.achList.appendChild(item); } }
    }
    exports.default = Menu;
  });

  // game/Laser.js
  define('./game/Laser.js', function(require, exports){
    class LaserBolt{ constructor(x,y){ this.x=x; this.y=y; this.vy=-900; this.width=3; this.height=16; this.dead=false; } update(dt){ this.y += this.vy*dt; if(this.y < -20) this.dead=true; } render(ctx){ ctx.save(); ctx.fillStyle='#ff88ff'; ctx.shadowBlur=8; ctx.shadowColor='#ff88ff'; ctx.fillRect(this.x - this.width/2, this.y - this.height, this.width, this.height); ctx.restore(); } }
    exports.LaserBolt = LaserBolt;
  });

  // game/Explosion.js
  define('./game/Explosion.js', function(require, exports){
    class Explosion{ constructor(x,y,radius=48){ this.x=x; this.y=y; this.radius=radius; this.age=0; this.life=0.35; this.done=false; } update(dt, game){ this.age+=dt; if(this.age>this.life) this.done=true; if(this.age - dt <= 0.05){ const r2=this.radius*this.radius; for(const b of game.bricks){ if(b.destroyed) continue; const cx=b.x + b.w/2, cy=b.y + b.h/2; const dx=cx - this.x, dy=cy - this.y; if(dx*dx + dy*dy <= r2){ b.hp=0; b.destroyed=true; game.addScore(50); } } game.renderer.shake(0.25,10); game.audio.play('brick',{ pitch:0.6 }); } } render(ctx){ const t=Math.min(this.age/this.life,1); const r=this.radius*(0.6+0.6*t); const g=ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,r); g.addColorStop(0,`rgba(255,200,120,${1-t})`); g.addColorStop(1,'rgba(255,80,100,0)'); ctx.save(); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(this.x,this.y,r,0,Math.PI*2); ctx.fill(); ctx.restore(); } }
    exports.default = Explosion;
  });

  // game/Enhancer.js
  define('./game/Enhancer.js', function(require, exports){
    const Game = require('./Game.js').default;
    const { LaserBolt } = require('./Laser.js');
    const Explosion = require('./Explosion.js').default;
    function enhanceGamePrototype(){
      if(Game.prototype._enhanced) return; Game.prototype._enhanced = true;
      Game.prototype.laserTimer = 0; Game.prototype.pierceTimer = 0; Game.prototype._multTimer = 0; Game.prototype.bombs = 0; Game.prototype.laserBolts = []; Game.prototype.explosions = [];
      const origUpdate = Game.prototype.update;
      Game.prototype.update = function(dt){
        if(this.shieldTimer>0) this.shieldTimer-=dt; if(this.laserTimer>0) this.laserTimer-=dt; if(this.pierceTimer>0) this.pierceTimer-=dt; if(this._multTimer>0){ this._multTimer-=dt; if(this._multTimer<=0) this.multiplier=1; }
        this.paddle.update(dt); this.particles.update(dt); for(const b of this.balls) b.update(dt); this.handleCollisions();
        if(this.input.consumeFire()) this.tryFireLaser(); if(this.input.consumeBomb()) this.detonateBomb();
        for(const p of this.powerups){ p.update(dt); }
        const paddle=this.paddle; this.powerups = this.powerups.filter(p=>{ if(p.y > this.renderer.height + 20) return false; const hit=Math.abs(p.y - paddle.y) < 18 && Math.abs(p.x - paddle.x) < (paddle.width/2 + 12); if(hit){ p.apply(this); return false; } return true; });
        for(const l of this.laserBolts) l.update(dt); this.laserBolts=this.laserBolts.filter(l=>!l.dead);
        for(const ex of this.explosions) ex.update(dt, this); this.explosions=this.explosions.filter(ex=>!ex.done);
        if(this.bricks.every(b=>b.destroyed)){ this.levelIndex+=1; this.loadLevel(this.levelIndex); for(const b of this.balls){ b.speed *= 1.04; } this.toast(`Level ${this.levelIndex}`,'info'); }
      };
      const origHandle = Game.prototype.handleCollisions;
      Game.prototype.handleCollisions = function(){
        origHandle.call(this);
        for(const bolt of this.laserBolts){ for(const brick of this.bricks){ if(brick.destroyed) continue; if(bolt.x>=brick.x && bolt.x<=brick.x+brick.w && (bolt.y - bolt.height/2)>=brick.y && (bolt.y - bolt.height/2)<=brick.y+brick.h){ brick.hp=0; brick.destroyed=true; this.addScore(60); this.particles.emit(bolt.x, bolt.y, brick.color, 10); bolt.dead=true; break; } } }
      };
      const origRender = Game.prototype.render;
      Game.prototype.render = function(ambientOnly=false){
        const ctx=this.renderer.ctx; const canvas=this.renderer; this.renderer.beginFrame();
        ctx.save(); const pad=10; ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.strokeRect(pad,pad,canvas.width-pad*2,canvas.height-pad*2); ctx.restore(); if(this.shieldTimer>0){ ctx.save(); ctx.strokeStyle='rgba(255,120,220,0.6)'; ctx.lineWidth=3; const y=this.paddle.y + 12; ctx.beginPath(); ctx.moveTo(20,y); ctx.lineTo(canvas.width-20,y); ctx.stroke(); ctx.restore(); }
        for(const b of this.bricks) b.render(ctx); for(const p of this.powerups) p.render(ctx); this.paddle.render(ctx); for(const b of this.balls) b.render(ctx); for(const l of this.laserBolts) l.render(ctx); for(const ex of this.explosions) ex.render(ctx); this.particles.render(ctx); this.renderer.endFrame();
      };
      Game.prototype.activateLaser = function(duration){ this.laserTimer=Math.max(this.laserTimer, duration); };
      Game.prototype.activatePierce = function(duration){ this.pierceTimer=Math.max(this.pierceTimer, duration); };
      Game.prototype.activateMultiplier = function(duration, amount){ this._multTimer=Math.max(this._multTimer||0, duration); this.multiplier=amount; };
      Game.prototype.grantBomb = function(n){ this.bombs=(this.bombs||0)+(n||1); this.toast(`Bombs: ${this.bombs}`,'info'); };
      Game.prototype.tryFireLaser = function(){ if(this.laserTimer<=0) return; const left=this.paddle.x - this.paddle.width/2 + 10; const right=this.paddle.x + this.paddle.width/2 - 10; const y=this.paddle.y - this.paddle.height/2 - 6; this.laserBolts.push(new LaserBolt(left,y)); this.laserBolts.push(new LaserBolt(right,y)); this.audio.play('power',{ pitch:1.2 }); };
      Game.prototype.detonateBomb = function(){ if(this.bombs<=0) return; this.bombs -= 1; const ex=new Explosion(this.paddle.x, this.paddle.y - 90, 86); this.explosions.push(ex); };
    }
    function enhanceGame(game){ enhanceGamePrototype(); return game; }
    exports.enhanceGame = enhanceGame;
  });

  // main.js
  define('./main.js', function(require, exports){
    const Renderer = require('./engine/Renderer.js').default;
    const Input = require('./engine/Input.js').default;
    const AudioManager = require('./engine/Audio.js').default;
    const Particles = require('./engine/Particles.js').default;
    const Storage = require('./engine/Storage.js').default;
    const Game = require('./game/Game.js').default;
    const enhanceGame = require('./game/Enhancer.js')?.enhanceGame;
    const HUD = require('./ui/HUD.js').default;
    const Menu = require('./ui/Menu.js').default;

    const canvas=document.getElementById('game-canvas');
    const renderer=new Renderer(canvas);
    const input=new Input(canvas);
    const audio=new AudioManager();
    const particles=new (Particles)(renderer);
    const storage=new Storage('breakout2025');

    const game=new Game({ renderer, input, audio, particles, storage });
    if(enhanceGame) enhanceGame(game);
    const hud=new HUD(game);
    const menu=new Menu(game, storage);

    function handleResize(){ renderer.resizeToContainer(); }
    window.addEventListener('resize', handleResize); handleResize();

    document.getElementById('btn-pause').addEventListener('click', ()=>game.togglePause());

    canvas.tabIndex=0; canvas.focus({ preventScroll:true });

    window.addEventListener('keydown',(e)=>{ if((e.key===' '||e.key==='Enter') && game.state!=='playing'){ const main=document.getElementById('menu-main'); if(main) main.classList.add('hidden'); game.start(); }});
    canvas.addEventListener('pointerdown', ()=>{ if(game.state!=='playing'){ const main=document.getElementById('menu-main'); if(main) main.classList.add('hidden'); game.start(); }});
  });

  // Start app
  requireFrom('(entry)')('./main.js');
})();


