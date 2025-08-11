export default class Storage {
  constructor(namespace){
    this.ns = namespace;
  }
  _key(k){ return `${this.ns}:${k}`; }
  get(k, fallback){
    try{
      const v = localStorage.getItem(this._key(k));
      return v == null ? fallback : JSON.parse(v);
    }catch(_){ return fallback; }
  }
  set(k, v){
    try{ localStorage.setItem(this._key(k), JSON.stringify(v)); }catch(_){ /* ignore */ }
  }
}


