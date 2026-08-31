# Patriot Defense

A browser-based third-person missile defense game. Command a Patriot battery and intercept incoming ballistic missiles before they destroy the city.

## Play

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (default `http://localhost:5173`).

## Controls

- **Mouse** — aim the Patriot launcher
- **Left click** — fire an interceptor (limited supply)
- **R** — restart after game over

## Gameplay

- Ballistic missiles arc toward city buildings in waves.
- Each successful intercept awards points; impacts damage city health.
- Ammunition is limited — resupply partially between waves.
- Survive as many waves as you can.

## Tech Stack

- [Vite](https://vitejs.dev/) + TypeScript
- [Three.js](https://threejs.org/) for 3D rendering

## Build

```bash
npm run build
npm run preview
```
