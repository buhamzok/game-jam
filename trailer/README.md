# Tag Team Terror trailer (Remotion)

A 32-second promo built from real gameplay footage, in two formats:

- `TrailerWide`: 1920 x 1080 (X, YouTube, the jam page)
- `TrailerTall`: 1080 x 1920 (WhatsApp status, TikTok, Reels)

Beat sheet and timing: the comment at the top of `src/trailer/Trailer.tsx`. The music ("The 9th Circle", OpenGameArt, CC0) runs at 180 BPM, so a beat is 10 frames and every cut lands on one.

## Make it

1. Capture footage from the game (frame by frame; about 15 minutes per format):

   ```bash
   # in the game folder
   NO_PLAYGROUND=1 npm run dev
   # in this folder
   npm install
   node capture/capture.mjs landscape     # -> public/clips/landscape/*.mp4
   node capture/capture.mjs portrait      # -> public/clips/portrait/*.mp4
   node capture/capture.mjs landscape boss,pvp   # re-shoot only some shots
   ```

   The capture hides the game UI and drives an autopilot (it walks in, combos, dodges red, guards purple, and fires the transform, specials and swaps each shot asks for). Set `CHROME=/path/to/chrome` if Chromium is not at the default path.

2. Preview and edit: `npm run dev` (Remotion Studio).

3. Render:

   ```bash
   npx remotion render TrailerWide out/tag-team-terror-trailer-16x9.mp4
   npx remotion render TrailerTall out/tag-team-terror-trailer-9x16.mp4
   ```

   Check frames quickly with `node capture/stills.mjs TrailerWide 120,400,800 out/sheet.png`.

## Game tile (public/thumbnail.jpg)

```bash
# game dev server running (NO_PLAYGROUND=1 npm run dev)
node capture/thumb.mjs                       # 3D art -> public/thumb-art.png (poses: DEFAULT_SHOT in src/dev/thumbTool.ts)
npx remotion still Thumbnail out/thumb-1024.png
ffmpeg -i out/thumb-1024.png -vf scale=512:512:flags=lanczos -q:v 2 ../public/thumbnail.jpg
```

## Assets

- Fonts in `public/fonts` (Archivo Black, Instrument Serif, JetBrains Mono; SIL OFL, from @fontsource) so renders never need the network.
- Sound effects in `public/sfx`: the CC0 kit from the `sound-effects` skill (`.claude/skills/sound-effects/LICENSES.md`).
- `public/clips` and `out` are generated and not committed.
