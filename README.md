# Vision Edit Pro — Landscape Design Visualizer

A mobile app for landscapers. Photograph a client's property, then mock up proposed changes right on the photo: new trees and shrubs, fresh lawn, paver patios, mulch beds, and house features. You can also remove what's going away. Show the client a before/after slider on the spot, then text or email them the image.

Runs as an installable Progressive Web App (PWA) on iPhone and Android. There's no app store, account or server. Designs are saved on the device and work offline.

## What it does

| Tab | Purpose |
| --- | --- |
| **Plants** | 22 placeable objects in 5 groups: trees (shade, spruce, arborvitae, Japanese maple, flowering, palm), shrubs (boxwood, hedge, hydrangea, azalea/rose), perennials (ornamental grass, lavender, hosta, flower bed), hardscape (boulder, planter, path light, fire pit) and house features (front door, shutters, window box, wall lantern). Each item is procedurally painted, so **New look** gives every shrub a unique shape. Many have color options. |
| **Surfaces** | Outline an area and fill it with lawn, mulch (brown/black/red), river rock, pea gravel, brick or patio pavers, flagstone, concrete, a wood deck, or siding/brick/stone veneer for walls. Ground materials shrink toward the horizon in true perspective. They also keep the photo's existing shadows, so a new lawn still shows the house's shadow. |
| **Remove** | Paint over an existing feature (an old shrub, a dead patch) and it is filled in from the surrounding texture, with color matching. **Try another fill** cycles through alternative source areas. |
| **Perspective** | Drag the horizon line to eye level. Guide lines help you line it up with paths and edging. Surfaces use it for foreshortening, and plants scale with distance as you drag them. |
| **Layers** | Reorder, hide, or delete changes. |

Also:
- **Compare**: a full-screen before/after wipe for presenting to the client.
- **Share**: exports a before/after image with your company name and the client's name, or the proposed design alone. It uses the phone's share sheet (text, email, AirDrop).
- **Create alternative design** (on the home screen): copies a design so you can show a client option A vs. option B from the same photo.
- Full undo/redo, pinch to zoom, and two-finger rotate and scale of objects.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173 — also served on your LAN (--host)
```

To try it on a phone, open the LAN URL that `npm run dev` prints. Camera capture and sharing need HTTPS on most phones, so for real use deploy the build (below) to any HTTPS static host.

```bash
npm test           # unit tests (Vitest)
npm run type-check # TypeScript
npm run build      # production build in dist/
npm run preview    # serve the production build
```

### Installing on a phone
Host `dist/` on any static HTTPS host, such as Netlify, Vercel, GitHub Pages or Cloudflare Pages. Then:
- **iPhone:** open it in Safari → Share → *Add to Home Screen*.
- **Android:** open it in Chrome → menu → *Install app*.

The app shell is cached by a service worker, so it opens without signal on a job site.

## Tech

- React 19 + TypeScript + Vite; Canvas 2D for all rendering. There are no image assets: plants and materials are drawn procedurally at runtime.
- Object removal runs in a Web Worker (`src/services/inpaint.ts`). It uses a patch search plus a Laplace "membrane" color correction.
- Perspective surfaces are ray-cast onto a ground plane (`src/services/surface.ts`), with mipmapped texture sampling.
- Designs are stored in IndexedDB (`src/services/projectStore.ts`). Photos are downscaled to 2048px on import.

See [CLAUDE.md](./CLAUDE.md) for architecture notes.

## Roadmap ideas
- Wrap with Capacitor for App Store / Play Store distribution and native camera.
- AI generative fill ("replace this bed with a xeriscape") via a hosted image model.
- Plant list and cost estimate generated from the placed items.
- Use photos of the landscaper's own plant stock as custom stamps.
