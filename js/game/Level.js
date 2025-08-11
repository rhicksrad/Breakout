import { hsvToRgb, rgbToHex } from '../engine/Utils.js';
import Brick from './Brick.js';

export default class Level {
  constructor(index){
    this.index = index;
  }

  build(canvasWidth){
    // Quadruple density: double cols and rows caps
    const cols = Math.min(36, 20 + Math.floor(this.index/1));
    const rows = Math.min(24, 14 + Math.floor(this.index/2));
    const margin = 20;
    const spacing = 5;
    const brickWidth = Math.floor((canvasWidth - margin*2 - spacing*(cols-1)) / cols);
    const brickHeight = 18;
    const bricks = [];

    const hueBase = (this.index * 0.05) % 1;
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        const x = margin + c*(brickWidth + spacing);
        const y = 80 + r*(brickHeight + spacing);
        const toughness = 1 + Math.floor((this.index + Math.floor(r/2)) / 3);
        const colorRgb = hsvToRgb((hueBase + r*0.06 + c*0.02) % 1, 0.75, 0.95);
        const color = rgbToHex(colorRgb);
        const brick = new Brick(x, y, brickWidth, brickHeight, toughness, color);
        const p = Math.min(0.22, 0.12 + this.index * 0.01);
        brick.hasPower = Math.random() < p;
        bricks.push(brick);
      }
    }
    return bricks;
  }
}


