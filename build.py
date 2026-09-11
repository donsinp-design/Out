#!/usr/bin/env python3
"""Build the game as self-contained pages (JS, fonts and sprites inlined as data URIs).

dist/index.html  body fragment for the claude.ai artifact host, which supplies its own document wrapper
dist/app/        full standalone page for hosting (GitHub Pages): home-screen web app meta, manifest, icons
"""
import base64, datetime, json, pathlib, re, shutil
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
build_stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
assets_js = 'window.__BUILD__=%s;' % json.dumps(build_stamp) + 'window.__ASSETS__=' + '{' + ','.join('%s:"%s"' % (k, v) for k, v in assets.items()) + '};'
html = (ROOT / 'index.html').read_text()
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
body = re.sub(r'<script src="[^"]+"></script>\s*', '', body)
style = '<style>\n' + '\n'.join(fonts.values()) + '\n' + css + '\n</style>\n'
scripts = '<script>' + assets_js + '</script>\n<script>\n' + js + '\n</script>\n'

# artifact fragment: the host supplies doctype/html/head/body
page = ('<meta charset="utf-8">\n<title>OutRun Bangkok</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">\n'
        + style + body.strip() + '\n' + scripts)
(ROOT / 'dist').mkdir(exist_ok=True)
(ROOT / 'dist/index.html').write_text(page)
print('dist/index.html', len(page) // 1024, 'KB')

# standalone page: opens edge to edge when added to the home screen (iOS reads the apple-* meta, Android the manifest)
app = ROOT / 'dist/app'
app.mkdir(parents=True, exist_ok=True)
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
        '<title>ICE MAN</title>\n'
        '<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n'
        '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="ICE MAN">\n'
        '<meta name="theme-color" content="#07070c">\n'
        '<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-180.png">\n<link rel="icon" href="icon-180.png">\n'
        + style + '</head>\n<body>\n')
(app / 'index.html').write_text(head + body.strip() + '\n' + scripts + '</body>\n</html>\n')
(app / 'manifest.webmanifest').write_text(json.dumps({
    'name': 'ICE MAN', 'short_name': 'ICE MAN', 'start_url': './', 'scope': './', 'display': 'fullscreen', 'orientation': 'landscape',
    'background_color': '#07070c', 'theme_color': '#07070c',
    'icons': [{'src': 'icon-180.png', 'sizes': '180x180', 'type': 'image/png'}, {'src': 'icon-512.png', 'sizes': '512x512', 'type': 'image/png'}],
}))
for n in ('icon-180.png', 'icon-512.png'):
    shutil.copy(ROOT / 'assets/pwa' / n, app / n)
print('dist/app/', sorted(p.name for p in app.iterdir()))
