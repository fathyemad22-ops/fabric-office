#!/usr/bin/env python3
"""بيعمل صفحة التصويت في ملف واحد (index.html) فيه كل حاجة، عشان تترفع في repo لوحدها."""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'vote.html').read_text(encoding='utf-8')
css = (root / 'css/style.css').read_text(encoding='utf-8')
cfg = (root / 'js/config.js').read_text(encoding='utf-8')
js = (root / 'js/vote.js').read_text(encoding='utf-8')
icon = (root / 'icon.svg').read_text(encoding='utf-8')
import base64
icon_uri = 'data:image/svg+xml;base64,' + base64.b64encode(icon.encode()).decode()
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="js/config.js"></script>', '<script>\n' + cfg + '\n</script>')
html = html.replace('<script src="js/vote.js"></script>', '<script>\n' + js + '\n</script>')
html = html.replace('href="icon.svg"', f'href="{icon_uri}"')
html = re.sub(r'\s*<meta property="og:image"[^>]*>', '', html)
out = pathlib.Path(__file__).resolve().parent / 'index.html'
out.write_text(html, encoding='utf-8')
print(out, len(html) // 1024, 'KB')
