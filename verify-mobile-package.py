"""Validate the exported mobile package against the working reference.
Usage: python3 verify-mobile-package.py REFERENCE_FOLDER EDITED_ZIP
Expected edit: Glow_Preset_01 / threshold.DEFAULT = 0.321.
"""
import io
import json
import sys
import zipfile
from pathlib import Path

reference = Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2]) as outer:
    assert sorted(outer.namelist()) == ['Layers.zip', 'all_in_one.json']
    assert outer.testzip() is None
    manifest = json.loads(outer.read('all_in_one.json'))
    assert manifest == json.loads((reference / 'all_in_one.json').read_text())
    inner_bytes = outer.read('Layers.zip')
with zipfile.ZipFile(reference / 'Layers.zip') as original, zipfile.ZipFile(io.BytesIO(inner_bytes)) as edited:
    assert edited.testzip() is None
    def files(archive):
        return {n for n in archive.namelist() if not n.endswith('/') and not n.startswith('__MACOSX/') and not any(p.startswith('.') for p in n.split('/'))}
    assert files(original) == files(edited)
    changed = []
    recipes = blooms = binaries = jsons = 0
    for name in sorted(files(original)):
        assert name.startswith('Layers/video_effects/v1/composite_effect/')
        before, after = original.read(name), edited.read(name)
        if not name.endswith('.json'):
            assert before == after, name
            binaries += 1
            continue
        old, new = json.loads(before), json.loads(after)
        jsons += 1
        if 'effects' in new:
            recipes += 1
            assert all(e['effectType'] not in ('bloom', 'bloomRework') for e in new['effects'])
            assert {'effectName': 'new_bloom_01', 'effectType': 'isf'} in new['effects']
        if name.endswith('/new_bloom_01.json'):
            blooms += 1
            assert new['shaderPath'] == 'v1/Bloom2/Bloom2'
            assert new['intensityParamNames'] == old['intensityParamNames']
            assert new['shaderConfig']['PASSES'] == old['shaderConfig']['PASSES']
            assert len(new['shaderConfig']['PASSES']) == 16
            assert 'threshold' not in new
        if '/Glow_Preset_01/resources/new_bloom_01.json' in name:
            next(p for p in old['shaderConfig']['INPUTS'] if p['NAME'] == 'threshold')['DEFAULT'] = 0.321
            changed.append(name)
        assert old == new, name
    assert recipes == blooms == 10
    assert len(changed) == 1
    print(f'PASS two ZIP levels and CRC; {recipes} ISF recipes; {blooms} full Bloom2 configs; {jsons} valid JSON; {binaries} binary assets byte-identical; only threshold.DEFAULT changed; no legacy Bloom effect types')
