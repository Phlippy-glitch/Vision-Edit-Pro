# Vision Edit Pro — Landscape Design Visualizer

A mobile app for landscapers. Photograph a client's property, then mock up proposed changes right on the photo: new trees and shrubs, fresh lawn, paver patios, mulch beds, and house features. You can also remove what's going away. Show the client a before/after slider on the spot, then text or email them the image.

Runs as an installable Progressive Web App (PWA) on iPhone and Android. There's no app store, account or server. Designs are saved on the device and work offline.

## What it does

| Tab | Purpose |
| --- | --- |
| **Plants** | 22 placeable objects in 5 groups: trees (shade, spruce, arborvitae, Japanese maple, flowering, palm), shrubs (boxwood, hedge, hydrangea, azalea/rose), perennials (ornamental grass, lavender, hosta, flower bed), hardscape (boulder, planter, path light, fire pit) and house features (front door, shutters, window box, wall lantern). Each item is procedurally painted, so **New look** gives every shrub a unique shape. Many have color options. |
| **Surfaces** | Outline an area and fill it with lawn, mulch (brown/black/red), river rock, pea gravel, brick or patio pavers, flagstone, concrete, a wood deck, or siding/brick/stone veneer for walls. Ground materials shrink toward the horizon in true perspective. They also keep the photo's existing shadows, so a new lawn still shows the house's shadow. |
| **Remove** | Paint over an existing feature (an old shrub, a dead patch) and it is filled in from the surrounding texture, with color matching. **Try another fill** cycles through alternative source areas. |
| **Horizon** | Drag the horizon line to eye level. Guide lines help you line it up with paths and edging. Surfaces use it for foreshortening, and plants scale with distance as you drag them. |
| **Layers** | Reorder, hide, or delete changes. |
| **My plants** | Add items from photos of your own stock. Photograph a plant against a plain background, tap the background with the magic eraser (or outline the plant), then name it, pick a typical size and set a price. It's saved on the phone and works like any built-in item, including the estimate. |
| **AI fill** | Paint an area, describe what should be there ("xeriscape with boulders and agave"), and an AI image model (OpenAI) generates it in place. It only changes what you paint. The result is a layer you can hide, undo or regenerate with **Try again**. Needs the one-time server setup below. |
| **Estimate** | Plant list and cost estimate built from the design. Plants are counted by type and color. Surface areas are measured from the photo using the horizon and camera height, roughly ±25%, or you can type an exact area on any surface. Mulch and rock also show cubic yards at 3". Edit any price and it's remembered on the phone. Add tax, copy the estimate as text, or include it on the before/after image. Starting prices are rough examples to replace with your own. |

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

## Setting up AI fill (one time)

AI fill sends the painted part of the photo to OpenAI. Your OpenAI key must never be inside the app, so it lives in a small server function that ships in this repo (`api/ai-edit.ts`) and deploys with the site on Vercel.

1. Create an OpenAI API key at platform.openai.com (a billing method is required). Each generation costs a few cents to about $0.20, depending on size and quality.
2. Import this repository into [Vercel](https://vercel.com/new). The defaults work; `vercel.json` configures the build.
3. In Vercel → Project → Settings → Environment Variables, add:
   - `OPENAI_API_KEY`: your key.
   - `APP_ACCESS_CODE`: a code you choose. Anyone using AI fill types it once in **AI fill → AI settings**. It stops strangers who find your site from spending your credits.
   - Optional: `OPENAI_IMAGE_MODEL` (default `gpt-image-1`) and `OPENAI_IMAGE_QUALITY` (`low` / `medium` / `high`; default `medium`).
4. Redeploy. The app calls `/api/ai-edit` on the same site automatically.

To try it locally, copy `.env.example` to `.env.local`, fill in the key, and run `npm run dev`. The dev server runs the same proxy.

## Tech

- React 19 + TypeScript + Vite; Canvas 2D for all rendering. There are no image assets: plants and materials are drawn procedurally at runtime.
- Object removal runs in a Web Worker (`src/services/inpaint.ts`). It uses a patch search plus a Laplace "membrane" color correction.
- Perspective surfaces are ray-cast onto a ground plane (`src/services/surface.ts`), with mipmapped texture sampling.
- Designs are stored in IndexedDB (`src/services/projectStore.ts`). Photos are downscaled to 2048px on import.

See [CLAUDE.md](./CLAUDE.md) for architecture notes.

## Roadmap ideas
- Wrap with Capacitor for App Store / Play Store distribution and native camera.
