#!/usr/bin/env python3
"""Build dist/index.html: a single self-contained file (JS, fonts and sprites inlined as data URIs)."""
import base64, os, re, pathlib
ROOT = pathlib.Path(__file__).parent
def b64(path, mime):
    return 'data:%s;base64,%s' % (mime, base64.b64encode((ROOT / path).read_bytes()).decode())
fonts = {
    'PressStart2P': "@font-face{font-family:'Press Start 2P';src:url(%s) format('woff2');font-display:block}" % b64('fonts/PressStart2P.woff2', 'font/woff2'),
    'KanitBoldThai': "@font-face{font-family:'Kanit';font-weight:700;src:url(%s) format('woff2');unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC;font-display:block}" % b64('fonts/Kanit-Bold-Thai.woff2', 'font/woff2'),
    'KanitBoldLatin': "@font-face{font-family:'Kanit';font-weight:700;src:url(%s) format('woff2');font-display:block}" % b64('fonts/Kanit-Bold-Latin.woff2', 'font/woff2'),
    'KanitMedThai': "@font-face{font-family:'Kanit';font-weight:500;src:url(%s) format('woff2');unicode-range:U+0E01-0E5B,U+200C-200D,U+25CC;font-display:block}" % b64('fonts/Kanit-Medium-Thai.woff2', 'font/woff2'),
    'KanitMedLatin': "@font-face{font-family:'Kanit';font-weight:500;src:url(%s) format('woff2');font-display:block}" % b64('fonts/Kanit-Medium-Latin.woff2', 'font/woff2'),
}
assets = {}
for f in sorted((ROOT / 'assets').glob('*.png')):
    assets[f.stem] = b64('assets/' + f.name, 'image/png')
css = (ROOT / 'src/style.css').read_text()
js = '\n'.join((ROOT / 'src' / n).read_text() for n in ['util.js', 'assets.js', 'atlas_frames.js', 'audio.js', 'track.js', 'world.js', 'render.js', 'game.js'])
assets_js = 'window.__ASSETS__=' + '{' + ','.join('%s:"%s"' % (k, v) for k, v in assets.items()) + '};'
html = (ROOT / 'index.html').read_text()
# strip doctype/html/head/body wrappers: the artifact host supplies them; keep a standalone-friendly file too
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body)
page = ('<meta charset="utf-8">\n<title>OutRun Bangkok</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">\n'
        '<style>\n' + '\n'.join(fonts.values()) + '\n' + css + '\n</style>\n' + body.strip() + '\n<script>' + assets_js + '</script>\n<script>\n' + js + '\n</script>\n')
(ROOT / 'dist').mkdir(exist_ok=True)
(ROOT / 'dist/index.html').write_text(page)
print('dist/index.html', len(page) // 1024, 'KB')
