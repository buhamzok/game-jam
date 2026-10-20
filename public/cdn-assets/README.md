# CDN Assets

This folder contains large static assets that will be deployed to the CDN.

## How it works

1. **Add your assets here** (images, audio, videos, etc.)
2. **Deploy game using rundot cli** `rundot deploy`
3. **cdn-assets will be uploaded to the CDN** — versioning is also handled for you

## Usage in Pixi

```typescript
import { Assets, Sprite } from 'pixi.js';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

// Fetch an asset blob from the CDN and load it into Pixi:
const blob = await RundotGameAPI.cdn.fetchAsset('my-sprite.png');
const blobUrl = URL.createObjectURL(blob);

// Blob URLs have no file extension, so tell Assets which parser to use.
const texture = await Assets.load({ src: blobUrl, loadParser: 'loadTextures' });
URL.revokeObjectURL(blobUrl);

const sprite = new Sprite(texture);
```

**Note:** Assets are uploaded to the CDN automatically when you deploy with `rundot deploy`.

## Important Notes

- **DO** commit assets to this folder
- Use `public/` folder for small essential assets (<100KB)
- Use `public/cdn-assets` folder for large assets (>100KB)
- Small assets that ship with the bundle belong in `src/assets/manifest.ts`
  (the loading screen warms them at boot); CDN assets are for big files you
  fetch on demand.
