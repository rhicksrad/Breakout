export default class AudioManager {
  constructor(){
    this.ctx = null;
    this.enabled = true;
    this._unlocked = false;
    this._bgm = null;
    this.musicEnabled = true;
    this._scheduler = null;
    this._nextNoteTime = 0;
    this._beatIndex = 0;
    this._tempo = 140; // BPM
    this._bindUnlock();
  }

  _bindUnlock(){
    const unlock = () => {
      if(this._unlocked) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        // Create and resume on first gesture
        const buffer = this.ctx.createBuffer(1, 1, 22050);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer; source.connect(this.ctx.destination); source.start(0);
        this.ctx.resume();
        this._unlocked = true;
      } catch (e) { /* noop */ }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  setEnabled(v){ this.enabled = !!v; }

  setMusicEnabled(v){
    this.musicEnabled = !!v;
    if(!this.musicEnabled) this.stopMusic(); else this.startMusic();
  }

  play(name, { pitch = 1, volume = 0.2 } = {}){
    if(!this.enabled) return;
    if(!this.ctx) return;
    switch(name){
      case 'bounce': this._beep(400*pitch, 0.03, volume*0.5, 'sine'); break;
      case 'brick': this._beep(240*pitch, 0.05, volume*0.7, 'square'); break;
      case 'power': this._beep(520*pitch, 0.12, volume*0.6, 'triangle'); break;
      case 'lose': this._beep(120*pitch, 0.25, volume*0.6, 'sawtooth'); break;
      case 'level': this._melody([440,660,880], 0.06, volume*0.5); break;
      case 'achievement': this._melody([660,880,1320], 0.08, volume*0.5); break;
    }
  }

  _beep(freq, dur, volume, type='sine'){
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g); g.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(volume, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.start(now);
    o.stop(now + dur + 0.02);
  }

  _melody(freqs, stepDur, volume){
    let t = this.ctx.currentTime;
    freqs.forEach((f,i)=>{
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      o.connect(g); g.connect(this.ctx.destination);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(volume, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + stepDur);
      o.start(t); o.stop(t + stepDur + 0.02);
      t += stepDur * 0.9;
    });
  }

  // Extreme sequenced music (looping)
  startMusic(){
    if(!this.musicEnabled) return; if(!this.ctx) return; if(this._bgm) return;
    const ctx = this.ctx;
    const master = ctx.createGain(); master.gain.value = 0.18; master.connect(ctx.destination);
    this._bgm = { master };
    this._nextNoteTime = ctx.currentTime + 0.05;
    this._beatIndex = 0; // 16th notes index
    const lookAhead = 0.1; // seconds
    const intervalMs = 25;

    const schedule = () => {
      if(!this._bgm) return;
      while(this._nextNoteTime < ctx.currentTime + lookAhead){
        this._scheduleBeat(this._beatIndex, this._nextNoteTime, master);
        const secondsPerBeat = 60.0 / this._tempo; // quarter note
        this._nextNoteTime += secondsPerBeat / 4; // 16th note
        this._beatIndex = (this._beatIndex + 1) % 16;
      }
    };
    this._scheduler = setInterval(schedule, intervalMs);
  }
  stopMusic(){ if(!this._bgm) return; if(this._scheduler) clearInterval(this._scheduler); this._scheduler = null; try{ this._bgm.master.disconnect(); }catch(_){ } this._bgm = null; }

  _scheduleBeat(step, time, master){
    const ctx = this.ctx;
    // Kick on 1 & 3
    if(step === 0 || step === 8){
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = ctx.createGain(); o.connect(g); g.connect(master);
      o.frequency.setValueAtTime(120, time);
      o.frequency.exponentialRampToValueAtTime(40, time + 0.15);
      g.gain.setValueAtTime(0.001, time);
      g.gain.exponentialRampToValueAtTime(0.9, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      o.start(time); o.stop(time + 0.2);
    }
    // Snare on 2 & 4
    if(step === 4 || step === 12){
      const noise = this._createNoiseBuffer();
      const src = ctx.createBufferSource(); src.buffer = noise;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = 0.0;
      src.connect(bp); bp.connect(g); g.connect(master);
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(0.5, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
      src.start(time); src.stop(time + 0.15);
    }
    // Hi-hat 8th notes and off-beat accents
    if(step % 2 === 0){
      const noise = this._createNoiseBuffer();
      const src = ctx.createBufferSource(); src.buffer = noise;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000; hp.Q.value = 0.7;
      const g = ctx.createGain();
      const vol = (step % 4 === 2) ? 0.25 : 0.18;
      src.connect(hp); hp.connect(g); g.connect(master);
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(vol, time + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
      src.start(time); src.stop(time + 0.06);
    }
    // Bassline pattern
    const bassPattern = [0,0,7,0,  -3,-3,5,-3,  0,0,7,0,  -5,-5,5,-5]; // semitone offsets
    const base = 55; // A1
    const note = bassPattern[step];
    if(note !== undefined){
      const freq = base * Math.pow(2, note/12);
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const g = ctx.createGain(); o.connect(g); g.connect(master);
      o.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.22, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
      o.start(time); o.stop(time + 0.25);
    }
  }

  _createNoiseBuffer(){
    const buffer = this.ctx.createBuffer(1, 4410, 44100);
    const data = buffer.getChannelData(0);
    for(let i=0;i<data.length;i++){ data[i] = Math.random()*2-1; }
    return buffer;
  }
}


