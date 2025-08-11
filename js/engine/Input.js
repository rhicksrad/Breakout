export default class Input {
  constructor(canvas){
    this.canvas = canvas;
    this.keys = new Set();
    this.pointerX = 0;
    this.isPointerDown = false;
    this.launchRequested = false;
    this.sensitivity = 1;
    this.fireRequested = false;
    this.bombRequested = false;
    this._bind();
  }

  _bind(){
    window.addEventListener('keydown', (e)=>{
      this.keys.add(e.key.toLowerCase());
      if(e.key === ' ') this.launchRequested = true;
      if(e.key === 'k' || e.key === 'K') this.fireRequested = true; // laser
      if(e.key === 'l' || e.key === 'L') this.bombRequested = true; // bomb
      if(['ArrowLeft','ArrowRight',' ','a','d','A','D','p','P'].includes(e.key)){
        e.preventDefault();
      }
    }, { passive: false });
    window.addEventListener('keyup', (e)=>{
      this.keys.delete(e.key.toLowerCase());
    });

    const updatePointer = (e)=>{
      const rect = this.canvas.getBoundingClientRect();
      if(e.touches && e.touches[0]){
        this.pointerX = (e.touches[0].clientX - rect.left) / rect.width;
      } else {
        this.pointerX = (e.clientX - rect.left) / rect.width;
      }
    };

    this.canvas.addEventListener('pointerdown', (e)=>{ this.isPointerDown = true; updatePointer(e); });
    this.canvas.addEventListener('pointermove', updatePointer);
    window.addEventListener('pointerup', ()=>{ this.isPointerDown = false; });

    // Touch events for iOS Safari
    this.canvas.addEventListener('touchstart', (e)=>{ this.isPointerDown = true; updatePointer(e); }, { passive: true });
    this.canvas.addEventListener('touchmove', updatePointer, { passive: true });
    window.addEventListener('touchend', ()=>{ this.isPointerDown = false; }, { passive: true });
  }

  getMovementDirection(){
    let dir = 0;
    if(this.keys.has('arrowleft') || this.keys.has('a')) dir -= 1;
    if(this.keys.has('arrowright') || this.keys.has('d')) dir += 1;
    return dir;
  }

  consumeLaunch(){
    const requested = this.launchRequested || this.isPointerDown;
    this.launchRequested = false;
    return requested;
  }

  consumeFire(){ const r = this.fireRequested; this.fireRequested = false; return r; }
  consumeBomb(){ const r = this.bombRequested; this.bombRequested = false; return r; }
}


