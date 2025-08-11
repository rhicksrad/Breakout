import Renderer from './engine/Renderer.js';
import Input from './engine/Input.js';
import AudioManager from './engine/Audio.js';
import Particles from './engine/Particles.js';
import Storage from './engine/Storage.js';
import Game from './game/Game.js';
import HUD from './ui/HUD.js';
import Menu from './ui/Menu.js';

const canvas = document.getElementById('game-canvas');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const audio = new AudioManager();
const particles = new Particles(renderer);
const storage = new Storage('breakout2025');

const game = new Game({ renderer, input, audio, particles, storage });
const hud = new HUD(game);
const menu = new Menu(game, storage);

function handleResize(){
  renderer.resizeToContainer();
}
window.addEventListener('resize', handleResize);
handleResize();

// Forward menu buttons to game
document.getElementById('btn-pause').addEventListener('click', () => game.togglePause());

// Auto-focus canvas for keyboard
canvas.tabIndex = 0;
canvas.focus({ preventScroll: true });

// Start on first play
// Menu module wires Play button.

// Fallback starters in case a binding fails
window.addEventListener('keydown', (e)=>{
  if((e.key === ' ' || e.key === 'Enter') && game.state !== 'playing'){
    const main = document.getElementById('menu-main');
    if(main) main.classList.add('hidden');
    game.start();
  }
});
canvas.addEventListener('pointerdown', ()=>{
  if(game.state !== 'playing'){
    const main = document.getElementById('menu-main');
    if(main) main.classList.add('hidden');
    game.start();
  }
});


