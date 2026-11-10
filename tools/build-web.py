"""Stage only distributable application assets for static HTTPS hosting."""
from pathlib import Path
import json
import re
import shutil
import subprocess
import sys

root=Path(__file__).resolve().parents[1]
out=Path(sys.argv[1]) if len(sys.argv)>1 else root/'dist/web'
out=out.resolve()
if out==root or root.is_relative_to(out):raise SystemExit('Output must not replace the source tree')
out.mkdir(parents=True,exist_ok=True)
revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
for pattern in ['*.js','styles.css','index.html','workspace-index.json']:
    for file in root.glob(pattern):shutil.copyfile(file,out/file.name)
for name in ['assets','shaders','workspace']:
    shutil.copytree(root/name,out/name,dirs_exist_ok=True)
(out/'test-assets').mkdir(exist_ok=True)
shutil.copyfile(root/'test-assets/Posterize_Time_motion.mp4',out/'test-assets/Posterize_Time_motion.mp4')
shutil.copytree(root/'prototypes/posterize-time/preset',out/'prototypes/posterize-time/preset',dirs_exist_ok=True)
html=(out/'index.html').read_text()
html=html.replace('<html lang="ru">','<html lang="ru" data-build="'+revision+'">')
html=re.sub(r'((?:src|href)="[^"?]+\.(?:js|css))"',r'\1?v='+revision+'"',html)
(out/'index.html').write_text(html)
(out/'version.json').write_text(json.dumps({'version':'0.13.1','build':revision})+'\n')
(out/'.nojekyll').write_text('')
print('Web assets:',out)
print('Build:',revision)
