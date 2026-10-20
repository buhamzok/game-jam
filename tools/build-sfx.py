"""Build the game's sound packs from tools/sfx-kit.json.

Every candidate in the kit is cut and levelled the same way:
  * start 2 ms before the first frame within 30 dB of the loudest moment, so a
    sound plays the instant the game asks for it (no dead air, no late attack);
  * end where it falls 45 dB below its peak, or at the event's maxLen, with a
    fade so nothing clicks;
  * level: the body (everything within 30 dB of the peak) to -18 dBFS RMS,
    then pulled down if any sample would pass -1 dBFS. Relative mix levels
    come from each event's gain at run time.
The time of each sound's loudest moment is stored, so the game can start a
whoosh early enough that its peak lands on the hit frame.

Outputs:
  public/cdn-assets/sfx/sounds.pack   picked one-shots + the event table (game)
  public/cdn-assets/sfx/loops.pack    picked music and ambience loops (game)
  art/sound-board/board.pack          every candidate, for the sound board
  docs/sound-credits.md               sources of everything the game uses
Pack layout: uint32 LE header length, JSON header, then MP3 bytes back to back
(header offsets count from the end of the header). MP3 inside a .pack because
Internet Download Manager blanks .mp3/.ogg/.wav responses in Chrome.

Needs numpy, soundfile and ffmpeg. Run from the project root:
    python -I tools/build-sfx.py
"""
import json
import os
import struct
import subprocess
import tempfile

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'sound-sources')
KIT = json.load(open(os.path.join(ROOT, 'tools', 'sfx-kit.json'), encoding='utf-8'))
TMP = tempfile.mkdtemp(prefix='sfx-')

BODY_RMS_DB = -18.0
PEAK_LIMIT_DB = -1.0
LOOP_RMS_DB = -20.0


def db(x):
    return 20 * np.log10(max(x, 1e-12))


def encode(samples, sr, channels, kbps):
    """Float samples (n, ch) -> MP3 bytes via ffmpeg."""
    wav = os.path.join(TMP, 'x.wav')
    mp3 = os.path.join(TMP, 'x.mp3')
    sf.write(wav, samples, sr, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-ar', '44100', '-ac', str(channels),
                    '-c:a', 'libmp3lame', '-b:a', f'{kbps}k', mp3], check=True)
    return open(mp3, 'rb').read()


def cut_oneshot(path, max_len=None):
    """Mono, trimmed, faded, levelled one-shot. Returns (samples, sr, peak_ms, info)."""
    d, sr = sf.read(path, always_2d=True)
    x = d.mean(1)
    w = max(1, int(sr * 0.005))
    n = len(x) // w
    env = np.sqrt((x[: n * w].reshape(n, w) ** 2).mean(1)) + 1e-12
    edb = 20 * np.log10(env)
    top = edb.max()
    loud = np.where(edb > top - 30)[0]
    onset = loud[0]
    last = np.where(edb > top - 45)[0][-1]
    start = max(0, onset * w - int(sr * 0.002))
    end = min(len(x), (last + 1) * w + int(sr * 0.02))
    capped = False
    if max_len and end - start > max_len * sr:
        end = start + int(max_len * sr)
        capped = True
    y = x[start:end].copy()
    fi = min(len(y), int(sr * 0.002))
    if start > 0 and fi:
        y[:fi] *= np.linspace(0, 1, fi)
    fo = min(len(y) // 3, int(sr * (0.3 if capped else 0.06)))
    if fo:
        y[-fo:] *= np.linspace(1, 0, fo) ** 2
    body = y[(onset * w - start): (last + 1) * w - start] if not capped else y
    gain = BODY_RMS_DB - db(np.sqrt((body ** 2).mean()))
    peak = db(np.abs(y).max())
    gain = min(gain, PEAK_LIMIT_DB - peak)
    y *= 10 ** (gain / 20)
    pk = int(np.argmax(env[onset: last + 1])) + onset
    peak_ms = max(0, round((pk * w - start) / sr * 1000))
    return y[:, None], sr, peak_ms, {'len_ms': round(len(y) / sr * 1000), 'gain_db': round(gain, 1)}


def cut_loop(path, max_len, seamless):
    """Stereo music/ambience loop, levelled; the end is crossfaded into the start so it loops without a seam."""
    d, sr = sf.read(path, always_2d=True)
    if d.shape[1] == 1:
        d = np.repeat(d, 2, axis=1)
    d = d[:, :2]
    if len(d) > max_len * sr:
        d = d[: int(max_len * sr)]
    xf = int(sr * (0.05 if seamless else 1.5))
    loop = d[: len(d) - xf].copy()
    t = np.linspace(0, np.pi / 2, xf)[:, None]
    # equal-power: the tail fades out over the head fading in
    loop[:xf] = d[:xf] * np.sin(t) + d[len(d) - xf:] * np.cos(t)
    rms = db(np.sqrt((loop ** 2).mean()))
    g = min(LOOP_RMS_DB - rms, PEAK_LIMIT_DB - db(np.abs(loop).max()))
    loop *= 10 ** (g / 20)
    return loop, sr, len(loop) / sr


def write_pack(path, header, blobs):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    head = json.dumps(header, separators=(',', ':')).encode('utf-8')
    with open(path, 'wb') as f:
        f.write(struct.pack('<I', len(head)))
        f.write(head)
        for b in blobs:
            f.write(b)
    return os.path.getsize(path)


def source_page(rel):
    """Where a source file came from, for the credits."""
    parts = rel.split('/')
    if parts[0] == 'freesound':
        sid = parts[2].split('.')[0]
        return f'https://freesound.org/s/{sid}/', 'Freesound (CC0)'
    if parts[0] == 'kenney':
        pack = parts[1].replace('kenney_', '')
        return f'https://kenney.nl/assets/{pack}', 'Kenney (CC0)'
    oga = {
        'rpg_sound_pack': 'rpg-sound-pack', 'independent_nu_ljudbank-hits_and_punches': '37-hitspunches',
        'swoshes': 'swish-bamboo-stick-weapon-swhoshes', 'battle_sound_effects_0': 'battle-sound-effects',
        'wind1.wav': 'wind1',
        'fight_looped.wav': 'fast-fight-battle-music-looped', 'battleThemeA.mp3': 'battle-theme-a',
        'The_9th_Circle_V2.mp3': 'the-9th-circle', '46b.ogg': 'a-wonderful-nightmare',
        'Memoraphile_-_Spooky_Dungeon.mp3': 'spooky-dungeon',
    }
    key = parts[1] if parts[0] == 'oga' else parts[-1]
    return f'https://opengameart.org/content/{oga.get(key, key)}', 'OpenGameArt (CC0)'


# ---- one-shots --------------------------------------------------------------
cache = {}  # (path, maxLen) -> (bytes, peak_ms, info)


def oneshot(rel, max_len):
    k = (rel, max_len)
    if k not in cache:
        y, sr, peak_ms, info = cut_oneshot(os.path.join(SRC, rel), max_len)
        cache[k] = (encode(y, sr, 1, 128), peak_ms, info)
    return cache[k]


game_sounds, game_blobs, game_events = {}, [], {}
board_sounds, board_blobs, board_events = {}, [], {}
g_off = b_off = 0
used = set()
for name, ev in KIT['events'].items():
    max_len = ev.get('maxLen')
    files = []
    for cid, rel in ev['candidates'].items():
        blob, peak_ms, info = oneshot(rel, max_len)
        key = f'{name}/{cid}'
        board_sounds[key] = [b_off, len(blob), peak_ms]
        board_blobs.append(blob)
        b_off += len(blob)
        board_events.setdefault(name, {**{k: v for k, v in ev.items() if k != 'candidates'}, 'candidates': {}})
        board_events[name]['candidates'][cid] = {'file': key, 'src': rel, **info, 'peak_ms': peak_ms}
        if cid in ev['pick']:
            game_sounds[key] = [g_off, len(blob), peak_ms]
            game_blobs.append(blob)
            g_off += len(blob)
            files.append(key)
            used.add(rel)
    game_events[name] = {k: ev[k] for k in ('bus', 'gain', 'rate', 'gap') if k in ev}
    game_events[name]['files'] = files

# ---- loops ------------------------------------------------------------------
loop_header, loop_blobs, l_off = {}, [], 0
loop_stored = {}  # source file -> (off, len): a track picked for two slots is stored once
board_loops = {}
for name, lp in KIT['loops'].items():
    board_loops[name] = {'desc': lp['desc'], 'gain': lp['gain'], 'pick': lp['pick'], 'candidates': {}}
    for cid, rel in lp['candidates'].items():
        seamless = rel.endswith('fight_looped.wav')
        y, sr, loop_sec = cut_loop(os.path.join(SRC, rel), lp.get('maxLen', 60), seamless)
        mono = name == 'ambience'
        blob = encode(y.mean(1)[:, None] if mono else y, sr, 1 if mono else 2, 96 if mono else 128)
        key = f'{name}/{cid}'
        board_sounds[key] = [b_off, len(blob), 0]
        board_blobs.append(blob)
        b_off += len(blob)
        board_loops[name]['candidates'][cid] = {'file': key, 'src': rel, 'loop_sec': round(loop_sec, 3)}
        if cid == lp['pick']:
            if rel not in loop_stored:
                loop_stored[rel] = (l_off, len(blob))
                loop_blobs.append(blob)
                l_off += len(blob)
            off, ln = loop_stored[rel]
            loop_header[name] = {'off': off, 'len': ln, 'loop_sec': round(loop_sec, 4), 'gain': lp['gain']}
            used.add(rel)

out_sfx = os.path.join(ROOT, 'public', 'cdn-assets', 'sfx')
s1 = write_pack(os.path.join(out_sfx, 'sounds.pack'), {'v': 2, 'sounds': game_sounds, 'events': game_events}, game_blobs)
s2 = write_pack(os.path.join(out_sfx, 'loops.pack'), {'v': 2, 'loops': loop_header}, loop_blobs)
s3 = write_pack(os.path.join(ROOT, 'art', 'sound-board', 'board.pack'),
                {'v': 2, 'sounds': board_sounds, 'events': board_events, 'loops': board_loops}, board_blobs)
print(f'sounds.pack {s1 // 1024} KB ({len(game_sounds)} sounds, {len(game_events)} events)')
print(f'loops.pack {s2 // 1024} KB ({len(loop_header)} loops)')
print(f'board.pack {s3 // 1024} KB ({len(board_sounds)} candidates)')

# ---- credits ----------------------------------------------------------------
rows = []
for rel in sorted(used):
    url, where = source_page(rel)
    rows.append(f'| `{rel}` | {where} | {url} |')
md = '\n'.join([
    '# Sound credits',
    '',
    'Every sound and music track in the game is CC0 (public domain): no credit is required, but the sources are listed here as proof of origin.',
    'Built by `tools/build-sfx.py` from `tools/sfx-kit.json` (source files in `art/sound-sources/`).',
    '',
    '| File | Source | Page |',
    '| --- | --- | --- |',
    *rows,
    '',
])
open(os.path.join(ROOT, 'docs', 'sound-credits.md'), 'w', encoding='utf-8', newline='\n').write(md)
print(f'credits: {len(rows)} source files')
