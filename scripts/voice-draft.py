#!/usr/bin/env python3
"""
Draft voices for «Сельская почта» (docs/voice/README.md, «Черновая озвучка»): every line of
docs/voice/script.csv, read by a speech synthesiser — Silero TTS v5 (ru), five voices, each role its own
voice, pitch and pace — into src/assets/voice/<id>.mp3, the file the game plays for that line.

  A draft, to hear the game with voices and time the scenes: Silero's models are CC BY-NC-SA,
  not for the release. docs/voice/drafts.json lists every draft file; a real recording put in its
  place (a file not in that list) is never overwritten.

  python3 scripts/voice-draft.py [--model v5_ru.pt] [--only kartatay,muha] [--limit N] [--force]

Needs: torch (CPU), soundfile, numpy; ffmpeg on PATH; the model file
(https://models.silero.ai/models/tts/ru/v5_ru.pt).
"""
import argparse, csv, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, 'docs/voice/script.csv')
OUT = os.path.join(ROOT, 'src/assets/voice')
MANIFEST = os.path.join(ROOT, 'docs/voice/drafts.json')

# role (docs/voice/script.csv, column «роль») → Silero voice, pitch, pace (docs/voice/README.md, «Роли»)
NARRATOR = ('eugene', 'low', 'slow')
CAST = {
    'kartatay': ('aidar', 'low', 'slow'),        # 72, dry, quiet, a smile in it
    'muha': ('eugene', 'high', 'fast'),          # 20, quick, cocky
    'Рассказчик': NARRATOR,
    'Колесо': NARRATOR,
    'kuzmin': ('aidar', 'medium', 'medium'),     # ~35, official, tired
    'mityai': ('aidar', 'high', 'fast'),         # 69, cheerful, fussy
    'Радио «Заречье», ведущая': ('xenia', 'high', 'medium'),
    'valentina': ('baya', 'medium', 'fast'),     # the shop: loud, rattles on
    'nina': ('kseniya', 'low', 'slow'),          # old, sing-song
    'rashit': ('eugene', 'x-low', 'slow'),       # the beekeeper: soft, wise
    'farida': ('baya', 'high', 'medium'),        # the Kainly nurse: warm
    'brityi': ('eugene', 'low', 'medium'),
    'stepanych': ('aidar', 'x-low', 'slow'),
    'fedor': ('eugene', 'x-low', 'medium'),      # the forester: few words, low
    'shura': ('baya', 'low', 'fast'),            # gossip
    'gosha': ('aidar', 'low', 'medium'),
    'olya': ('xenia', 'x-high', 'fast'),
    'lida': ('kseniya', 'medium', 'fast'),
    'ramil': ('eugene', 'medium', 'medium'),
    'mikhalych': ('aidar', 'x-low', 'medium'),
    'olesey': ('baya', 'x-low', 'slow'),         # grandmother
    'galina': ('xenia', 'medium', 'fast'),
    'druzhka': ('aidar', 'x-high', 'fast'),
    'zinaida': ('kseniya', 'low', 'medium'),     # the postmistress: brisk, warm under it
    'leather': ('aidar', 'medium', 'fast'),
    'zulfiya': ('xenia', 'high', 'fast'),
    'petrovich': ('aidar', 'medium', 'slow'),
    'tamara': ('kseniya', 'medium', 'slow'),
    'teacher': ('xenia', 'low', 'medium'),
    'logger': ('eugene', 'low', 'fast'),
    'esay': ('baya', 'medium', 'medium'),
    'kid': ('eugene', 'x-high', 'fast'),
    'rinat': ('eugene', 'high', 'x-fast'),
    'belov': ('eugene', 'medium', 'fast'),
    'seryi': ('aidar', 'x-low', 'fast'),
}
# not voiced: the player's answers (Timur is silent), and lines anyone at a door may say (one file, many faces)
SKIP_KINDS = {'ответ игрока'}

# how to say what the synthesiser cannot read: keys, Bashkir and Tatar words (+ before the stressed vowel)
SAY = [
    (r'\bBackspace\b', 'бэкспейс'), (r'\bEnter\b', 'энтер'), (r'\bEsc\b', 'эскейп'), (r'\bF1\b', 'эф один'),
    (r'\bW\b', 'дабл-ю'), (r'\bA\b', 'эй'), (r'\bS\b', 'эс'), (r'\bD\b', 'ди'), (r'\bH\b', 'эйч'), (r'\bF\b', 'эф'),
    (r'\bV\b', 'ви'), (r'\bR\b', 'ар'), (r'\bZ\b', 'зэт'), (r'\bX\b', 'икс'), (r'\bM\b', 'эм'), (r'\bG\b', 'джи'),
    (r'\bQ\b', 'кью'), (r'\bE\b', 'и'), (r'\bC\b', 'си'), (r'\bN\b', 'эн'),
    (r'[Өө]ләсәй', lambda m: ('О' if m.group(0)[0] == 'Ө' else 'о') + 'лэсэ+й'),
    (r'[Әә]сәй', lambda m: ('Э' if m.group(0)[0] == 'Ә' else 'э') + 'сэ+й'),
    (r'[Рр]әхмәт', lambda m: m.group(0)[0] + 'ахмэ+т'),
    (r'Әни', 'Эни+'), (r'Әби', 'Эби+'), (r'Мәрьям', 'Марья+м'), (r'Сәлам', 'Сэла+м'), (r'Әйдә', 'Эйдэ+'),
    (r'китәсеңме', 'китэсенме+'), (r'\bтаң\b', 'тан'), (r'\bәйт\b', 'эйт'),
    (r'\b([Уу])лым\b', r'\1лы+м'), (r'\b([Кк])артатай', r'\1артата+й'), (r'-агай\b', '-ага+й'), (r'-апа\b', '-апа+'),
]
LETTERS = str.maketrans({'ә': 'э', 'Ә': 'Э', 'ө': 'о', 'Ө': 'О', 'ү': 'у', 'Ү': 'У', 'ң': 'н', 'Ң': 'Н', 'һ': 'х', 'Һ': 'Х',
                         'ҡ': 'к', 'Ҡ': 'К', 'ғ': 'г', 'Ғ': 'Г', 'ҙ': 'з', 'Ҙ': 'З', 'ҫ': 'с', 'Ҫ': 'С'})


def spoken(text: str) -> str:
    for pat, rep in SAY:
        text = re.sub(pat, rep, text)
    text = text.translate(LETTERS).replace('…', '...').replace('«', '').replace('»', '').replace('„', '').replace('“', '')
    return re.sub(r'\s+', ' ', text).strip()


def chunks(text: str, limit: int = 380):
    """Sentences, grouped up to `limit` characters (the model reads a few hundred at a time)."""
    out, cur = [], ''
    for s in re.split(r'(?<=[.!?…])\s+', text):
        if cur and len(cur) + len(s) + 1 > limit:
            out.append(cur); cur = s
        else:
            cur = f'{cur} {s}'.strip()
    if cur: out.append(cur)
    return out


def xml(s: str) -> str:
    return s.replace('&', 'и').replace('<', ' ').replace('>', ' ')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default=os.environ.get('SILERO_MODEL', 'v5_ru.pt'))
    ap.add_argument('--only', default='')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--force', action='store_true', help='redo drafts that exist (never real recordings)')
    a = ap.parse_args()

    import numpy as np, soundfile as sf, torch
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    model = torch.package.PackageImporter(a.model).load_pickle('tts_models', 'model')
    model.to('cpu')

    drafts = json.load(open(MANIFEST, encoding='utf-8')) if os.path.exists(MANIFEST) else {}
    os.makedirs(OUT, exist_ok=True)
    # (an empty file — a run cut short — is no recording)
    have = {os.path.splitext(f)[0] for f in os.listdir(OUT) if re.search(r'\.(mp3|ogg|wav)$', f) and os.path.getsize(os.path.join(OUT, f)) > 0}
    only = {x for x in a.only.split(',') if x}
    rows = list(csv.DictReader(open(SCRIPT, encoding='utf-8-sig'), delimiter=';'))
    todo = []
    for r in rows:
        lid, role, kind, text, label = r['id'], r['роль'], r['где звучит'], r['текст'], r['подпись']
        if not lid.startswith('v') or kind in SKIP_KINDS or role not in CAST: continue
        if only and role not in only: continue
        if lid in have and lid not in drafts: continue          # a real recording: leave it
        if lid in drafts and lid in have and not a.force: continue
        todo.append((lid, role, label, text))
    if a.limit: todo = todo[:a.limit]
    print(f'{len(todo)} lines to draft', flush=True)

    sr = 48000
    gap = np.zeros(int(sr * 0.22), dtype=np.float32)
    for n, (lid, role, label, text) in enumerate(todo, 1):
        voice, pitch, rate = CAST[role]
        if 'мегафон' in label: pitch, rate = 'high', 'fast'
        parts = []
        for c in chunks(spoken(text)):
            ssml = f'<speak><prosody pitch="{pitch}" rate="{rate}">{xml(c)}</prosody></speak>'
            try:
                parts.append(model.apply_tts(ssml_text=ssml, speaker=voice, sample_rate=sr).numpy())
            except Exception as e:  # a sentence the model will not take: say it plainly
                parts.append(model.apply_tts(text=xml(c), speaker=voice, sample_rate=sr).numpy())
                print(f'  plain: {lid} ({e})', flush=True)
            parts.append(gap)
        audio = np.concatenate(parts[:-1]) if parts else gap
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as t:
            sf.write(t.name, audio, sr)
        dst = os.path.join(OUT, f'{lid}.mp3')
        # trim the silence at both ends, then even loudness (≈ −16 LUFS, peaks under −1.5 dBFS), mono mp3
        filt = ('silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.08,'
                'areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse,'
                'loudnorm=I=-16:TP=-1.5:LRA=11')
        enc = ['-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '32k', dst]
        r = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', t.name, '-af', filt, *enc])
        if r.returncode != 0:  # ffmpeg's loudnorm now and then gives up on a clip: plain peak levelling instead
            print(f'  plain levels: {lid}', flush=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', t.name, '-af', 'dynaudnorm=p=0.8', *enc], check=True)
        os.unlink(t.name)
        # (the list is written at once: a file that is not in it counts as a real recording and is left alone)
        drafts[lid] = f'silero v5_ru · {voice} · {pitch}/{rate}'
        json.dump(dict(sorted(drafts.items())), open(MANIFEST, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        if n % 20 == 0 or n == len(todo): print(f'{n}/{len(todo)}', flush=True)


if __name__ == '__main__':
    main()
