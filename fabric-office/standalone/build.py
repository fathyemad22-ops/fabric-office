#!/usr/bin/env python3
"""بيعمل صفحات "الرسومات" كملفات لوحدها، كل ملف فيه كل حاجته، عشان تترفع في repo منفصل (rasomat):
- index.html : صفحة تصويت العملاء
- admin.html : لوحة الرسومات (رفع الصور والنتايج)
"""
import base64, pathlib, re
here = pathlib.Path(__file__).resolve().parent
root = here.parent
css = (root / 'css/style.css').read_text(encoding='utf-8')
cfg = (root / 'js/config.js').read_text(encoding='utf-8')
icon = (root / 'icon.svg').read_text(encoding='utf-8')
icon_uri = 'data:image/svg+xml;base64,' + base64.b64encode(icon.encode()).decode()

def build(src, script, out):
    html = (root / src).read_text(encoding='utf-8')
    js = (root / script).read_text(encoding='utf-8')
    html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
    html = html.replace('<script src="js/config.js"></script>', '<script>\n' + cfg + '\n</script>')
    html = html.replace(f'<script src="{script}"></script>', '<script>\n' + js + '\n</script>')
    html = html.replace('href="icon.svg"', f'href="{icon_uri}"')
    html = re.sub(r'\s*<meta property="og:image"[^>]*>', '', html)
    assert 'src="js/' not in html and 'href="css/' not in html, out
    (here / out).write_text(html, encoding='utf-8')
    print(out, len(html) // 1024, 'KB')

build('vote.html', 'js/vote.js', 'index.html')
build('rasomat-admin.html', 'js/rasomat-admin.js', 'admin.html')
