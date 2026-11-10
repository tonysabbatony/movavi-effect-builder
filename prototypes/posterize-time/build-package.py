"""Build the mobile preset and developer handoff from tracked prototype sources.
Usage: python3 prototypes/posterize-time/build-package.py OUTPUT_DIRECTORY
"""
from pathlib import Path
import io
import json
import shutil
import sys
import zipfile

root = Path(__file__).resolve().parents[2]
prototype = Path(__file__).resolve().parent
preset = prototype / 'preset'
uid = 'Posterize_Time_01'
layer = preset / 'Layers/video_effects/v1/composite_effect' / uid
resources = layer / 'resources'
resources.mkdir(parents=True, exist_ok=True)
names = ['posterize_time.json', 'PosterizeTime.ps', 'PosterizeTime.vs']
manifest = {
    'groups': [{'cover_version':'v1','group_priority':0,'plug_colors':['172033','63DDC3','E9F2FA'],'group_id':'temporal'}],
    'items': [{'is_premium':False,'uid':uid,'group_id':'temporal','resources':names,'lut':'','version':'v1','effect_type':'composite_effect','priority':1,'is_rewardable':False,'overlays':[]}]
}
(preset / 'all_in_one.json').write_text(json.dumps(manifest,indent=2)+'\n')
(layer / (uid+'.json')).write_text(json.dumps({'effects':[{'effectName':'posterize_time','effectType':'isf'}]},indent=2)+'\n')
for name in names:
    source = 'PosterizeTime.json' if name == 'posterize_time.json' else name
    shutil.copyfile(root / 'shaders/PosterizeTime' / source, resources / name)
out = Path(sys.argv[1]) if len(sys.argv)>1 else root/'dist/posterize-time'
out.mkdir(parents=True,exist_ok=True)
inner=io.BytesIO()
with zipfile.ZipFile(inner,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted((preset/'Layers').rglob('*')):
        if f.is_file():z.write(f,f.relative_to(preset))
mobile=out/'Posterize_Time_Prototype_mobile.zip'
with zipfile.ZipFile(mobile,'w',zipfile.ZIP_DEFLATED) as z:
    z.write(preset/'all_in_one.json','all_in_one.json')
    z.writestr('Layers.zip',inner.getvalue())
developer=out/'Posterize_Time_Prototype_developer.zip'
with zipfile.ZipFile(developer,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted((root/'shaders/PosterizeTime').glob('*')):
        z.write(f,'ISF_METAL/v1/PosterizeTime/'+f.name)
        z.write(f,f.relative_to(root))
    z.write(mobile,mobile.name)
    z.write(prototype/'README_RU.md','README_RU.md')
    for f in [prototype/'README_RU.md',prototype/'build-package.py',root/'tests/posterize-time/metal-oracle.mm',root/'tests/posterize-time/test-schedule.cjs',root/'posterize-time.js']:
        if f.is_file():z.write(f,f.relative_to(root))
print(mobile)
print(developer)
