import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const startScreen = document.getElementById('start-screen')!;
const startBtn = document.getElementById('start-btn')!;

const game = new Game(canvas);

startBtn.addEventListener('click', () => {
  startScreen.classList.add('hidden');
  game.start();
});
