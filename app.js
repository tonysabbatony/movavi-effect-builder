(() => {
  'use strict';
  document.getElementById('previewSize').addEventListener('input', e => {
    document.getElementById('previewStage').style.height = e.target.value + 'px';
    document.getElementById('previewSizeValue').textContent = e.target.value + ' px';
  });
  document.getElementById('fullscreenBtn').addEventListener('click', async () => {
    try { await document.getElementById('previewStage').requestFullscreen(); }
    catch { document.getElementById('previewSize').focus(); }
  });


  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const deepClone = (v) => JSON.parse(JSON.stringify(v));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const nice = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return String(v);
    if (Math.abs(v) >= 100) return v.toFixed(1).replace(/\.0$/, '');
    if (Math.abs(v) >= 10) return v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  };
  const keyForEffect = (e) => `${e.effectType}:${e.effectName}`;
  const presetLabel = name => name.replace(/^Glow_Preset_0*(\d+)$/i, (_, number) => `Glow Preset ${Number(number)}`);

  const ui = {
    openWorkspaceBtn: $('#openWorkspaceBtn'),
    fallbackFolderInput: $('#fallbackFolderInput'),
    saveBtn: $('#saveBtn'),
    exportBtn: $('#exportBtn'),
    workspaceName: $('#workspaceName'),
    writeStatus: $('#writeStatus'),
    manifestStatus: $('#manifestStatus'),
    presetSelect: $('#presetSelect'),
    mediaInput: $('#mediaInput'),
    mediaSelect: $('#mediaSelect'),
    previousMediaBtn: $('#previousMediaBtn'),
    nextMediaBtn: $('#nextMediaBtn'),
    playPauseBtn: $('#playPauseBtn'),
    previewStage: $('#previewStage'),
    beforeCanvas: $('#beforeCanvas'),
    afterCanvas: $('#afterCanvas'),
    emptyPreview: $('#emptyPreview'),
    splitLine: $('#splitLine'),
    splitRange: $('#splitRange'),
    effectStack: $('#effectStack'),
    activePresetName: $('#activePresetName'),
    clearSoloBtn: $('#clearSoloBtn'),
    selectedEffectTitle: $('#selectedEffectTitle'),
    parameterEditor: $('#parameterEditor'),
    warningsBox: $('#warningsBox'),
    resetEffectBtn: $('#resetEffectBtn'),
    footerStatus: $('#footerStatus'),
    dirtyStatus: $('#dirtyStatus'),
    sourceVideo: $('#sourceVideo'),
    noiseVideo: $('#noiseVideo'),
    workA: $('#workA'),
    workB: $('#workB'),
    workC: $('#workC')
  };

  const state = {
    userIntensity: 1,
    videoExporting: false,
    migratedBloomCount: 0,
    renderBusy: false,
    renderAgain: false,
    workspaceName: '',
    manifestPath: null,
    manifest: null,
    collection: null,
    rootHandle: null,
    files: new Map(), // path -> { file, handle? }
    presets: new Map(),
    activePresetName: null,
    selectedEffectKey: null,
    enabled: new Map(),
    soloKey: null,
    dirtyPaths: new Set(),
    removedLayers: new Map(),
    compareMode: 'split',
    split: 50,
    sourceKind: null,
    sourceImage: null,
    sourceObjectUrl: null,
    mediaLibrary: [],
    activeMediaId: null,
    mediaSequence: 0,
    mediaLoadVersion: 0,
    mediaLoadAbort: null,
    noiseObjectUrl: null,
    overlays: new Map(),
    exportDirectory: null,
    lutCache: new Map(),
    lutAssignments: new Map(), // resource JSON path -> selected/located .cube
    renderQueued: false,
    videoLoopId: 0,
    isPlaying: false
  };

  function setStatus(text) {
    ui.footerStatus.textContent = text;
  }

  function updateDirtyUI() {
    const n = state.dirtyPaths.size;
    ui.dirtyStatus.textContent = n ? `${n} changed JSON` : 'no changes';
    ui.dirtyStatus.className = `badge ${n ? 'warn' : 'muted'}`;
    ui.saveBtn.disabled = !n || !state.rootHandle;
    ui.exportBtn.disabled = !state.activePresetName;
    $('#exportGroupBtn').disabled = !state.presets.size || !state.manifest;
    $('#importLayerBtn').disabled = !state.activePresetName;
    $('#addSharpenBtn').disabled = !state.activePresetName;
    $('#neutralAtZeroBtn').disabled = !state.activePresetName;
    $('#newPresetBtn').disabled = !state.manifest;
    $('#effectCatalog').disabled = !state.activePresetName;
    $('#addEffectBtn').disabled = !state.activePresetName || !$('#effectCatalog').value;
    updateVideoExportUI();
  }

  function updateVideoExportUI() {
    $('#exportVideoBtn').disabled = !state.activePresetName || state.sourceKind !== 'video' || ui.sourceVideo.readyState < 2 || !Number.isFinite(ui.sourceVideo.duration) || ui.sourceVideo.duration <= 0;
  }

  function normalizePath(p) {
    return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
  }

  async function collectDirectory(handle, base = '') {
    const out = new Map();
    async function walk(dir, prefix) {
      for await (const [name, child] of dir.entries()) {
        const path = normalizePath(prefix ? `${prefix}/${name}` : name);
        if (child.kind === 'directory') {
          await walk(child, path);
        } else {
          const file = await child.getFile();
          out.set(path, { file, handle: child });
        }
      }
    }
    await walk(handle, base);
    return out;
  }

  function collectFallbackFiles(fileList) {
    const out = new Map();
    for (const file of fileList) {
      const path = normalizePath(file.webkitRelativePath || file.name);
      out.set(path, { file, handle: null });
    }
    return out;
  }

  async function parseJsonRecord(path) {
    const rec = state.files.get(path);
    if (!rec) throw new Error(`Не найден файл: ${path}`);
    const text = await rec.file.text();
    return JSON.parse(text);
  }

  function storeJson(path,value) {
    state.files.set(path,{file:new File([JSON.stringify(value,null,4)+'\n'],path.split('/').pop(),{type:'application/json'}),handle:null});
    markDirty(path);
  }

  function editDialog(title,fields,submit) {
    const dialog=document.createElement('dialog');dialog.className='builder-dialog';
    const heading=document.createElement('h2');heading.textContent=title;
    const form=document.createElement('form'),error=document.createElement('p');error.className='form-error';error.setAttribute('role','alert');
    for(const field of fields){const label=document.createElement('label');label.textContent=field.label;const input=document.createElement('input');input.name=field.name;input.value=field.value;input.required=true;input.maxLength=field.name==='name'?100:80;label.append(input);form.append(label);}
    const actions=document.createElement('div');actions.className='dialog-actions';const cancel=document.createElement('button');cancel.type='button';cancel.className='btn';cancel.textContent='Отмена';cancel.onclick=()=>dialog.close();const ok=document.createElement('button');ok.className='btn primary';ok.textContent='Создать';actions.append(cancel,ok);form.append(error,actions);dialog.append(heading,form);document.body.append(dialog);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    form.onsubmit=async e=>{e.preventDefault();ok.disabled=true;try{await submit(Object.fromEntries(new FormData(form)));dialog.close();}catch(e){error.textContent=e.message;}finally{ok.disabled=false;}};
    dialog.showModal();form.querySelector('input')?.focus();
  }

  function ensureCollectionManifest() {
    if(state.manifest)return;
    const ids=[...state.presets.keys()];if(!ids.length)return;
    state.manifest=EffectCatalog.manifest('custom','Custom_Preset_01');
    state.manifest.items=ids.map((uid,i)=>EffectCatalog.manifestItem(uid,'custom',i+1));
    state.manifestPath='all_in_one.json';storeJson(state.manifestPath,state.manifest);
  }

  function newCollection() {
    editDialog('Новая сборка',[
      {name:'name',label:'Название сборки',value:'Моя сборка'},
      {name:'group',label:'ID группы · латиница, цифры, _',value:'custom'},
      {name:'uid',label:'Имя первого пресета · сохраняется при экспорте',value:'Custom_Preset_01'}
    ],async data=>{
      if(!data.name.trim())throw Error('Укажите название сборки.');
      const manifest=EffectCatalog.manifest(data.group,data.uid);
      if(state.dirtyPaths.size&&!confirm('В текущей сборке есть изменения. Создать новую сборку без их экспорта?'))return;
      state.rootHandle=null;state.files=new Map();state.dirtyPaths.clear();state.workspaceName=data.name.trim();
      storeJson(data.group+'/all_in_one.json',manifest);
      storeJson(`${data.group}/Layers/video_effects/v1/composite_effect/${data.uid}/${data.uid}.json`,{effects:[]});
      ui.workspaceName.textContent=state.workspaceName;ui.writeStatus.textContent='Новая сборка · экспорт ZIP';ui.writeStatus.className='badge ok';
      await discoverWorkspace();for(const path of state.files.keys())markDirty(path);updateDirtyUI();
      setStatus('Сборка создана. Выберите эффект из каталога или добавьте ещё один пресет.');
    });
  }

  function newPreset() {
    if(!state.manifest)return;
    const next=EffectCatalog.unique('Custom_Preset_01',state.manifest.items.map(item=>item.uid));
    editDialog('Новый пресет',[{name:'uid',label:'Имя пресета · латиница, цифры, _',value:next}],async data=>{
      const uid=EffectCatalog.identifier(data.uid);
      if(state.manifest.items.some(item=>item.uid.toLowerCase()===uid.toLowerCase()))throw Error('Пресет с таким именем уже существует.');
      const group=state.manifest.items.find(item=>item.uid===state.activePresetName)?.group_id || state.manifest.groups[0]?.group_id;
      if(!group)throw Error('В сборке отсутствует группа.');
      const prefix=state.manifestPath.slice(0,state.manifestPath.lastIndexOf('/')+1),rootPath=`${prefix}Layers/video_effects/v1/composite_effect/${uid}`,recipePath=`${rootPath}/${uid}.json`,recipe={effects:[]};
      if(state.files.has(recipePath))throw Error('Файл такого пресета уже существует.');
      const priority=Math.max(0,...state.manifest.items.map(item=>Number(item.priority)||0))+1;
      state.manifest.items.push(EffectCatalog.manifestItem(uid,group,priority));storeJson(recipePath,recipe);markDirty(state.manifestPath);
      state.presets.set(uid,{name:uid,rootPath,recipePath,recipe,originalRecipe:deepClone(recipe),resources:new Map()});
      ui.presetSelect.add(new Option(presetLabel(uid),uid));activatePreset(uid);setStatus(`Создан ${uid}.`);
    });
  }

  async function openZip(file) {
    if(!file)return;
    try {
      const entries=await MobilePackage.unzip(file);
      if(!entries.some(e=>/(^|\/)all_in_one\.json$/i.test(e.name)))throw Error('Выберите ZIP мобильной сборки с all_in_one.json и Layers.zip.');
      const root=file.name.replace(/\.zip$/i,'');const files=entries.map(entry=>{
        const f=new File([entry.bytes],entry.name.split('/').pop());Object.defineProperty(f,'webkitRelativePath',{value:root+'/'+entry.name});return f;
      });await openFallback(files);
    }catch(e){setStatus('Открытие ZIP: '+e.message);alert(e.message);}
  }

  async function overlayAssetName(preset,file) {
    safeName(file.name);if(file.name.startsWith('.')||!/^.+\.(mp4|mov)$/i.test(file.name))throw Error('Оверлей должен быть видео .mp4 или .mov.');
    const base=file.name.replace(/\.[^.]+$/,''),ext=file.name.slice(base.length),prefix=preset.rootPath+'/resources/';
    const videos=[...state.files.keys()].filter(p=>p.startsWith(prefix)&&/\.(mp4|mov)$/i.test(p));
    const existing=videos.find(p=>p.slice(prefix.length).replace(/\.[^.]+$/,'').toLowerCase()===base.toLowerCase());
    if(existing){const a=new Uint8Array(await state.files.get(existing).file.arrayBuffer()),b=new Uint8Array(await file.arrayBuffer());if(a.length===b.length&&a.every((v,i)=>v===b[i]))return {path:existing,base:existing.slice(prefix.length).replace(/\.[^.]+$/,'')};}
    const chosen=EffectCatalog.unique(base,videos.map(p=>p.slice(prefix.length).replace(/\.[^.]+$/,'')));
    return {path:prefix+chosen+ext,base:chosen};
  }

  async function addCatalogEffect(id,file=null,preset=activePreset()) {
    if(!preset)return;
    const item=EffectCatalog.items.find(x=>x.id===id);if(!item)return;
    if(item.asset&&!file){const input=$('#catalogAssetInput');input.accept=item.asset==='lut'?'.cube':'.mp4,.mov';input.onchange=()=>{const f=input.files[0];input.value='';if(f)addCatalogEffect(id,f,preset).catch(e=>{setStatus(e.message);alert(e.message);});};input.click();return;}
    const refs={};const extra=[];
    if(id==='posterize'){
      const response=await fetch('shaders/PosterizeTime/PosterizeTime.json',{cache:'no-store'});if(!response.ok)throw Error('Нет шаблона Posterize Time.');refs.posterize=await response.json();
      for(const name of ['PosterizeTime.ps','PosterizeTime.vs']){const r=await fetch('shaders/PosterizeTime/'+name,{cache:'no-store'});if(!r.ok)throw Error('Нет '+name);extra.push({name,file:new File([await r.blob()],name)});}
    }
    const config=EffectCatalog.config(id,refs);
    if(activePreset()!==preset)throw Error('Пресет изменился. Повторите добавление.');
    const prefix=preset.rootPath+'/resources/',occupied=[...preset.recipe.effects.map(e=>e.effectName),...[...state.files.keys()].filter(p=>p.startsWith(prefix)&&/\.json$/i.test(p)).map(p=>p.split('/').pop().slice(0,-5))];
    const name=EffectCatalog.unique(item.name,occupied),effect={effectName:name,effectType:item.type},key=keyForEffect(effect),path=prefix+name+'.json';
    let lut=null;
    if(item.asset==='lut'){if(!/\.cube$/i.test(file.name))throw Error('Выберите LUT .cube.');lut=parseCube(await file.text());config.templateID=name;extra.push({name:name+'.cube',file});}
    if(item.asset==='overlay'){const asset=await overlayAssetName(preset,file);config.filename=asset.base;if(!state.files.has(asset.path))extra.push({name:asset.path.slice(prefix.length),file});}
    if(id==='sharpen')for(const name of ['Sharpen.ps','Sharpen.vs'])extra.push({name,file:new File([SharpenAssets.sources[name]],name)});
    // Verify all collisions before changing the recipe or resource map.
    for(const source of extra){const collision=[...state.files.keys()].find(p=>p.toLowerCase()===(prefix+source.name).toLowerCase());if(collision){const a=new Uint8Array(await state.files.get(collision).file.arrayBuffer()),b=new Uint8Array(await source.file.arrayBuffer());if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('Ресурс уже занят другим файлом: '+source.name);}}
    validateConfig(config,item.type);
    for(const source of extra)if(!state.files.has(prefix+source.name))putNewFile(prefix+source.name,source.file);
    storeJson(path,config);preset.resources.set(key,{path,config,original:deepClone(config)});preset.recipe.effects.push(effect);markDirty(preset.recipePath);syncManifest();
    if(lut){state.lutCache.set(prefix+name+'.cube',lut);state.lutAssignments.set(path,{path:prefix+name+'.cube',fileName:file.name,lut});}
    state.enabled.set(key,true);state.selectedEffectKey=key;state.soloKey=null;PosterizeTime.reset();renderStack();renderParameterEditor();refreshNoiseVideo();scheduleRender();updateDirtyUI();
    setStatus(`${item.label} добавлен как ${name}. Файлы будут собраны в resources этого пресета.`);
  }

  async function discoverWorkspace() {
    if(await MobilePackage.expandLayers(state.files)) {
      state.rootHandle=null;
      ui.writeStatus.textContent='read only · export ZIP';
    }
    state.presets.clear();
    state.removedLayers.clear();
    state.migratedBloomCount=0;
    state.dirtyPaths.clear();
    state.lutCache.clear();
    state.lutAssignments.clear();
    const paths = [...state.files.keys()];
    const manifestPath = paths.find(p => /(^|\/)all_in_one\.json$/i.test(p));
    state.manifestPath=manifestPath || null;
    state.manifest=manifestPath ? await parseJsonRecord(manifestPath) : null;
    const collectionPath=paths.find(p=>/(^|\/)collection\.json$/i.test(p));
    state.collection=collectionPath ? await parseJsonRecord(collectionPath) : null;
    ui.manifestStatus.textContent = manifestPath ? 'all_in_one: found' : 'all_in_one: —';
    ui.manifestStatus.className = `badge ${manifestPath ? 'ok' : 'muted'}`;

    const matches = [];
    const manifestIds=new Set((state.manifest?.items||[]).filter(item=>item.effect_type==='composite_effect').map(item=>item.uid));
    for (const path of paths) {
      const m = path.match(/(^|\/)([^/]+)\/\2\.json$/i);
      if (m && (/^Glow_Preset_\d+$/i.test(m[2]) || /(^|\/)composite_effect\//.test(path) || manifestIds.has(m[2]))) matches.push({ name: m[2], recipePath: path });
    }
    matches.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    for (const m of matches) {
      const rootPath = m.recipePath.slice(0, m.recipePath.lastIndexOf('/'));
      const recipe = await parseJsonRecord(m.recipePath);
      const resources = new Map();
      for (const effect of recipe.effects || []) {
        let rp = paths.find(p => p.toLowerCase() === `${rootPath}/resources/${effect.effectName}.json`.toLowerCase());
        if (!state.files.has(rp)) continue;
        let config = await parseJsonRecord(rp);
        if(PosterizeTime.upgrade(config))state.dirtyPaths.add(rp);
        if(PosterizeTime.isSupported(config)&&location.protocol!=='file:'){
          for(const name of ['PosterizeTime.ps','PosterizeTime.vs']){
            const response=await fetch('shaders/PosterizeTime/'+name,{cache:'no-store'});
            if(!response.ok)throw Error('Не удалось загрузить актуальный '+name);
            const text=await response.text(),path=rootPath+'/resources/'+name,previous=state.files.get(path);
            if(!previous||await previous.file.text()!==text){state.files.set(path,{file:new File([text],name),handle:previous?.handle||null});state.dirtyPaths.add(path);}
          }
        }
        if(['bloom','bloomRework'].includes(effect.effectType)) {
          config=BloomContract.migrate(config);
          const target=`${rootPath}/resources/new_bloom_01.json`;
          if(rp!==target && (state.files.has(target) || recipe.effects.some(e=>e!==effect && e.effectName==='new_bloom_01')))throw Error('Конфликт ресурсов New Bloom: '+m.name);
          if(rp!==target) {
            state.files.delete(rp);
            rp=target;
            state.files.set(rp,{file:new File([JSON.stringify(config)],'new_bloom_01.json'),handle:null});
          }
          effect.effectName='new_bloom_01';effect.effectType='isf';
          state.dirtyPaths.add(rp);state.dirtyPaths.add(m.recipePath);state.migratedBloomCount++;
        }
        resources.set(keyForEffect(effect), {
          path: rp,
          config,
          original: deepClone(config)
        });
      }
      state.presets.set(m.name, {
        name: m.name,
        rootPath,
        recipePath: m.recipePath,
        recipe,
        originalRecipe: deepClone(recipe),
        resources
      });
    }

    if (!state.presets.size) {
      throw new Error('Пресеты не найдены. Выбери папку, внутри которой лежит Layers/video_effects/.../composite_effect.');
    }
    ensureCollectionManifest();

    ui.presetSelect.innerHTML = '';
    for (const name of state.presets.keys()) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = presetLabel(name);
      ui.presetSelect.appendChild(opt);
    }
    ui.presetSelect.disabled = false;
    $('#demoBtn').disabled = true;
    activatePreset([...state.presets.keys()][0]);
  }

  async function openWorkspace() {
    try {
      if (!window.showDirectoryPicker) {
        ui.fallbackFolderInput.click();
        return;
      }
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setStatus('Читаю Glow-сборку…');
      const files = await collectDirectory(handle);
      state.rootHandle = handle;
      state.files = files;
      state.workspaceName = handle.name;
      ui.workspaceName.textContent = handle.name;
      ui.writeStatus.textContent = 'read / write';
      ui.writeStatus.className = 'badge ok';
      await discoverWorkspace();
      setStatus(`Загружено ${state.presets.size} пресетов.${state.migratedBloomCount?' Старый Bloom заменён на New Bloom; сохраните изменения в JSON или ZIP.':''}`);
      updateDirtyUI();
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error(err);
      setStatus(`Ошибка: ${err.message}`);
      alert(err.message);
    }
  }

  async function openFallback(fileList) {
    if (!fileList?.length) return;
    try {
      state.rootHandle = null;
      state.files = collectFallbackFiles(fileList);
      const first = fileList[0].webkitRelativePath || fileList[0].name;
      state.workspaceName = first.split('/')[0] || 'Selected folder';
      ui.workspaceName.textContent = state.workspaceName;
      ui.writeStatus.textContent = 'read only · export ZIP';
      ui.writeStatus.className = 'badge warn';
      setStatus('Читаю Glow-сборку…');
      await discoverWorkspace();
      setStatus(`Загружено ${state.presets.size} пресетов.${state.migratedBloomCount?' Старый Bloom заменён на New Bloom.':''} Для сохранения используйте экспорт ZIP.`);
      updateDirtyUI();
    } catch (err) {
      console.error(err);
      setStatus(`Ошибка: ${err.message}`);
      alert(err.message);
    }
  }

  function activePreset() {
    return state.activePresetName ? state.presets.get(state.activePresetName) : null;
  }

  function activatePreset(name) {
    const preset = state.presets.get(name);
    if (!preset) return;
    state.activePresetName = name;
    ui.presetSelect.value = name;
    ui.activePresetName.textContent = presetLabel(name);
    state.soloKey = null;
    state.enabled.clear();
    for (const effect of preset.recipe.effects || []) state.enabled.set(keyForEffect(effect), true);
    state.selectedEffectKey = preset.recipe.effects?.[0] ? keyForEffect(preset.recipe.effects[0]) : null;
    renderStack();
    renderParameterEditor();
    refreshNoiseVideo();
    scheduleRender();
    updateDirtyUI();
  }

  function renderStack() {
    const preset = activePreset();
    $('#undoRemoveLayerBtn').hidden=!preset || !(state.removedLayers.get(preset.name)?.length);
    ui.effectStack.innerHTML = '';
    ui.effectStack.classList.toggle('empty-stack', !preset || !preset.recipe.effects?.length);
    if (!preset) return;
    if(!preset.recipe.effects?.length)ui.effectStack.innerHTML='<div class="empty-stack-message">Слоёв нет. Можно добавить новый или вернуть удалённый.</div>';

    for (const effect of preset.recipe.effects || []) {
      const key = keyForEffect(effect);
      const item = document.createElement('div');
      item.className = `effect-item ${key === state.selectedEffectKey ? 'selected' : ''}`;
      item.draggable = true;
      item.dataset.key = key;
      item.innerHTML = `
        <div class="drag-handle" title="Перетащить">≡</div>
        <div class="effect-meta">
          <div class="effect-name">${escapeHtml(prettyEffectName(effect))}</div>
          <div class="effect-type">${escapeHtml(effect.effectType)} · ${escapeHtml(effect.effectName)}</div>
        </div>
        <button class="icon-btn move-up" title="Выше">↑</button><button class="icon-btn move-down" title="Ниже">↓</button>
        <button class="icon-btn eye ${state.enabled.get(key) ? '' : 'off'}" title="Включить/выключить только в preview">👁</button>
        <button class="icon-btn solo ${state.soloKey === key ? 'active' : ''}" title="Solo">S</button>
        <button class="icon-btn remove-layer" title="Удалить слой из рецепта" aria-label="Удалить ${escapeHtml(prettyEffectName(effect))}">×</button>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        state.selectedEffectKey = key;
        renderStack();
        renderParameterEditor();
      });
      for (const [cls, delta] of [['.move-up', -1], ['.move-down', 1]]) {
        const i = preset.recipe.effects.indexOf(effect), button = item.querySelector(cls);
        button.disabled = !preset.recipe.effects[i + delta];
        button.addEventListener('click', () => reorderEffects(key, keyForEffect(preset.recipe.effects[i + delta])));
      }
      item.querySelector('.eye').addEventListener('click', (e) => {
        e.stopPropagation();
        state.enabled.set(key, !state.enabled.get(key));
        renderStack();
        scheduleRender();
      });
      item.querySelector('.solo').addEventListener('click', (e) => {
        e.stopPropagation();
        state.soloKey = state.soloKey === key ? null : key;
        ui.clearSoloBtn.disabled = !state.soloKey;
        renderStack();
        scheduleRender();
      });
      item.querySelector('.remove-layer').addEventListener('click',e=>{e.stopPropagation();removeLayer(key);});
      item.addEventListener('dragstart', (e) => {
        item.classList.add('dragging');
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'move';
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromKey = e.dataTransfer.getData('text/plain');
        reorderEffects(fromKey, key);
      });
      ui.effectStack.appendChild(item);
    }
    ui.clearSoloBtn.disabled = !state.soloKey;
  }

  function prettyEffectName(effect) {
    const names = {
      bloomRework: 'New Bloom',
      chromaticAberration: 'Chromatic Aberration',
      adjust: 'My Adjust',
      lut: 'LUT',
      overlay: 'Video Overlay',vhsDistortion:'VHS Distortion',softBlur:'Soft Blur',noiseLeeCranston:'Noise Lee Cranston',colorDuotone:'Color Duotone',falseColor:'False Color'
    };
    if(BloomContract.isSupported(activePreset()?.resources.get(keyForEffect(effect))?.config))return 'New Bloom';
    if(PosterizeTime.isSupported(activePreset()?.resources.get(keyForEffect(effect))?.config))return 'Posterize Time';
    if(effect.effectType==='isf' && SharpenRender.isSupported(activePreset()?.resources.get(keyForEffect(effect))?.config))return 'Sharpen';
    return names[effect.effectType] || effect.effectName;
  }

  function reorderEffects(fromKey, toKey) {
    if (!fromKey || fromKey === toKey) return;
    const preset = activePreset();
    const arr = preset.recipe.effects;
    const from = arr.findIndex(e => keyForEffect(e) === fromKey);
    const to = arr.findIndex(e => keyForEffect(e) === toKey);
    if (from < 0 || to < 0) return;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    markDirty(preset.recipePath);
    renderStack();
    scheduleRender();
    setStatus(`Порядок слоёв ${preset.name} изменён.`);
  }

  function selectedEffect() {
    const preset = activePreset();
    if (!preset || !state.selectedEffectKey) return null;
    return preset.recipe.effects.find(e => keyForEffect(e) === state.selectedEffectKey) || null;
  }

  function removeLayer(key) {
    const preset=activePreset();if(!preset)return;
    const index=preset.recipe.effects.findIndex(e=>keyForEffect(e)===key);if(index<0)return;
    const effect=preset.recipe.effects[index],title=prettyEffectName(effect);
    const history=state.removedLayers.get(preset.name) || [];
    history.push({effect,index,enabled:state.enabled.get(key),solo:state.soloKey===key});
    state.removedLayers.set(preset.name,history);
    preset.recipe.effects.splice(index,1);state.enabled.delete(key);
    if(state.soloKey===key)state.soloKey=null;
    if(state.selectedEffectKey===key){const next=preset.recipe.effects[Math.min(index,preset.recipe.effects.length-1)];state.selectedEffectKey=next?keyForEffect(next):null;}
    markDirty(preset.recipePath);renderStack();renderParameterEditor();refreshNoiseVideo();scheduleRender();
    setStatus(`${title} удалён из рецепта. Удаление можно отменить кнопкой «Вернуть слой».`);
  }

  function undoRemoveLayer() {
    const preset=activePreset(),history=preset && state.removedLayers.get(preset.name);
    if(!history?.length)return;
    const entry=history.pop(),key=keyForEffect(entry.effect);
    preset.recipe.effects.splice(Math.min(entry.index,preset.recipe.effects.length),0,entry.effect);
    state.enabled.set(key,entry.enabled!==false);state.selectedEffectKey=key;
    if(entry.solo && !state.soloKey)state.soloKey=key;
    markDirty(preset.recipePath);renderStack();renderParameterEditor();refreshNoiseVideo();scheduleRender();
    setStatus(`${prettyEffectName(entry.effect)} возвращён в рецепт.`);
  }

  function selectedResource() {
    const preset = activePreset();
    return preset?.resources.get(state.selectedEffectKey) || null;
  }

  function renderParameterEditor() {
    const effect = selectedEffect();
    const res = selectedResource();
    if (!effect || !res) {
      ui.selectedEffectTitle.textContent = effect ? prettyEffectName(effect) : 'Выбери слой';
      ui.parameterEditor.className = 'parameter-editor empty-params';
      ui.parameterEditor.innerHTML = '<div>Для этого слоя resource JSON не найден.</div>';
      ui.resetEffectBtn.disabled = true;
      ui.warningsBox.classList.add('hidden');
      return;
    }

    ui.selectedEffectTitle.textContent = prettyEffectName(effect);
    ui.resetEffectBtn.disabled = false;
    ui.parameterEditor.className = 'parameter-editor';
    ui.parameterEditor.innerHTML = '';

    const cfg = res.config;
    if(PosterizeTime.isSupported(cfg)) {
      const note=document.createElement('p');note.className='asset-control';
      note.textContent='Интенсивность 100% — 5 кадров/с. Чем ниже интенсивность, тем выше частота; 0% сохраняет все исходные кадры. Длительность и звук не меняются.';
      const cadence=cfg.shaderConfig.INPUTS.find(x=>x.NAME==='cadence');
      const label=document.createElement('label');label.className='parameter-group';label.style.display='grid';label.style.gap='8px';label.textContent='Интенсивность · %';
      const input=document.createElement('input');input.className='param-number';input.id='posterizeIntensity';input.setAttribute('aria-label','Интенсивность Posterize Time');input.type='number';input.min='0';input.max='100';input.step='1';input.value=cadence.MAX*100;
      const slider=document.createElement('input');slider.className='param-slider';slider.type='range';slider.min='0';slider.max='100';slider.step='1';slider.value=input.value;slider.setAttribute('aria-label','Интенсивность Posterize Time · ползунок');
      input.onchange=()=>{const value=Number(input.value);if(!Number.isFinite(value)||value<0||value>100){input.value=cadence.MAX*100;return;}cadence.MAX=cadence.DEFAULT=value/100;slider.value=input.value;markDirty(res.path);PosterizeTime.reset();updateEffectiveValues();scheduleRender();};
      slider.oninput=()=>{input.value=slider.value;input.onchange();};label.append(slider,input);ui.parameterEditor.append(label);
      const rate=document.createElement('output');rate.id='posterizeRate';
      const value=PosterizeTime.targetFps(PosterizeTime.resolve(cfg,state.userIntensity),PosterizeTime.fpsValue(cfg));rate.textContent=value===null?'Исходная частота':`${nice(value)} кадров/с`;
      ui.parameterEditor.append(note,rate);refreshWarningsOnly();return;
    }
    if(BloomContract.isSupported(cfg)) {
      appendBloomControls(res);refreshWarningsOnly();return;
    }
    if(effect.effectType==='isf' && SharpenRender.isSupported(cfg)){
      appendSharpenControls(res);refreshWarningsOnly();return;
    }
    if(effect.effectType==='bloomRework'){
      const note=document.createElement('p');note.className='asset-control';
      note.textContent='New Bloom · Metal v3: алгоритм совпадает с переданным разработчикам пакетом. Все параметры ниже сохраняются в JSON и ZIP. Галочка «Фиксировать» задаёт постоянное значение; без неё параметр меняется вместе с общей силой пресета.';
      ui.parameterEditor.append(note);
    }
    if (effect.effectType === 'overlay' || effect.effectType === 'lut') appendAssetControl(effect, res);
    const warnings = collectWarnings(cfg);
    if (warnings.length) {
      ui.warningsBox.innerHTML = warnings.map(w => `⚠ ${escapeHtml(w)}`).join('<br>');
      ui.warningsBox.classList.remove('hidden');
    } else {
      ui.warningsBox.classList.add('hidden');
      ui.warningsBox.innerHTML = '';
    }

    const nestedParams = parameterObjects(cfg);
    if (nestedParams.length) {
      const group = document.createElement('div');
      group.className = 'parameter-group';
      group.innerHTML = '<div class="group-label">APP VALUES</div>';
      for (const [name, obj] of nestedParams) {
        group.appendChild(makeNestedParamRow(name, obj, res));
        group.appendChild(makeIntensityControls(obj, res, name));
      }
      ui.parameterEditor.appendChild(group);
    }

    const topActual = typeof cfg.actualValue === 'number';
    if (topActual) {
      const group = document.createElement('div');
      group.className = 'parameter-group';
      group.innerHTML = '<div class="group-label">APP VALUE</div>';
      group.appendChild(makeTopActualRow(cfg, res));
      group.appendChild(makeIntensityControls(cfg, res));
      ui.parameterEditor.appendChild(group);
    }

    const extraEntries = Object.entries(cfg).filter(([k, v]) => {
      if (k === 'actualValue' || k === 'intensityMin' || k === 'intensityMax' || k === 'hardCoded') return false;
      if (v && typeof v === 'object' && !Array.isArray(v) && 'actualValue' in v) return false;
      return typeof v !== 'object';
    });
    if (extraEntries.length || typeof cfg.hardCoded === 'boolean') {
      const group = document.createElement('div');
      group.className = 'parameter-group';
      group.innerHTML = '<div class="group-label">RESOURCE SETTINGS</div>';
      if (typeof cfg.hardCoded === 'boolean') group.appendChild(makeTopHardcodedRow(cfg, res));
      for (const [name, value] of extraEntries) group.appendChild(makeExtraRow(name, value, cfg, res));
      ui.parameterEditor.appendChild(group);
    }
  }

  function makeNestedParamRow(name, obj, res) {
    const row = document.createElement('div');
    row.className = 'param-row';
    row.parameter=obj;row.dataset.parameterName=name;
    const min = Number(obj.intensityMin);
    const max = Number(obj.intensityMax);
    const actual = Number(obj.hardCoded ? obj.actualValue : obj.intensityMax);
    const [sliderMin, sliderMax] = controlBounds(name, res.config, actual);
    const step = stepFor(name, sliderMin, sliderMax);
    row.innerHTML = `
      <div class="param-head">
        <div class="param-name">${escapeHtml(prettyParamName(name))}</div>
        <div class="param-badges">
          <span class="mini-badge">${escapeHtml(name)}</span>
          <label class="mini-badge hc" title="Значение постоянно при любой общей силе. Снимите галочку, чтобы связать с общей силой."><input class="nested-hardcoded" type="checkbox" ${obj.hardCoded ? 'checked' : ''}> Фиксировать</label>
        </div>
      </div>
      <div class="param-sub">${obj.hardCoded?'Постоянное значение':'Настройка при 100% общей силы'}</div>
      <div class="param-control">
        <input class="param-slider" type="range" min="${sliderMin}" max="${sliderMax}" step="${step}" value="${actual}">
        <div class="number-wrap"><input class="param-number" type="number" step="${step}" value="${actual}"></div>
      </div>
      <div class="param-sub"><span>${escapeHtml(parameterRule(selectedEffect().effectType,name).text)}</span><span>step ${nice(step)}</span></div>
    `;
    const slider = row.querySelector('.param-slider');
    const number = row.querySelector('.param-number');
    const hc = row.querySelector('.nested-hardcoded');
    slider.disabled = number.disabled = false;
    const apply = (value) => {
      const v = Number(value);
      if (value==='' || !Number.isFinite(v)) return;
      obj.actualValue = v;
      if(!obj.hardCoded)obj.intensityMax=v;
      number.value = v;
      if (v >= Number(slider.min) && v <= Number(slider.max)) slider.value = v;
      markDirty(res.path);
      scheduleRender();
      refreshWarningsOnly();
      updateEffectiveValues();
    };
    slider.addEventListener('input', () => apply(slider.value));
    number.addEventListener('input', () => apply(number.value));
    number.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const fine = e.shiftKey ? step / 10 : step;
      apply(Number(number.value || 0) + dir * fine);
    });
    hc.addEventListener('change', () => {
      setParameterFixed(obj,hc.checked,selectedEffect().effectType,name);
      markDirty(res.path);
      renderParameterEditor();
      scheduleRender();
    });
    return row;
  }

  function makeTopActualRow(cfg, res) {
    const row = document.createElement('div');
    row.className = 'param-row';
    row.parameter=cfg;row.dataset.parameterName='intensity';
    const name = 'intensity';
    const min = Number(cfg.intensityMin);
    const max = Number(cfg.intensityMax);
    const isLut=selectedEffect()?.effectType==='lut';
    const actual = Number(cfg.hardCoded ? cfg.actualValue : cfg.intensityMax);
    const [sliderMin, sliderMax] = controlBounds(name, res.config, actual);
    const step = stepFor(name, sliderMin, sliderMax);
    row.innerHTML = `
      <div class="param-head"><div class="param-name">${isLut?'Интенсивность LUT':'Интенсивность'}</div><div class="param-badges"><span class="mini-badge">${cfg.hardCoded?'Постоянная':'При 100% общей силы'}</span></div></div>
      <div class="param-control">
        <input class="param-slider" type="range" min="${sliderMin}" max="${sliderMax}" step="${step}" value="${actual}">
        <div class="number-wrap"><input class="param-number" type="number" step="${step}" value="${actual}"></div>
      </div>
      <div class="param-sub"><span>${escapeHtml(parameterRule(selectedEffect().effectType,name).text)}</span><span>step ${nice(step)}</span></div>
    `;
    const slider = row.querySelector('.param-slider');
    const number = row.querySelector('.param-number');
    if(isLut){row.classList.add('lut-intensity-row');slider.id='lutIntensitySlider';number.id='lutIntensityNumber';}
    slider.disabled = number.disabled = false;
    const apply = (value) => {
      const v = Number(value);
      if (value==='' || !Number.isFinite(v)) return;
      cfg.actualValue = v;
      if(!cfg.hardCoded)cfg.intensityMax=v;
      number.value = v;
      if (v >= Number(slider.min) && v <= Number(slider.max)) slider.value = v;
      markDirty(res.path);
      scheduleRender();
      refreshWarningsOnly();
      updateEffectiveValues();
    };
    slider.addEventListener('input', () => apply(slider.value));
    number.addEventListener('input', () => apply(number.value));
    number.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const fine = e.shiftKey ? step / 10 : step;
      apply(Number(number.value || 0) + dir * fine);
    });
    return row;
  }

  function makeIntensityControls(obj, res, name='intensity') {
    const row = document.createElement('div');
    row.className = 'effective-controls';
    row.parameter=obj;row.dataset.parameterName=name;
    row.innerHTML = `<div class="param-sub">${obj.hardCoded ? 'Фиксированное: общая сила не меняет этот параметр.' : 'Ползунок выше задаёт значение при 100%. Общая сила меняет параметр между двумя значениями ниже.'}</div>
      <label>При 0% <input type="number" step="${stepFor('intensity', obj.intensityMin, obj.intensityMax)}" data-field="intensityMin" value="${obj.intensityMin}"></label>
      <label>При 100% <input type="number" step="${stepFor('intensity', obj.intensityMin, obj.intensityMax)}" data-field="intensityMax" value="${obj.intensityMax}"></label>
      <strong class="effective-value"></strong>`;
    row.querySelector('.effective-value').parameter = obj;
    row.querySelector('.effective-value').textContent = `Применяется: ${nice(MovaviRender.parameter(obj, state.userIntensity))}`;
    row.querySelectorAll('input').forEach(input => {
      input.disabled = obj.hardCoded;
      input.addEventListener('input', () => {
        if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
        obj[input.dataset.field] = input.valueAsNumber;
        markDirty(res.path); updateEffectiveValues(); refreshWarningsOnly(); scheduleRender();
      });
    });
    return row;
  }

  function updateEffectiveValues() {
    const res=selectedResource(),rate=$('#posterizeRate');if(rate&&PosterizeTime.isSupported(res?.config)){const value=PosterizeTime.targetFps(PosterizeTime.resolve(res.config,state.userIntensity));rate.textContent=value===null?'Исходная частота':`${nice(value)} кадров/с`;}
    document.querySelectorAll('.effective-value').forEach(el => {
      el.textContent = `Применяется: ${nice(MovaviRender.parameter(el.parameter, state.userIntensity))}`;
    });
    $$('#parameterEditor .param-row').forEach(row=>{
      const obj=row.parameter;if(!obj)return;
      const value=obj.hardCoded?obj.actualValue:obj.intensityMax;
      const slider=row.querySelector('.param-slider'),number=row.querySelector('.param-number');
      if(slider){const bounds=controlBounds(row.dataset.parameterName,selectedResource().config,value);slider.min=bounds[0];slider.max=bounds[1];slider.value=value;}
      if(number && document.activeElement!==number)number.value=value;
    });
    $$('#parameterEditor .effective-controls').forEach(row=>{
      if(!row.parameter)return;
      row.querySelectorAll('input[data-field]').forEach(input=>{if(document.activeElement!==input)input.value=row.parameter[input.dataset.field];});
    });
  }

  function makeTopHardcodedRow(cfg, res) {
    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.innerHTML = `<div><div class="param-name">Фиксировать значение</div><div class="param-sub">Включено — постоянно. Выключено — от общей силы.</div></div><label class="toggle"><input type="checkbox" ${cfg.hardCoded ? 'checked' : ''}></label>`;
    row.querySelector('input').addEventListener('change', (e) => {
      setParameterFixed(cfg,e.target.checked,selectedEffect().effectType,'intensity');
      markDirty(res.path);
      renderParameterEditor();
      scheduleRender();
    });
    return row;
  }

  function makeExtraRow(name, value, cfg, res) {
    const row = document.createElement('div');
    if(name==='interpolateMode' && selectedEffect()?.effectType==='lut') {
      row.className='text-row';
      row.innerHTML='<div><div class="param-name">Интерполяция LUT</div><div class="param-sub">Режим мобильного приложения</div></div><div class="readonly-value">Trilinear</div>';
      return row;
    }
    const editableSelects = {
      blendMode: ['source over', 'screen', 'overlay', 'multiply', 'linear dodge', 'soft light', 'darken', 'lighten', 'color dodge', 'color burn', 'hard light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'],
      binding: ['center', 'top_right', 'top_Left', 'right_center', 'left_center', 'top_center', 'bottom_center', 'bottom_right', 'bottom_left'],
      interpolateMode: ['Trilinear', 'Tetrahedral', 'Nearest']
    };
    if (editableSelects[name]) {
      row.className = 'select-row';
      const options = [...new Set([String(value), ...editableSelects[name]])];
      row.innerHTML = `<div><div class="param-name">${escapeHtml(prettyParamName(name))}</div><div class="param-sub">${escapeHtml(name)}</div></div><select>${options.map(v => `<option ${v === String(value) ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>`;
      row.querySelector('select').addEventListener('change', (e) => {
        cfg[name] = e.target.value;
        markDirty(res.path);
        if (name === 'filename') refreshNoiseVideo();
        scheduleRender();
      });
    } else {
      row.className = 'text-row';
      row.innerHTML = `<div><div class="param-name">${escapeHtml(prettyParamName(name))}</div><div class="param-sub">${escapeHtml(name)}</div></div><div class="readonly-value">${escapeHtml(String(value))}</div>`;
    }
    return row;
  }

  function refreshWarningsOnly() {
    const res = selectedResource();
    if (!res) return;
    const warnings = collectWarnings(res.config);
    if (warnings.length) {
      ui.warningsBox.innerHTML = warnings.map(w => `⚠ ${escapeHtml(w)}`).join('<br>');
      ui.warningsBox.classList.remove('hidden');
    } else {
      ui.warningsBox.classList.add('hidden');
    }
  }

  function collectWarnings(cfg) {
    const out = selectedEffect() ? configIssues(selectedEffect(), cfg) : [];
    if(selectedEffect()?.effectType==='isf' && !SharpenRender.isSupported(cfg) && !BloomContract.isSupported(cfg) && !PosterizeTime.isSupported(cfg))out.push('ISF-код берётся из ISF_METAL внутри приложения. Preview этого ISF не реализован.');
    if(PosterizeTime.isSupported(cfg))out.push('Posterize Time: новый шейдер. Перед использованием на телефоне разработчику нужно добавить .ps/.vs в ISF_METAL и проверить перемотку.');
    if(['vhsDistortion','softBlur','noiseLeeCranston'].includes(selectedEffect()?.effectType))out.push('Предпросмотр этого эффекта приблизительный. При экспорте сохраняются штатный мобильный effectType и его параметры.');
    else if(selectedEffect() && !['overlay','lut','bloom','bloomRework','isf','chromaticAberration','adjust'].includes(selectedEffect().effectType) && !ExtraEffects.supports(selectedEffect().effectType))out.push('Этот тип будет сохранён для Movavi. В браузере его preview пока не реализован.');
    if (selectedEffect()?.effectType==='bloom' && cfg.threshold && cfg.radius && cfg.intensity) {
      const diagnostic = MovaviRender.bloomDiagnostics(MovaviRender.resolve(cfg, state.userIntensity));
      out.push(...diagnostic.errors, ...diagnostic.notes);
    }
    const check = (label, obj) => {
      if (!obj || typeof obj.actualValue !== 'number') return;
      const min = Number(obj.intensityMin), max = Number(obj.intensityMax), v = Number(obj.actualValue);
      const applied = MovaviRender.parameter(obj, state.userIntensity);
      if ((cfg.filename || cfg.strength && cfg.overlap) && (applied < 0 || applied > 1)) out.push(`${label}: сейчас ${nice(applied)}, но движок допускает только 0 … 1. Исходный JSON не обрезан.`);
      if (Number.isFinite(min) && Number.isFinite(max) && min > max) out.push(`${label}: при увеличении общей силы значение уменьшается с ${nice(min)} до ${nice(max)} — это допустимо.`);

    };
    if (typeof cfg.actualValue === 'number') check('Intensity', cfg);
    for (const [name, v] of Object.entries(cfg)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && 'actualValue' in v) check(prettyParamName(name), v);
    }
    return out;
  }

  function controlBounds(name, cfg, actual) {
    if(BloomContract.isSupported(cfg))return [Math.min(0,actual),Math.max(({threshold:1,intensity:1,radius:300,knee:1,scatter:2,opacity:1})[name] ?? 1,actual)];
    // Author intensityMin/Max are interpolation endpoints, never slider limits.
    if(selectedEffect()?.effectType==='bloomRework')return [0,Math.max(({threshold:1,intensity:5,radius:300,knee:1,scatter:2,opacity:1})[name] ?? 1,actual)];
    if(selectedEffect()?.effectType==='isf' && SharpenRender.isSupported(cfg))return [0,Math.max(name==='stepSize' ? .02 : 2,actual)];
    if (name === 'depth' && cfg.softness) return [Math.min(1,actual),Math.max(10,actual)];
    if (name === 'blurAmount') return [0, Math.max(5, actual)];
    if (name === 'radius') return [0, Math.max(100, actual)];
    if (name === 'intensity' && cfg.threshold && cfg.radius) return [0, Math.max(2, actual)];
    return [Math.min(0, actual), Math.max(1, actual)];
  }

  function stepFor(name, min, max) {
    const range = Math.abs(max - min);
    if (/radius/i.test(name)) return 1;
    if (range <= 0.05) return 0.0001;
    if (range <= 0.2) return 0.0005;
    if (range <= 2) return 0.001;
    if (range <= 20) return 0.01;
    return 0.1;
  }

  function prettyParamName(name) {
    const labels = {
      sharpenAmount: 'Сила резкости', stepSize: 'Размер детали',
      threshold: 'Threshold', intensity: 'Intensity', radius: 'Radius', strength: 'Strength', overlap: 'Overlap',
      saturation: 'Saturation', temperature: 'Temperature', hue: 'Hue', colorTone: 'Color Tone', brightness: 'Brightness',
      exposure: 'Exposure', contrast: 'Contrast', highlights: 'Highlights', shadows: 'Shadows', whitePoint: 'White Point',
      blackPoint: 'Black Point', blendMode: 'Blend Mode', binding: 'Binding', interpolateMode: 'Interpolation',
      templateID: 'Template ID', filename: 'Overlay File'
    };
    return labels[name] || name.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
  }

  function markDirty(path) {
    state.dirtyPaths.add(path);
    updateDirtyUI();
  }

  async function saveDirtyJson() {
    if (!state.rootHandle || !state.dirtyPaths.size) return;
    try {
      syncManifest();
      const issues=[...state.presets.values()].flatMap(presetIssues);
      if(issues.length)throw new Error('Исправьте перед сохранением:\n'+issues.join('\n'));
      setStatus('Сохраняю изменённые JSON…');
      const recipes=new Set([...state.presets.values()].map(p=>p.recipePath));
      for (const path of [...state.dirtyPaths].sort((a,b)=>Number(recipes.has(a))-Number(recipes.has(b)))) {
        const rec = state.files.get(path);
        if (!rec) throw new Error(`Нет файла ${path}`);
        if (!rec.handle) {
          const parts = path.split('/'); let dir = state.rootHandle;
          for (const part of parts.slice(0,-1)) dir = await dir.getDirectoryHandle(part, {create:true});
          rec.handle = await dir.getFileHandle(parts.at(-1), {create:true});
        }
        let obj = null;
        const preset = [...state.presets.values()].find(p => p.recipePath === path || [...p.resources.values()].some(r => r.path === path));
        if (preset?.recipePath === path) obj = preset.recipe;
        else if (preset) obj = productionResourceConfig(preset,[...preset.resources.values()].find(r => r.path === path));
        else if(path===state.manifestPath)obj=state.manifest;

        const writable = await rec.handle.createWritable();
        await writable.write(obj ? JSON.stringify(obj, null, 4) + '\n' : rec.file);
        await writable.close();
        rec.file = await rec.handle.getFile();
      }
      state.dirtyPaths.clear();
      for (const p of state.presets.values()) {
        p.originalRecipe = deepClone(p.recipe);
        for (const r of p.resources.values()) r.original = deepClone(r.config);
      }
      updateDirtyUI();
      setStatus('JSON сохранены в исходную сборку.');
    } catch (err) {
      console.error(err);
      setStatus(`Ошибка сохранения: ${err.message}`);
      alert(err.message);
    }
  }

  function neutralParameterValue(type,name,obj) {
    if(type==='adjust')return .5;
    if(type==='bloomRework')return name==='threshold'?1:0;
    if(type==='chromaticAberration')return name==='overlap'?1:0;
    if(type==='lut' || type==='overlay')return 0;
    if(type==='isf' && ['sharpenAmount','stepSize'].includes(name))return 0;
    if(type==='softBlur')return name==='depth'?1:0;
    if(['noiseLeeCranston','vhsDistortion'].includes(type))return 0;
    return Number(obj.intensityMin);
  }

  function setParameterFixed(obj,fixed,type,name) {
    if(fixed===obj.hardCoded)return;
    if(fixed)obj.actualValue=MovaviRender.parameter(obj,state.userIntensity);
    else {
      const target=Number(obj.actualValue);
      obj.intensityMin=neutralParameterValue(type,name,obj);
      obj.intensityMax=target;
    }
    obj.hardCoded=fixed;
  }

  function sharpenParameterObjects(cfg) {
    return ['sharpenAmount','stepSize'].flatMap(name=>{
      const input=cfg.shaderConfig.INPUTS.find(p=>p.NAME===name);if(!input)return [];
      const adapter={};
      for(const [key,field] of [['actualValue','DEFAULT'],['intensityMin','MIN'],['intensityMax','MAX']])Object.defineProperty(adapter,key,{enumerable:true,get:()=>input[field],set:v=>{input[field]=v;}});
      Object.defineProperty(adapter,'hardCoded',{enumerable:true,get:()=>!cfg.intensityParamNames.includes(name),set:fixed=>{
        cfg.intensityParamNames=cfg.intensityParamNames.filter(n=>n!==name);
        if(!fixed)cfg.intensityParamNames.push(name);
      }});
      return [[name,adapter]];
    });
  }

  function bloomParameterObjects(cfg) {
    return cfg.shaderConfig.INPUTS.filter(p=>BloomContract.names.includes(p.NAME)).map(input=>{
      const adapter={};
      for(const [key,field] of [['actualValue','DEFAULT'],['intensityMin','MIN'],['intensityMax','MAX']])Object.defineProperty(adapter,key,{enumerable:true,get:()=>input[field],set:value=>{input[field]=value;}});
      Object.defineProperty(adapter,'hardCoded',{enumerable:true,get:()=>!cfg.intensityParamNames.includes(input.NAME),set:fixed=>{cfg.intensityParamNames=cfg.intensityParamNames.filter(n=>n!==input.NAME);if(!fixed)cfg.intensityParamNames.push(input.NAME);}});
      return [input.NAME,adapter];
    });
  }

  function neutralizeAtZero() {
    const preset=activePreset();if(!preset)return;
    let changed=0;
    for(const effect of preset.recipe.effects) {
      const res=preset.resources.get(keyForEffect(effect));if(!res)continue;
      const cfg=res.config;
      const params=BloomContract.isSupported(cfg)?bloomParameterObjects(cfg):effect.effectType==='isf' && SharpenRender.isSupported(cfg)?sharpenParameterObjects(cfg):typeof cfg.actualValue==='number'?[['intensity',cfg]]:parameterObjects(cfg);
      let touched=false;
      for(const [name,obj] of params) {
        if(obj.hardCoded)continue;
        const neutral=BloomContract.isSupported(cfg)?(name==='threshold'?1:0):neutralParameterValue(effect.effectType,name,obj);
        if(obj.intensityMin!==neutral){obj.intensityMin=neutral;touched=true;changed++;}
      }
      if(touched)markDirty(res.path);
    }
    renderParameterEditor();scheduleRender();
    setStatus(changed?`Для ${changed} связанных параметров настроены нейтральные значения при 0%. Фиксированные параметры сохранены.`:'Связанные параметры уже имеют нейтральные значения при 0%.');
  }

  function standardLayerConfig(effect,current,opened) {
    const cfg=deepClone(current),type=effect.effectType;
    if(BloomContract.isSupported(cfg))return deepClone(opened);
    const param=(value,neutral=value,fixed=false)=>({actualValue:value,intensityMin:neutral,intensityMax:value,hardCoded:fixed});
    if(type==='adjust') {
      for(const name of requiredParams.adjust)cfg[name]=param(.5);
    } else if(type==='bloomRework') {
      for(const [name,value] of Object.entries({threshold:.3,intensity:.8,radius:75,knee:.5,scatter:.65,opacity:1}))cfg[name]=param(value,name==='intensity'?0:value,name!=='intensity');
    } else if(type==='chromaticAberration') {
      cfg.strength=param(.015,0);cfg.overlap=param(.3,.3,true);
    } else if(type==='lut') {
      Object.assign(cfg,param(1,0));cfg.interpolateMode='Trilinear';
    } else if(type==='overlay') {
      Object.assign(cfg,param(.2,0));cfg.binding='center';cfg.blendMode='screen';
    } else if(type==='isf' && SharpenRender.isSupported(cfg)) {
      return {...cfg,...deepClone(window.SharpenAssets.config)};
    } else return deepClone(opened);
    return cfg;
  }

  function resetSelectedEffect() {
    const res = selectedResource();
    if (!res) return;
    res.config = standardLayerConfig(selectedEffect(),res.config,res.original);
    const preset = activePreset();
    preset.resources.set(state.selectedEffectKey, res);
    markDirty(res.path);
    renderParameterEditor();
    refreshNoiseVideo();
    scheduleRender();
    const known=['adjust','bloomRework','chromaticAberration','lut','overlay'].includes(selectedEffect().effectType) || (selectedEffect().effectType==='isf' && SharpenRender.isSupported(res.config));
    setStatus(known?`${ui.selectedEffectTitle.textContent}: восстановлены стандартные настройки слоя.`:'Для этого типа стандартные настройки не описаны: восстановлены исходные значения из JSON.');
  }

  function updateMediaLibraryUI() {
    const entries=state.mediaLibrary,index=entries.findIndex(e=>e.id===state.activeMediaId);
    $('#mediaLibraryBar').hidden=!entries.length;
    ui.mediaSelect.replaceChildren(...entries.map((entry,i)=>new Option(`${i+1}. ${entry.file.name}`,entry.id)));
    ui.mediaSelect.value=state.activeMediaId || '';
    ui.previousMediaBtn.disabled=index<=0;
    ui.nextMediaBtn.disabled=index<0 || index>=entries.length-1;
    $('#mediaPosition').textContent=index<0?'':`${index+1} / ${entries.length}`;
  }

  async function selectMedia(id) {
    const entry=state.mediaLibrary.find(e=>e.id===id);if(!entry)return;
    state.activeMediaId=id;updateMediaLibraryUI();
    try {await loadMedia(entry.file);}
    catch(err){if(state.activeMediaId===id)setStatus(`Не удалось открыть ${entry.file.name}: ${err?.message || 'кодек не поддерживается'}`);}
  }

  async function addMediaFiles(files) {
    if(!files.length)return;
    const additions=files.map(file=>({id:`media-${++state.mediaSequence}`,file}));
    state.mediaLibrary.push(...additions);
    await selectMedia(additions[0].id);
  }

  async function loadMedia(file) {
    if (!file) return;
    PosterizeTime.reset();
    const version=++state.mediaLoadVersion;
    state.mediaLoadAbort?.abort();
    const controller=new AbortController();state.mediaLoadAbort=controller;
    const current=()=>version===state.mediaLoadVersion;
    ui.sourceVideo.pause();state.isPlaying=false;cancelAnimationFrame(state.videoLoopId);
    ui.playPauseBtn.disabled=true;ui.playPauseBtn.textContent='Play';
    for(const entry of state.overlays.values())entry.video?.pause();
    if (state.sourceObjectUrl) URL.revokeObjectURL(state.sourceObjectUrl);
    state.sourceObjectUrl = URL.createObjectURL(file);
    ui.previewStage.classList.remove('empty');
    ui.emptyPreview.style.display = 'none';
    state.sourceImage=null;
    setStatus(`Загружаю: ${file.name}…`);
    $('#exportVideoBtn').disabled=true;
    if (file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogv|avi|mkv)$/i.test(file.name)) {
      state.sourceKind = 'video';
      ui.sourceVideo.onloadeddata=()=>{if(current()){scheduleRender();updateVideoExportUI();}};
      const metadata=new Promise((resolve,reject)=>{
        const cleanup=()=>{ui.sourceVideo.removeEventListener('loadedmetadata',ready);ui.sourceVideo.removeEventListener('error',failed);controller.signal.removeEventListener('abort',cancelled);};
        const ready=()=>{cleanup();resolve(true);};
        const failed=()=>{cleanup();reject(Error('Браузер не смог прочитать видео. Попробуйте MP4 H.264.'));};
        const cancelled=()=>{cleanup();resolve(false);};
        ui.sourceVideo.addEventListener('loadedmetadata',ready,{once:true});
        ui.sourceVideo.addEventListener('error',failed,{once:true});
        controller.signal.addEventListener('abort',cancelled,{once:true});
      });
      ui.sourceVideo.src = state.sourceObjectUrl;ui.sourceVideo.load();
      if(!await metadata || !current())return;
      ui.playPauseBtn.disabled=false;scheduleRender();updateVideoExportUI();
      try {
        await ui.sourceVideo.play();
        if(!current())return;
        state.isPlaying=true;ui.playPauseBtn.textContent='Pause';
        for(const entry of state.overlays.values())entry.video?.play().catch(()=>{});
        startVideoLoop();setStatus(`Видео играет: ${file.name}`);
      } catch {
        if(!current())return;
        state.isPlaying=false;ui.playPauseBtn.textContent='Play';
        setStatus('Видео загружено. Браузер ограничил автозапуск — нажмите Play.');
      }
    } else {
      state.sourceKind='image';
      ui.sourceVideo.onloadeddata=null;ui.sourceVideo.removeAttribute('src');ui.sourceVideo.load();
      const img=new Image();img.src=state.sourceObjectUrl;
      try{await img.decode();}catch(err){if(!current())return;throw err;}
      if(!current())return;
      state.sourceImage=img;scheduleRender();setStatus(`Фото загружено: ${file.name}`);
    }
  }

  function togglePlayback() {
    if (state.sourceKind !== 'video') return;
    if (ui.sourceVideo.paused) {
      ui.sourceVideo.play();
      for (const entry of state.overlays.values()) entry.video?.play().catch(() => {});
      state.isPlaying = true;
      ui.playPauseBtn.textContent = 'Pause';
      startVideoLoop();
    } else {
      ui.sourceVideo.pause();
      for (const entry of state.overlays.values()) entry.video?.pause();
      state.isPlaying = false;
      ui.playPauseBtn.textContent = 'Play';
      scheduleRender();
    }
  }

  function startVideoLoop() {
    cancelAnimationFrame(state.videoLoopId);
    const loop = () => {
      if (!state.isPlaying) return;
      renderPreview();
      state.videoLoopId = requestAnimationFrame(loop);
    };
    state.videoLoopId = requestAnimationFrame(loop);
  }

  function scheduleRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      renderPreview();
    });
  }

  function previewDimensions() {
    const source = state.sourceKind === 'image' ? state.sourceImage : ui.sourceVideo;
    const w = source?.naturalWidth || source?.videoWidth || 640;
    const h = source?.naturalHeight || source?.videoHeight || 360;
    // Fixed processing size and source aspect: window resizing must not change the effect.
    const scale = Math.min(1, 960 / Math.max(w, h));
    return [Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale))];
  }

  function ensureCanvasSizes() {
    const [w, h] = previewDimensions();
    // Processing resolution is independent of the available preview box.
    for (const c of [ui.beforeCanvas, ui.afterCanvas, ui.workA, ui.workB, ui.workC]) {
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }
    return [w, h];
  }

  function drawSource(canvas, w, h) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    let source = null, sw = 0, sh = 0;
    if (state.sourceKind === 'image' && state.sourceImage) {
      source = state.sourceImage; sw = source.naturalWidth; sh = source.naturalHeight;
    } else if (state.sourceKind === 'video' && ui.sourceVideo.readyState >= 2) {
      source = ui.sourceVideo; sw = source.videoWidth; sh = source.videoHeight;
    }
    if (!source || !sw || !sh) return null;
    const scale = Math.min(w / sw, h / sh);
    const dw = sw * scale, dh = sh * scale;
    const dx = (w - dw) / 2, dy = (h - dh) / 2;
    ctx.drawImage(source, dx, dy, dw, dh);
    return { dx, dy, dw, dh };
  }

  function copyCanvas(src, dst) {
    const ctx = dst.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, dst.width, dst.height);
    ctx.drawImage(src, 0, 0);
  }

  async function renderPreview() {
    if (state.videoExporting) return;
    if (state.renderBusy) { state.renderAgain = true; return; }
    state.renderBusy = true;
    try { await renderPreviewFrame(); }
    finally {
      state.renderBusy = false;
      if (state.renderAgain) { state.renderAgain = false; scheduleRender(); }
    }
  }

  async function renderPreviewFrame(beforeOnly = false) {
    if (!state.sourceKind) return;
    const preset = activePreset();
    for (const entry of state.overlays.values()) {
      const v=entry.video;
      if(v?.readyState>=2 && Number.isFinite(v.duration) && v.duration>0) {
        const time=state.sourceKind==='video' ? ui.sourceVideo.currentTime % v.duration : 0;
        if(!state.videoExporting && !v.seeking && Math.abs(v.currentTime-time)>.12)v.currentTime=time;
      }
    }
    const [w, h] = ensureCanvasSizes();
    const mediaRect = drawSource(ui.workA, w, h);
    if (!mediaRect) return;
    copyCanvas(ui.workA, ui.beforeCanvas);

    let input = ui.workA, output = ui.workB;
    const errors = [];
    for (const effect of beforeOnly ? [] : preset?.recipe.effects || []) {
      const key = keyForEffect(effect);
      if (!state.enabled.get(key)) continue;
      if (state.soloKey && state.soloKey !== key) continue;
      const res = preset.resources.get(key);
      if (!res) continue;
      if (effect.effectType === 'overlay' && state.userIntensity <= 0) continue;
      const resolvedConfig = MovaviRender.resolve(res.config, state.userIntensity);
      let handled = false;
      try {
        if (effect.effectType === 'adjust') { applyAdjust(input, output, resolvedConfig); handled = true; }
        else if (effect.effectType === 'chromaticAberration') { applyAberration(input, output, resolvedConfig); handled = true; }
        else if (ExtraEffects.supports(effect.effectType)) {ExtraEffects.render(input,output,effect.effectType,resolvedConfig,state.sourceKind==='video'?ui.sourceVideo.currentTime:0);handled=true;}
        else if (BloomContract.isSupported(res.config)) { const bloom=BloomContract.preview(res.config,state.userIntensity);BloomRework.render(input,output,bloom,{knee:bloom.knee.actualValue,scatter:bloom.scatter.actualValue,opacity:bloom.opacity.actualValue});handled=true; }
        else if (effect.effectType === 'isf' && SharpenRender.isSupported(res.config)) {SharpenRender.render(input,output,res.config,state.userIntensity);handled=true;}
        else if (effect.effectType === 'isf' && PosterizeTime.isSupported(res.config)) {
          if(state.sourceKind!=='video')PosterizeTime.reset();
          PosterizeTime.render(input,output,res.config,state.userIntensity,{time:state.sourceKind==='video'?ui.sourceVideo.currentTime:0,token:state.activeMediaId});handled=true;
          const rate=$('#posterizeRate'),value=PosterizeTime.targetFps(PosterizeTime.resolve(res.config,state.userIntensity),PosterizeTime.fpsValue(res.config));
          if(rate)rate.textContent=value===null?'Исходная частота':`${nice(value)} кадров/с`;
        }
        else if (effect.effectType === 'overlay') { applyOverlay(input, output, resolvedConfig, mediaRect, key); handled = true; }
        else if (effect.effectType === 'lut') {
          const lut = await getLutForEffect(preset, effect);
          if (!lut) throw new Error('Не найден .cube: выберите ресурс слоя');
          applyLut(input, output, resolvedConfig, lut); handled = true;
        }
        if (!handled) throw new Error(`v0.12: preview не поддерживает effectType=${effect.effectType}${res.config.shaderPath ? ', shaderPath='+res.config.shaderPath : ''}. Ресурс сохранится при экспорте.`);
      } catch (err) {
        console.warn('Preview stage failed', effect, err);
        errors.push(`${prettyEffectName(effect)} не применён: ${err.message}`);
      }
      if (!handled) copyCanvas(input, output);
      [input, output] = [output, input];
    }
    copyCanvas(input, ui.afterCanvas);
    $('#renderErrors').textContent = errors.join(' · ');
    applyCompareMode();
    return errors;
  }

  function applyCompareMode() {
    $$('.compare-tab').forEach(b => b.classList.toggle('active', b.dataset.mode === state.compareMode));
    if (state.compareMode === 'before') {
      ui.afterCanvas.style.clipPath = 'inset(0 100% 0 0)';
      ui.splitLine.style.display = 'none';
    } else if (state.compareMode === 'after') {
      ui.afterCanvas.style.clipPath = 'inset(0 0 0 0)';
      ui.splitLine.style.display = 'none';
    } else {
      ui.afterCanvas.style.clipPath = `inset(0 0 0 ${state.split}%)`;
      ui.splitLine.style.display = '';
      ui.splitLine.style.left = `${state.split}%`;
    }
  }

  function applyAdjust(input, output, cfg) {
    AdjustMobile.render(input, output, cfg);
  }

  function applyAberration(input, output, cfg) {
    MovaviRender.aberration(input, output, cfg);
  }

  function applyOverlay(input, output, cfg, mediaRect, key) {
    copyCanvas(input, output);
    const entry = state.overlays.get(key);
    if (!entry?.video || entry.video.readyState < 2) throw new Error(entry?.status || 'Файл оверлея не загружен');
    const ctx=output.getContext('2d',{willReadFrequently:true});
    const alpha=clamp(Number(cfg.actualValue ?? .2),0,1);
    const mode=String(cfg.blendMode || 'screen');
    const blendMap={'source over':'source-over',screen:'screen',overlay:'overlay',multiply:'multiply','linear dodge':'lighter','soft light':'soft-light','hard light':'hard-light','color dodge':'color-dodge','color burn':'color-burn',darken:'darken',lighten:'lighten',difference:'difference',exclusion:'exclusion',hue:'hue',saturation:'saturation',color:'color',luminosity:'luminosity'};
    if (!blendMap[mode]) throw new Error(`Режим ${mode} сохранён для Movavi; preview этого режима не реализован`);
    ctx.save();
    ctx.globalAlpha=alpha;
    ctx.globalCompositeOperation=blendMap[mode] || 'screen';
    const v=entry.video;
    const rect=mediaRect || {dx:0,dy:0,dw:output.width,dh:output.height};
    const binding=String(cfg.binding || 'center');
    const sw=v.videoWidth||rect.dw, sh=v.videoHeight||rect.dh;
    const scale=Math.max(rect.dw/sw,rect.dh/sh), dw=sw*scale, dh=sh*scale;
    const anchor= binding.toLowerCase();
    const x=anchor.includes('left')?0:anchor.includes('right')?1:.5;
    const y=anchor.includes('top')?0:anchor.includes('bottom')?1:.5;
    ctx.beginPath();ctx.rect(rect.dx,rect.dy,rect.dw,rect.dh);ctx.clip();
    ctx.drawImage(v,rect.dx+(rect.dw-dw)*x,rect.dy+(rect.dh-dh)*y,dw,dh);
    ctx.restore();
  }

  function findLutBinding(preset, effect) {
    const res = preset?.resources.get(keyForEffect(effect));
    const assigned = res && state.lutAssignments.get(res.path);
    if (assigned && state.files.has(assigned.path)) return assigned;
    const prefix = `${preset.rootPath}/resources/`.toLowerCase();
    const cubes = [...state.files.keys()].filter(path => {
      const lower = path.toLowerCase();
      return lower.startsWith(prefix) && lower.endsWith('.cube') && !path.split('/').pop().startsWith('._');
    });
    const expected = [effect.effectName, res?.config?.templateID]
      .filter(Boolean).map(name => `${prefix}${String(name).replace(/\.cube$/i, '')}.cube`);
    const path = cubes.find(candidate => expected.includes(candidate.toLowerCase())) || (cubes.length === 1 ? cubes[0] : null);
    return path ? {path, fileName: path.split('/').pop(), lut: null} : null;
  }

  async function getLutForEffect(preset, effect) {
    const binding = findLutBinding(preset, effect);
    if (!binding) return null;
    if (binding.lut) return binding.lut;
    if (state.lutCache.has(binding.path)) return state.lutCache.get(binding.path);
    const text = await state.files.get(binding.path).file.text();
    const lut = parseCube(text);
    state.lutCache.set(binding.path,lut);
    return lut;
  }

  function parseCube(text) {
    let size=0, domainMin=[0,0,0], domainMax=[1,1,1];
    const data=[];
    for (const raw of text.split(/\r?\n/)) {
      const line=raw.replace(/^\uFEFF/, '').trim();
      if(!line || line.startsWith('#')) continue;
      const parts=line.split(/\s+/);
      const head=parts[0].toUpperCase();
      if(head==='LUT_3D_SIZE'){size=parseInt(parts[1],10);continue;}
      if(head==='DOMAIN_MIN'){domainMin=parts.slice(1,4).map(Number);continue;}
      if(head==='DOMAIN_MAX'){domainMax=parts.slice(1,4).map(Number);continue;}
      if(['TITLE','LUT_1D_SIZE'].includes(head)) continue;
      if(parts.length>=3 && parts.slice(0,3).every(v=>Number.isFinite(Number(v)))) data.push(parts.slice(0,3).map(Number));
    }
    if(!size) size=Math.round(Math.cbrt(data.length));
    if(!Number.isInteger(size) || size < 2 || data.length < size*size*size) throw new Error('Некорректный .cube LUT: не найдена полная 3D-таблица');
    return {size,domainMin,domainMax,data};
  }

  function applyLut(input, output, cfg, lut) {
    const inCtx=input.getContext('2d',{willReadFrequently:true});
    const outCtx=output.getContext('2d',{willReadFrequently:true});
    const img=inCtx.getImageData(0,0,input.width,input.height);
    const d=img.data, n=lut.size, arr=lut.data;
    const intensity=Number(cfg.actualValue ?? 1);
    const idx=(r,g,b)=>r + g*n + b*n*n; // .cube: red changes fastest
    for(let i=0;i<d.length;i+=4){
      // EffectsCollection.metal: cubeTexture.sample(sNorm, srcColor.rgb).
      // Normalized hardware coordinates address texel centers at (i+.5)/n.
      const rr=clamp(d[i]/255*n-.5,0,n-1), gg=clamp(d[i+1]/255*n-.5,0,n-1), bb=clamp(d[i+2]/255*n-.5,0,n-1);
      const r0=Math.floor(rr),g0=Math.floor(gg),b0=Math.floor(bb),r1=Math.min(r0+1,n-1),g1=Math.min(g0+1,n-1),b1=Math.min(b0+1,n-1);
      const tr=rr-r0,tg=gg-g0,tb=bb-b0;
      const c000=arr[idx(r0,g0,b0)], c100=arr[idx(r1,g0,b0)], c010=arr[idx(r0,g1,b0)], c110=arr[idx(r1,g1,b0)], c001=arr[idx(r0,g0,b1)], c101=arr[idx(r1,g0,b1)], c011=arr[idx(r0,g1,b1)], c111=arr[idx(r1,g1,b1)];
      for(let ch=0;ch<3;ch++){
        const c00=c000[ch]*(1-tr)+c100[ch]*tr, c10=c010[ch]*(1-tr)+c110[ch]*tr, c01=c001[ch]*(1-tr)+c101[ch]*tr, c11=c011[ch]*(1-tr)+c111[ch]*tr;
        const c0=c00*(1-tg)+c10*tg, c1=c01*(1-tg)+c11*tg;
        const v=(c0*(1-tb)+c1*tb)*255;
        d[i+ch]=clamp(d[i+ch]*(1-intensity)+v*intensity,0,255);
      }
    }
    outCtx.putImageData(img,0,0);
  }

  function overlayPath(preset, cfg) {
    const base = String(cfg.filename || '');
    const target = `${preset.rootPath}/resources/${base}`.toLowerCase();
    return [...state.files.keys()].find(p => p.toLowerCase() === target || ['.mp4','.mov'].some(ext => p.toLowerCase() === target + ext));
  }

  async function refreshNoiseVideo() {
    for (const entry of state.overlays.values()) {
      if (entry.video) { entry.video.pause(); entry.video.removeAttribute('src'); entry.video.load(); }
      if (entry.url) URL.revokeObjectURL(entry.url);
    }
    state.overlays.clear();
    const preset = activePreset(); if (!preset) return;
    for (const effect of preset.recipe.effects.filter(e => e.effectType === 'overlay')) {
      const key = keyForEffect(effect), cfg = preset.resources.get(key)?.config;
      const path = cfg && overlayPath(preset, cfg);
      const entry = {status: path ? 'Загрузка оверлея…' : `Не найден resources/${cfg?.filename || effect.effectName}.mp4 / .mov. Выберите файл оверлея.`};
      state.overlays.set(key, entry);
      if (!path) continue;
      const video = document.createElement('video');
      Object.assign(video, {muted:true, loop:true, playsInline:true, preload:'auto'});
      entry.video = video; entry.url = URL.createObjectURL(state.files.get(path).file); entry.path = path;
      video.onloadeddata = () => {
        if (state.overlays.get(key) !== entry) return;
        entry.status = `Загружен: ${path.split('/').pop()}`;
        if (state.isPlaying) video.play().catch(() => {entry.status = 'Нажмите Play для запуска оверлея';});
        scheduleRender(); updateAssetStatus();
      };
      video.onerror = () => { entry.status = 'Браузер не смог декодировать оверлей. Нужен совместимый MP4/MOV (например H.264).'; scheduleRender(); updateAssetStatus(); };
      video.onseeked = scheduleRender;
      video.src = entry.url; video.load();
    }
    updateAssetStatus();
  }

  async function exportActivePresetZip() {
    const preset=activePreset();
    if(!preset) return;
    if(state.manifest)return exportGroupZip([preset]);
    try {
      const issues=presetIssues(preset);
      if(issues.length)throw new Error('Исправьте перед экспортом:\n'+issues.join('\n'));
      setStatus(`Собираю ${preset.name}.zip…`);
      const entries=[];
      const prefix=`${preset.rootPath}/`;
      for(const [path,rec] of state.files){
        if(!path.startsWith(prefix)) continue;
        const rel=path.slice(prefix.length);
        if(rel==='.DS_Store') continue;
        let bytes;
        if(path===preset.recipePath){ bytes=new TextEncoder().encode(JSON.stringify(preset.recipe,null,4)+'\n'); }
        else {
          const r=[...preset.resources.values()].find(x=>x.path===path);
          if(r) bytes=new TextEncoder().encode(JSON.stringify(productionResourceConfig(preset,r),null,4)+'\n');
          else bytes=new Uint8Array(await rec.file.arrayBuffer());
        }
        entries.push({name:`${preset.name}/${rel}`,bytes});
      }
      const blob=buildZip(entries);
      if (state.exportDirectory) {
        const handle = await state.exportDirectory.getFileHandle(`${preset.name}_edited.zip`, {create:true});
        const stream = await handle.createWritable(); await stream.write(blob); await stream.close();
      } else downloadBlob(blob,`${preset.name}_edited.zip`);
      setStatus(`Экспортирован ${preset.name}_edited.zip`);
    }catch(err){console.error(err);setStatus(`Ошибка ZIP: ${err.message}`);alert(err.message);}
  }

  function buildZip(entries){
    const encoder=new TextEncoder();
    const locals=[], centrals=[]; let offset=0;
    const now=new Date();
    const dosTime=((now.getHours()&31)<<11)|((now.getMinutes()&63)<<5)|((Math.floor(now.getSeconds()/2))&31);
    const dosDate=(((now.getFullYear()-1980)&127)<<9)|(((now.getMonth()+1)&15)<<5)|(now.getDate()&31);
    for(const e of entries){
      const name=encoder.encode(e.name), data=e.bytes instanceof Uint8Array?e.bytes:new Uint8Array(e.bytes), crc=crc32(data);
      const local=new Uint8Array(30+name.length+data.length); const dv=new DataView(local.buffer);
      dv.setUint32(0,0x04034b50,true); dv.setUint16(4,20,true); dv.setUint16(6,0x800,true); dv.setUint16(8,0,true); dv.setUint16(10,dosTime,true); dv.setUint16(12,dosDate,true); dv.setUint32(14,crc,true); dv.setUint32(18,data.length,true); dv.setUint32(22,data.length,true); dv.setUint16(26,name.length,true); dv.setUint16(28,0,true); local.set(name,30); local.set(data,30+name.length); locals.push(local);
      const central=new Uint8Array(46+name.length); const cv=new DataView(central.buffer);
      cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true); cv.setUint16(8,0x800,true); cv.setUint16(10,0,true); cv.setUint16(12,dosTime,true); cv.setUint16(14,dosDate,true); cv.setUint32(16,crc,true); cv.setUint32(20,data.length,true); cv.setUint32(24,data.length,true); cv.setUint16(28,name.length,true); cv.setUint16(30,0,true); cv.setUint16(32,0,true); cv.setUint16(34,0,true); cv.setUint16(36,0,true); cv.setUint32(38,0,true); cv.setUint32(42,offset,true); central.set(name,46); centrals.push(central); offset+=local.length;
    }
    const centralOffset=offset, centralSize=centrals.reduce((s,a)=>s+a.length,0); const end=new Uint8Array(22); const ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true); ev.setUint16(4,0,true); ev.setUint16(6,0,true); ev.setUint16(8,entries.length,true); ev.setUint16(10,entries.length,true); ev.setUint32(12,centralSize,true); ev.setUint32(16,centralOffset,true); ev.setUint16(20,0,true);
    return new Blob([...locals,...centrals,end],{type:'application/zip'});
  }

  const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
  function escapeHtml(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

  function syncManifest() {
    if(!state.manifest)return;
    if(!Array.isArray(state.manifest.items))throw Error('all_in_one.json: отсутствует items.');
    const next=deepClone(state.manifest);
    for(const preset of state.presets.values()) {
      const items=next.items.filter(item=>item.uid===preset.name);
      if(items.length!==1)throw Error(`Манифест: для ${preset.name} нужна ровно одна запись.`);
      const prefix=preset.rootPath+'/resources/';
      const resources=[...state.files.keys()].filter(p=>p.startsWith(prefix)&&!p.split('/').some(n=>n.startsWith('.'))).map(p=>p.slice(prefix.length)).sort();
      const existing=items[0].resources || [];
      items[0].resources=[...existing.filter(name=>resources.includes(name)),...resources.filter(name=>!existing.includes(name))];
    }
    if(JSON.stringify(next)!==JSON.stringify(state.manifest)) {
      state.manifest=next;markDirty(state.manifestPath);
    }
  }

  async function currentFileBytes(path,rec) {
    let obj=path===state.manifestPath?state.manifest:null;
    for(const preset of state.presets.values()) {
      if(path===preset.recipePath)obj=preset.recipe;
      const res=[...preset.resources.values()].find(r=>r.path===path);
      if(res)obj=productionResourceConfig(preset,res);
    }
    return obj?new TextEncoder().encode(JSON.stringify(obj,null,4)+'\n'):new Uint8Array(await rec.file.arrayBuffer());
  }

  async function exportGroupZip(selectedPresets=null) {
    if(!state.manifest)return;
    try {
      const presets=selectedPresets || [...state.presets.values()];
      const issues=presets.flatMap(p=>presetIssues(p).map(s=>`${p.name}: ${s}`));
      if(issues.length)throw Error('Исправьте перед экспортом:\n'+issues.join('\n'));
      syncManifest();
      const prefix=state.manifestPath.slice(0,state.manifestPath.lastIndexOf('/')+1);
      const ids=new Set(presets.map(p=>p.name));
      const manifest=deepClone(state.manifest);manifest.items=manifest.items.filter(item=>ids.has(item.uid));
      const groupIds=new Set(manifest.items.map(item=>item.group_id));
      manifest.groups=manifest.groups.filter(group=>groupIds.has(group.group_id));
      const entries=[];
      const jsonSnapshot=new Map();
      for(const preset of presets) {
        jsonSnapshot.set(preset.recipePath,JSON.stringify(preset.recipe,null,4)+'\n');
        for(const resource of preset.resources.values())jsonSnapshot.set(resource.path,JSON.stringify(productionResourceConfig(preset,resource),null,4)+'\n');
      }
      const files=[...state.files].map(([path,rec])=>[path,rec.file]);
      setStatus(`Собираю группу: ${presets.length} пресетов и все ресурсы…`);
      const exportedNames=new Set();
      for(const [path,file] of files) {
        if(!path.startsWith(prefix))continue;
        let rel=path.slice(prefix.length);
        if(rel.split('/').some(n=>n.startsWith('.'))||rel.startsWith('__MACOSX/'))continue;
        const owner=presets.find(p=>path.startsWith(p.rootPath+'/'));
        if(selectedPresets ? !owner : !owner&&!rel.startsWith('Layers/'))continue;
        if(owner&&!rel.startsWith('Layers/')){
          const item=manifest.items.find(item=>item.uid===owner.name);
          rel=`Layers/video_effects/${item.version||'v1'}/composite_effect/${owner.name}/`+path.slice(owner.rootPath.length+1);
        }
        if(exportedNames.has(rel.toLowerCase()))throw Error('Повтор пути при экспорте: '+rel);
        exportedNames.add(rel.toLowerCase());
        entries.push({name:rel,bytes:jsonSnapshot.has(path)?new TextEncoder().encode(jsonSnapshot.get(path)):new Uint8Array(await file.arrayBuffer())});
      }
      const collectionName=state.workspaceName.replace(/[^\p{L}\p{N}_-]+/gu,'_')||'Collection';
      const blob=await MobilePackage.build(manifest,entries,buildZip),name=selectedPresets?`${presets[0].name}_edited.zip`:`${collectionName}_edited.zip`;
      if(state.exportDirectory) {
        const handle=await state.exportDirectory.getFileHandle(name,{create:true});
        const stream=await handle.createWritable();await stream.write(blob);await stream.close();
      } else downloadBlob(blob,name);
      setStatus(`Экспортировано ${presets.length} пресетов. В корне ZIP: all_in_one.json и Layers.zip.`);
    }catch(err){setStatus(`Ошибка ZIP группы: ${err.message}`);alert(err.message);}
  }

  async function openBundledCollection() {
    if(location.protocol==='file:'){
      setStatus('Выберите папку workspace/Dreamy_rework рядом с index.html — в ней находится новая подборка.');
      ui.fallbackFolderInput.click();return;
    }
    const button=$('#openBundledBtn');button.disabled=true;
    try {
      const response=await fetch('workspace-index.json');
      if(!response.ok)throw Error('В этой папке нет встроенной подборки. Откройте сборку вручную.');
      const index=await response.json(),files=[];
      for(let offset=0;offset<index.files.length;offset+=8) {
        files.push(...await Promise.all(index.files.slice(offset,offset+8).map(async path=>{
          const response=await fetch('workspace/'+path.split('/').map(encodeURIComponent).join('/'));
          if(!response.ok)throw Error(`Не удалось загрузить ${path}`);
          const file=new File([await response.blob()],path.split('/').pop());
          Object.defineProperty(file,'webkitRelativePath',{value:path});return file;
        })));
      }
      await openFallback(files);
      setStatus('Рабочая подборка Dreamy ×10 открыта. Меняйте параметры и экспортируйте всю группу ZIP.');
    }catch(err){setStatus(err.message);}finally{button.disabled=false;}
  }

  async function openPosterizeCollection() {
    const button=$('#openPosterizeBtn');button.disabled=true;
    try {
      const paths=['all_in_one.json','Layers/video_effects/v1/composite_effect/Posterize_Time_01/Posterize_Time_01.json',...['posterize_time.json','PosterizeTime.ps','PosterizeTime.vs'].map(name=>'Layers/video_effects/v1/composite_effect/Posterize_Time_01/resources/'+name)];
      const files=await Promise.all(paths.map(async path=>{
        const response=await fetch('prototypes/posterize-time/preset/'+path);if(!response.ok)throw Error(`Не удалось открыть ${path}`);
        const file=new File([await response.blob()],path.split('/').pop());Object.defineProperty(file,'webkitRelativePath',{value:'Posterize_Time_Prototype/'+path});return file;
      }));
      PosterizeTime.reset();await openFallback(files);
      if(!state.presets.has('Posterize_Time_01'))throw Error('Не удалось открыть тестовый пресет Posterize Time.');
      const demo=await fetch('test-assets/Posterize_Time_motion.mp4');
      if(demo.ok)await addMediaFiles([new File([await demo.blob()],'Posterize_Time_motion.mp4',{type:'video/mp4'})]);
      setStatus('Posterize Time: добавьте видео и 100% интенсивности дают 5 кадров/с; 0% сохраняют исходные кадры.');
    }catch(error){setStatus(error.message);}finally{button.disabled=false;}
  }

  function appendSharpenControls(res) {
    const cfg=res.config,note=document.createElement('p');note.className='asset-control';
    note.textContent='Sharpen: сила резкости и размер детали. Значения сохраняются в JSON и ZIP. Галочка «Фиксировать» отключает связь с общей силой пресета. Для приложения используется встроенный шейдер v1/Sharpen/Sharpen.';
    ui.parameterEditor.append(note);
    for(const [name,adapter] of sharpenParameterObjects(cfg)) {
      const group=document.createElement('div');group.className='parameter-group';
      group.append(makeNestedParamRow(name,adapter,res),makeIntensityControls(adapter,res,name));ui.parameterEditor.append(group);
    }
  }

  function appendBloomControls(res) {
    const note=document.createElement('p');note.className='asset-control';
    note.textContent='New Bloom. Связанная интенсивность задаёт силу при 100% общей силы; «Фиксировать» делает её постоянной. Алгоритм проверен по переданной разработке реализации Bloom v3.';
    ui.parameterEditor.append(note);
    for(const [name,adapter] of bloomParameterObjects(res.config)) {
      ui.parameterEditor.append(makeNestedParamRow(name,adapter,res),makeIntensityControls(adapter,res,name));
    }
  }

  async function addSharpen(importedFiles=[]) {
    const preset=activePreset();if(!preset)return;
    const reference=window.SharpenAssets;
    if(!reference?.config||!reference?.sources)throw Error('Не найден встроенный Sharpen. Полностью распакуйте сборку, включая sharpen-assets.js, и откройте index.html заново.');
    for(const file of importedFiles) {
      const text=reference.sources[file.name];
      if(typeof text!=='string')throw Error('Прямой импорт поддерживает только Sharpen.ps и Sharpen.vs из переданной сборки. Для другого шейдера нужен его JSON.');
      const expected=new TextEncoder().encode(text),actual=new Uint8Array(await file.arrayBuffer());
      if(actual.length!==expected.length||actual.some((v,i)=>v!==expected[i]))throw Error(`${file.name} отличается от проверенного Sharpen. Используйте «+ Sharpen» для встроенной версии; для нового алгоритма требуется отдельный preview.`);
    }
    const sources=['Sharpen.ps','Sharpen.vs'].map(name=>{
      const file=importedFiles.find(f=>f.name===name) || new File([reference.sources[name]],name,{type:'text/plain'});
      return {name,file};
    });
    if(activePreset()!==preset)throw Error('Пресет изменился во время импорта. Повторите добавление.');
    for(const source of sources) {
      source.path=preset.rootPath+'/resources/'+source.name;
      const existing=state.files.get(source.path);
      if(existing && await existing.file.text()!==await source.file.text())throw Error('В сборке уже находится другая версия '+source.name+'.');
    }
    let index=1,name;
    do{name=`sharpen_${String(index++).padStart(2,'0')}`;}while(preset.recipe.effects.some(e=>e.effectName===name)||state.files.has(`${preset.rootPath}/resources/${name}.json`));
    const config=deepClone(reference.config),path=`${preset.rootPath}/resources/${name}.json`;
    const effect={effectName:name,effectType:'isf'},key=keyForEffect(effect);
    if(state.files.has(path))throw Error('Ресурс '+name+' уже существует.');
    for(const source of sources)if(!state.files.has(source.path))putNewFile(source.path,source.file);
    putNewFile(path,new File([JSON.stringify(config,null,4)+'\n'],name+'.json',{type:'application/json'}));
    preset.resources.set(key,{path,config,original:deepClone(config)});
    preset.recipe.effects.push(effect);markDirty(preset.recipePath);syncManifest();
    state.enabled.set(key,true);state.selectedEffectKey=key;state.soloKey=null;
    renderStack();renderParameterEditor();scheduleRender();
    setStatus(`Добавлен ${name}: Sharpen работает в preview, JSON и исходники войдут в ZIP всей группы.`);
  }

  function upgradeBloomConfig(config) {
    for(const [name,value] of Object.entries({knee:.5,scatter:.65,opacity:1})) {
      if(!(name in config))config[name]={actualValue:value,intensityMin:value,intensityMax:value,hardCoded:true};
    }
    return config;
  }

  // Metal v3 reads actualValue for fixed parameters. Keeping both unused
  // endpoints equal to it also avoids legacy -1 sentinels in strict loaders.
  // Linked parameters keep their authored curve, including descending curves.
  function newBloomProductionConfig(config) {
    const copy=deepClone(config);
    for(const name of ['threshold','intensity','radius','knee','scatter','opacity']) {
      const p=copy[name];
      if(p?.hardCoded===true && Number.isFinite(p.actualValue))p.intensityMin=p.intensityMax=p.actualValue;
    }
    return copy;
  }
  function productionResourceConfig(preset,resource) {
    if(!resource)return null;
    const effect=preset.recipe.effects.find(e=>preset.resources.get(keyForEffect(e))===resource);
    return effect?.effectType==='bloomRework' ? newBloomProductionConfig(resource.config) : resource.config;
  }

  function parameterRule(type,name) {
    if(type==='bloomRework')return {min:0,max:({radius:300,scatter:2,threshold:1,knee:1,opacity:1,intensity:5})[name] ?? 1,text:'New Bloom: диапазон текущего Metal-пакета и редактора'};
    if(type==='bloom' && name==='intensity')return {min:0,max:Infinity,text:'Движок: от 0, верхняя граница не задана'};
    if(type==='bloom' && name==='radius')return {min:0,max:4294967295,text:'Движок: UInt32; дробь отбрасывается. Безопасный максимум не установлен'};
    if(type==='lut')return {min:-Infinity,max:Infinity,text:'Шкала 0–1; setter движка не ограничивает силу'};
    if(type==='softBlur' && name==='depth')return {min:1,max:10,text:'Движок: 1–10'};
    if(type==='vhsDistortion' && name==='blurAmount')return {min:0,max:5,text:'Движок: 0–5'};
    if(type==='isf')return {min:-Infinity,max:Infinity,text:'Диапазон определяется конкретным ISF-шейдером'};
    if(type==='adjust')return {min:-Infinity,max:Infinity,text:'Номинальная шкала приложения: 0–1; JSON не ограничивается автоматически'};
    return {min:0,max:1,text:type==='bloom'?'Движок: 0–1; при 1 деление на ноль в шейдере':'Движок: 0–1'};
  }
  function configIssues(effect,cfg) {
    const result=[];
    try {validateConfig(cfg,effect.effectType);}catch(e){result.push(e.message);return result;}
    if(BloomContract.isSupported(cfg))return BloomContract.issues(cfg);
    if(globalThis.PosterizeTime?.isSupported(cfg))return PosterizeTime.configIssues(cfg);
    if(effect.effectType==='isf' && SharpenRender.isSupported(cfg))return SharpenRender.configIssues(cfg);
    const params=typeof cfg.actualValue==='number'?[['intensity',cfg]]:parameterObjects(cfg);
    for(const [name,obj] of params) {
      const rule=parameterRule(effect.effectType,name);
      const used=obj.hardCoded?[['Фиксированное',obj.actualValue]]:[['При 0%',obj.intensityMin],['При 100%',obj.intensityMax]];
      for(const [label,value] of used) {
        if(!Number.isFinite(Math.fround(value)) || value<rule.min || value>rule.max)result.push(`${name} / ${label}: ${value}. ${rule.text}`);
        if(effect.effectType==='bloom' && name==='threshold' && Math.fround(value)===1)result.push(`threshold / ${label}: округляется до 1 — деление на ноль в Bloom.`);
      }
    }
    return result;
  }
  function presetIssues(preset) {
    const issues=[];
    for(const effect of preset.recipe.effects) {
      const res=preset.resources.get(keyForEffect(effect));
      if(!res){issues.push(`${effect.effectName}: отсутствует JSON`);continue;}
      issues.push(...configIssues(effect,res.config).map(s=>`${effect.effectName}: ${s}`));
      if(effect.effectType==='overlay' && /[\\/]|\.(mp4|mov)$/i.test(res.config.filename))issues.push(`${effect.effectName}: filename должен быть именем без пути и расширения, как в Movavi. Выберите файл оверлея заново.`);
      if(effect.effectType==='overlay' && !overlayPath(preset,res.config))issues.push(`${effect.effectName}: отсутствует видео оверлея`);
      if(effect.effectType==='lut' && ![...state.files.keys()].some(path=>path.toLowerCase()===`${preset.rootPath}/resources/${effect.effectName}.cube`.toLowerCase()))issues.push(`${effect.effectName}: нужен resources/${effect.effectName}.cube для мобильного загрузчика. Выберите LUT заново.`);
      if(effect.effectType==='isf' && SharpenRender.isSupported(res.config)) {
        for(const name of ['Sharpen.ps','Sharpen.vs'])if(!state.files.has(`${preset.rootPath}/resources/${name}`))issues.push(`${effect.effectName}: отсутствует ${name} в resources. Добавьте проверенный Sharpen кнопкой «+ Sharpen».`);
        if(res.config.shaderPath!=='v1/Sharpen/Sharpen')issues.push(`${effect.effectName}: для этой сборки shaderPath должен быть v1/Sharpen/Sharpen.`);
      }
    }
    return issues;
  }
  const supportedTypes = ['bloomRework','chromaticAberration','adjust','overlay','lut','noiseLeeCranston','softBlur','vhsDistortion','colorDuotone','falseColor','isf'];
  const requiredParams = {
    bloomRework:['threshold','intensity','radius','knee','scatter','opacity'],
    bloom:['threshold','intensity','radius'],chromaticAberration:['strength','overlap'],
    adjust:['saturation','temperature','hue','colorTone','brightness','exposure','contrast','highlights','shadows','whitePoint','blackPoint'],
    noiseLeeCranston:['ditherAmount'],softBlur:['softness','depth'],vhsDistortion:['intensity','blurAmount'],
    colorDuotone:['intensity','color.red','color.green','color.blue'],falseColor:['brightColor.red','brightColor.green','brightColor.blue','darkColor.red','darkColor.green','darkColor.blue']
  };
  function parameterObjects(cfg, prefix='') {
    const out=[];
    for (const [name,v] of Object.entries(cfg)) {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const path=prefix ? `${prefix}.${name}` : name;
      if ('actualValue' in v) out.push([path,v]); else out.push(...parameterObjects(v,path));
    }
    return out;
  }
  function validateConfig(cfg,type) {
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('Нужен JSON ресурса слоя, а не рецепт effects.');
    const param = (o,label) => {
      if (!o || typeof o.hardCoded !== 'boolean' || !['actualValue','intensityMin','intensityMax'].every(k => typeof o[k] === 'number' && Number.isFinite(o[k]))) throw new Error(`${label}: нужны actualValue, intensityMin, intensityMax (числа) и hardCoded (true/false), как в Movavi.`);
    };
    if (type==='overlay' || type==='lut') param(cfg,type);
    for (const path of requiredParams[type] || []) param(path.split('.').reduce((o,k)=>o?.[k],cfg),path);
    const fields=type==='overlay'?['filename','binding','blendMode']:type==='lut'?['templateID','interpolateMode']:type==='isf'?['shaderPath']:[];
    for (const f of fields) if (typeof cfg[f] !== 'string') throw new Error(`В JSON отсутствует строка ${f}.`);
    if (type==='isf' && (!cfg.shaderConfig || !Array.isArray(cfg.intensityParamNames))) throw new Error('ISF требует shaderConfig и intensityParamNames.');
    if (type==='noiseLeeCranston' && ['animated','monochrome'].some(k=>typeof cfg[k]!=='boolean')) throw new Error('Noise требует animated и monochrome (true/false).');
  }
  function safeName(name) {
    if (!name || name==='.' || name==='..' || /[\\/\x00-\x1f:]/.test(name)) throw new Error('Недопустимое имя ресурса');
    return name;
  }
  function putNewFile(path,file) {
    if ([...state.files.keys()].some(p=>p.toLowerCase()===path.toLowerCase())) throw new Error(`Файл уже существует: ${path}. Импортируйте ресурс с другим именем.`);
    state.files.set(path,{file,handle:null}); markDirty(path);
  }
  function updateAssetStatus() {
    const el=$('#assetStatus'); if(!el) return;
    const preset=activePreset(),effect=selectedEffect(),res=selectedResource();
    if(effect?.effectType==='overlay') el.textContent=state.overlays.get(state.selectedEffectKey)?.status || 'Выберите видео оверлея';
    else if(effect?.effectType==='lut') {
      const binding=findLutBinding(preset,effect);
      el.textContent=binding ? `LUT загружен: ${binding.fileName}${binding.lut ? ` · ${binding.lut.size}×${binding.lut.size}×${binding.lut.size}` : ''}` : 'Не найден .cube — выберите файл';
    }
  }
  function appendAssetControl(effect,res) {
    const box=document.createElement('div'); box.className='asset-control';
    const button=document.createElement('button');button.className='btn small';button.textContent=effect.effectType==='overlay'?'Выбрать файл оверлея…':'Выбрать LUT .cube…';
    const input=document.createElement('input');input.type='file';input.hidden=true;input.accept=effect.effectType==='overlay'?'.mp4,.mov':'.cube';
    input.id='layerAssetInput';
    const status=document.createElement('div');status.id='assetStatus';status.className='asset-status';
    box.append(button,input,status);ui.parameterEditor.append(box);
    if(effect.effectType==='overlay'){
      const note=document.createElement('p');note.textContent='Как в мобильном приложении: при общей силе 0% видеооверлей отключается целиком, даже с фиксированной интенсивностью.';box.append(note);
    }
    button.onclick=()=>input.click();
    input.onchange=async()=>{
      const file=input.files[0];if(!file)return;
      try {
        const preset=activePreset();let name=safeName(file.name);
        if(effect.effectType==='overlay') {
          if(!/\.(mp4|mov)$/i.test(name))throw new Error('Movavi подключает оверлеи MP4/MOV.');
          const asset=await overlayAssetName(preset,file);
          if(!state.files.has(asset.path))putNewFile(asset.path,file);res.config.filename=asset.base;
        } else {
          if(!/\.cube$/i.test(name))throw new Error('Выберите .cube');
          const lut=parseCube(await file.text());
          name=safeName(effect.effectName)+'.cube';
          const desiredPath=`${preset.rootPath}/resources/${name}`;
          const path=[...state.files.keys()].find(p=>p.toLowerCase()===desiredPath.toLowerCase()) || desiredPath;
          // Bind selected bytes and parsed LUT directly to this layer instead of
          // rediscovering the asset by filename after the file picker closes.
          const old=state.files.get(path);
          state.files.set(path,{file,handle:old?.handle || null});
          state.lutCache.set(path,lut);
          state.lutAssignments.set(res.path,{path,fileName:file.name,lut});
          markDirty(path);
          setStatus(`LUT загружен и применён: ${file.name} (${lut.size}×${lut.size}×${lut.size})`);
        }
        if(effect.effectType==='overlay')markDirty(res.path);
        refreshNoiseVideo();renderParameterEditor();scheduleRender();
      }catch(err){setStatus(err.message);status.textContent=err.message;}
      finally{input.value='';}
    };
    queueMicrotask(updateAssetStatus);
  }
  function chooseImportType(guess) {
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='layer-import-dialog';
      dialog.innerHTML='<h3>Добавить слой</h3><p>Выберите тип эффекта.</p><label>Тип эффекта<select></select></label><p>New Bloom, Aberration, Adjust, LUT, Overlay и встроенный Sharpen отображаются в превью. Для готовой резкости можно использовать кнопку «+ Sharpen». Другие ISF-шейдеры требуют отдельной поддержки в редакторе и приложении.</p><button class="btn cancel">Отмена</button> <button class="btn primary confirm">Добавить</button>';
      const select=dialog.querySelector('select');for(const type of supportedTypes)select.add(new Option(type,type));select.value=guess;
      const done=value=>{dialog.close();dialog.remove();resolve(value);};
      dialog.querySelector('.cancel').onclick=()=>done(null);dialog.querySelector('.confirm').onclick=()=>done(select.value);dialog.oncancel=e=>{e.preventDefault();done(null);};document.body.append(dialog);dialog.showModal();
    });
  }
  async function importLayer(files) {
    const preset=activePreset();if(!preset)return;
    try {
      const jsons=files.filter(f=>/\.json$/i.test(f.name));
      if(!jsons.length && files.some(f=>/\.(ps|vs)$/i.test(f.name))){await addSharpen(files);return;}
      if(jsons.length!==1)throw new Error('Выберите один JSON слоя и его ресурсы, либо Sharpen.ps / Sharpen.vs. Готовую резкость можно добавить кнопкой «+ Sharpen».');
      let config=JSON.parse(await jsons[0].text());
      if(config.effects)throw new Error('Это рецепт пресета. Выберите JSON нужного слоя из resources.');
      const guess=config.filename?'overlay':config.threshold?'bloomRework':config.strength?'chromaticAberration':config.templateID?'lut':config.shaderPath?'isf':config.ditherAmount?'noiseLeeCranston':config.softness?'softBlur':config.blurAmount?'vhsDistortion':config.brightColor?'falseColor':config.color?'colorDuotone':'adjust';
      let type=await chooseImportType(guess);if(!type || activePreset()!==preset)return;
      if(type==='bloomRework'){config=BloomContract.migrate(config);type='isf';}
      validateConfig(config,type);
      const name=BloomContract.isSupported(config)?'new_bloom_01':safeName(jsons[0].name.replace(/\.json$/i,''));
      if(preset.recipe.effects.some(e=>e.effectName.toLowerCase()===name.toLowerCase()))throw new Error('Слой с таким именем уже существует. Переименуйте импортируемый JSON.');
      const additions=files.map(file=>file===jsons[0]?{path:`${preset.rootPath}/resources/${name}.json`,file:new File([JSON.stringify(config)],name+'.json')}:{path:`${preset.rootPath}/resources/${safeName(file.name)}`,file});
      const paths=new Set([...state.files.keys()].map(p=>p.toLowerCase()));
      for(const {path} of additions){if(paths.has(path.toLowerCase()))throw new Error(`Имя занято: ${path}`);paths.add(path.toLowerCase());}
      const effect={effectName:name,effectType:type},key=keyForEffect(effect),path=`${preset.rootPath}/resources/${name}.json`;
      for(const item of additions)putNewFile(item.path,item.file);
      preset.resources.set(key,{path,config,original:deepClone(config)});preset.recipe.effects.push(effect);markDirty(preset.recipePath);
      state.enabled.set(key,true);state.selectedEffectKey=key;state.soloKey=null;
      renderStack();renderParameterEditor();refreshNoiseVideo();scheduleRender();setStatus(`Добавлен ${name}. Ресурсы будут включены в ZIP.`);
    }catch(err){setStatus(`Импорт: ${err.message}`);alert(err.message);}
  }
  $('#importLayerBtn').onclick=()=>$('#importLayerInput').click();
  $('#addSharpenBtn').onclick=()=>addSharpen().catch(err=>{setStatus(err.message);alert(err.message);});
  $('#undoRemoveLayerBtn').onclick=undoRemoveLayer;
  $('#neutralAtZeroBtn').onclick=neutralizeAtZero;
  $('#exportGroupBtn').onclick=()=>exportGroupZip();
  $('#openBundledBtn').onclick=openBundledCollection;
  $('#importLayerInput').onchange=e=>{importLayer([...e.target.files]);e.target.value='';};
  $('#exportFolderBtn').onclick=async()=>{
    try {
      if(!window.showDirectoryPicker){setStatus('Браузер не поддерживает выбор папки: ZIP будет скачан обычным способом.');return;}
      state.exportDirectory=await window.showDirectoryPicker({mode:'readwrite'});
      $('#exportFolderBtn').textContent=`ZIP → ${state.exportDirectory.name}`;
    }catch(e){if(e.name!=='AbortError')setStatus(e.message);}
  };
  $('#demoBtn').addEventListener('click', async () => {
    const config = {strength:{intensityMin:0,intensityMax:0.03,hardCoded:false,actualValue:0.03},overlap:{intensityMin:0,intensityMax:1,hardCoded:true,actualValue:0.85}};
    const bloomConfig = {threshold:{intensityMin:-1,intensityMax:1,hardCoded:true,actualValue:.3},intensity:{intensityMin:.2,intensityMax:.8,hardCoded:false,actualValue:.35},radius:{intensityMin:-1,intensityMax:95,hardCoded:true,actualValue:75}};
    const recipe = {effects:[{effectName:'bloom_01',effectType:'bloom'},{effectName:'abberation_01',effectType:'chromaticAberration'}]};
    const files = [['Glow_Preset_01.json',recipe],['resources/abberation_01.json',config],['resources/bloom_01.json',bloomConfig]].map(([name,obj]) => {
      const file = new File([JSON.stringify(obj)],name.split('/').pop(),{type:'application/json'});
      Object.defineProperty(file,'webkitRelativePath',{value:'Glow_Preset_01/'+name});
      return file;
    });
    await openFallback(files);
    ui.workspaceName.textContent = 'Тест Bloom / Aberration · параметры Glow 01';
    state.soloKey = 'isf:new_bloom_01';
    renderStack();
    await loadMedia(new File(["<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"640\" height=\"640\" viewBox=\"0 0 640 640\"><rect width=\"640\" height=\"640\" fill=\"#171a23\"/><circle cx=\"320\" cy=\"320\" r=\"25\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"50\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"75\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"100\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"125\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"150\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"175\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"200\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"225\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"250\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"275\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"300\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"325\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"350\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"375\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"400\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><circle cx=\"320\" cy=\"320\" r=\"425\" fill=\"none\" stroke=\"white\" stroke-width=\"3\"/><path d=\"M320 0V640M0 320H640\" stroke=\"#8090b0\" stroke-width=\"2\"/><rect x=\"80\" y=\"90\" width=\"50\" height=\"100\" fill=\"#ff654a\"/><rect x=\"510\" y=\"450\" width=\"45\" height=\"100\" fill=\"#38caf5\"/></svg>"], 'Круговая сетка.svg', {type:'image/svg+xml'}));
    setStatus('Тест: слева исходник, справа Solo Bloom. Для Aberration нажми S рядом с ним. Рабочие файлы не открыты.');
  });

  ui.openWorkspaceBtn.addEventListener('click', openWorkspace);
  ui.fallbackFolderInput.addEventListener('change', e => openFallback(e.target.files));
  ui.presetSelect.addEventListener('change', e => activatePreset(e.target.value));
  ui.mediaInput.addEventListener('change', e => {const files=[...e.target.files];e.target.value='';addMediaFiles(files).catch(err=>setStatus(err.message));});
  ui.mediaSelect.addEventListener('change',e=>selectMedia(e.target.value));
  for(const [button,delta] of [[ui.previousMediaBtn,-1],[ui.nextMediaBtn,1]])button.addEventListener('click',()=>{
    const index=state.mediaLibrary.findIndex(e=>e.id===state.activeMediaId);
    const entry=state.mediaLibrary[index+delta];if(entry)selectMedia(entry.id);
  });
  ui.playPauseBtn.addEventListener('click', togglePlayback);
  ui.clearSoloBtn.addEventListener('click', () => { state.soloKey=null; ui.clearSoloBtn.disabled=true; renderStack(); scheduleRender(); });
  ui.resetEffectBtn.addEventListener('click', resetSelectedEffect);
  ui.saveBtn.addEventListener('click', saveDirtyJson);
  ui.exportBtn.addEventListener('click', exportActivePresetZip);
  ui.splitRange.addEventListener('input', e => { state.split=Number(e.target.value); applyCompareMode(); });
  $$('.compare-tab').forEach(btn => btn.addEventListener('click', () => { state.compareMode=btn.dataset.mode; applyCompareMode(); }));
  window.addEventListener('resize', scheduleRender);
  ui.sourceVideo.addEventListener('ended',()=>{state.isPlaying=false;ui.playPauseBtn.textContent='Play';});
  ui.sourceVideo.addEventListener('seeking',()=>PosterizeTime.reset());
  $('#openPosterizeBtn').addEventListener('click',openPosterizeCollection);

  $('#masterIntensity').addEventListener('input', e => {
    state.userIntensity = Number(e.target.value) / 100;
    $('#masterIntensityValue').textContent = `${e.target.value}%`;
    updateEffectiveValues(); refreshWarningsOnly(); scheduleRender();
  });
  VideoExport.install({
    button: $('#exportVideoBtn'), video: ui.sourceVideo,
    before: ui.beforeCanvas, after: ui.afterCanvas, setStatus,
    presets:()=>[...state.presets.keys()].map(id=>({id})),
    collectionName:()=>state.workspaceName,
    buildZip,
    selectPreset(name){
      if(!state.presets.has(name))throw Error('Пресет больше не существует: '+name);
      activatePreset(name);PosterizeTime.reset();
    },
    details: () => ({
      preset: state.activePresetName, label: presetLabel(state.activePresetName || ''),
      source: state.mediaLibrary.find(entry=>entry.id===state.activeMediaId)?.file.name || 'Video',
      strength: Math.round(state.userIntensity * 100),
      note: state.soloKey ? `Solo: ${state.soloKey.split(':')[1]}` :
        [...(activePreset()?.recipe.effects || [])].some(e=>!state.enabled.get(keyForEffect(e))) ? 'Some layers disabled' : ''
    }),
    async begin(beforeOnly) {
      const snapshot={playing:state.isPlaying,preset:state.activePresetName,enabled:new Map(state.enabled),solo:state.soloKey,selected:state.selectedEffectKey,overlays:[...state.overlays].filter(([key,e])=>e.video).map(([key,e])=>({key,video:e.video,time:e.video.currentTime,rate:e.video.playbackRate})),inert:[...document.querySelectorAll('.toolbar,.stack-panel,.parameters-panel,.master-control,.preset-row,.media-library,.preview-toolbar')].map(element=>({element,value:element.inert}))};
      for(const entry of snapshot.inert)entry.element.inert=true;
      state.videoExporting=true;state.isPlaying=false;state.renderAgain=false;
      cancelAnimationFrame(state.videoLoopId);ui.sourceVideo.pause();
      for(const entry of snapshot.overlays)entry.video.pause();
      return snapshot;
    },
    async ready(beforeOnly, signal) {
      // A LUT may still be loading in the previous preview frame.
      const deadline=performance.now()+20000;
      while(state.renderBusy && performance.now()<deadline) {
        if(signal.aborted)throw signal.reason;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      if(state.renderBusy)throw Error('Предыдущее превью ещё занято. Попробуйте экспорт снова.');
      if(beforeOnly)return;
      for(const effect of activePreset()?.recipe.effects || []) {
        const key=keyForEffect(effect);
        if(effect.effectType!=='overlay' || !state.enabled.get(key) || (state.soloKey && state.soloKey!==key) || state.userIntensity<=0)continue;
        const entry=state.overlays.get(key);
        if(!entry?.video)throw Error(entry?.status || 'Не найден файл оверлея.');
        await VideoExport.ready(entry.video,signal);
        entry.video.playbackRate=1;
        await VideoExport.seek(entry.video,0,signal);
      }
    },
    async render(beforeOnly, signal) {
      if(!beforeOnly)for(const effect of activePreset()?.recipe.effects || []) {
        const key=keyForEffect(effect);
        if(effect.effectType==='overlay' && state.userIntensity>0 && state.enabled.get(key) && (!state.soloKey || state.soloKey===key)) {
          const video=state.overlays.get(key)?.video;
          if(video)await VideoExport.ready(video,signal);
        }
      }
      const errors=await renderPreviewFrame(beforeOnly);
      if(errors?.length)throw Error(errors.join(' · '));
    },
    async play(beforeOnly) {
      if(beforeOnly)return;
      const videos=[];
      for(const effect of activePreset()?.recipe.effects || []) {
        const key=keyForEffect(effect);
        if(effect.effectType==='overlay' && state.userIntensity>0 && state.enabled.get(key) && (!state.soloKey || state.soloKey===key)) {
          const video=state.overlays.get(key)?.video;if(video)videos.push(video.play());
        }
      }
      await Promise.all(videos);
    },
    async end(snapshot) {
      if(!snapshot)return;
      if(state.activePresetName!==snapshot.preset)activatePreset(snapshot.preset);
      state.enabled=new Map(snapshot.enabled);state.soloKey=snapshot.solo;state.selectedEffectKey=snapshot.selected;
      for(const entry of snapshot?.overlays || []) {
        const video=state.overlays.get(entry.key)?.video;if(!video)continue;
        video.pause();video.playbackRate=entry.rate;
        try{await VideoExport.ready(video,new AbortController().signal);if(Number.isFinite(entry.time))video.currentTime=entry.time;}catch{}
      }
      for(const entry of snapshot.inert)entry.element.inert=entry.value;
      state.videoExporting=false;
      state.isPlaying=!!snapshot?.playing;
      ui.playPauseBtn.textContent=state.isPlaying?'Pause':'Play';
      if(state.isPlaying) {
        try{await ui.sourceVideo.play();for(const entry of state.overlays.values())entry.video?.play().catch(()=>{});startVideoLoop();}
        catch{state.isPlaying=false;ui.playPauseBtn.textContent='Play';}
      }
      renderStack();renderParameterEditor();scheduleRender();
    }
  });
  applyCompareMode();
  updateDirtyUI();
  for(const item of EffectCatalog.items)$('#effectCatalog').add(new Option(item.label,item.id));
  $('#newCollectionBtn').onclick=newCollection;$('#newPresetBtn').onclick=newPreset;
  $('#openZipBtn').onclick=()=>$('#openZipInput').click();
  $('#openZipInput').onchange=e=>{const file=e.target.files[0];e.target.value='';openZip(file);};
  $('#effectCatalog').onchange=()=>{const item=EffectCatalog.items.find(x=>x.id===$('#effectCatalog').value);$('#catalogHint').textContent=item?.integration?'Новый эффект: потребуется интеграция в мобильное приложение.':item?.asset?'Выберите файл с компьютера. Он будет включён в ZIP пресета.':item?.approximate?'Штатный эффект приложения. Предпросмотр приблизительный.':'Выберите эффект и добавьте его в стек.';updateDirtyUI();};
  $('#addEffectBtn').onclick=()=>addCatalogEffect($('#effectCatalog').value).catch(e=>{setStatus(e.message);alert(e.message);});
  const currentBuild=document.documentElement.dataset.build;
  let remoteBuild;
  if(currentBuild){
    const checkUpdate=async()=>{try{const response=await fetch('version.json?check='+Math.floor(Date.now()/60000),{cache:'no-store'});if(response.ok){const info=await response.json();if(info.build&&info.build!==currentBuild){remoteBuild=info.build;$('#updateNotice').hidden=false;}}}catch{}};
    checkUpdate();setInterval(checkUpdate,60000);
  }
  $('#reloadAppBtn').onclick=()=>{if(state.dirtyPaths.size&&!confirm('Несохранённые изменения будут потеряны. Экспортируйте ZIP перед обновлением. Всё равно обновить?'))return;const url=new URL(location.href);url.searchParams.set('build',remoteBuild||Date.now());location.href=url.href;};
  if(location.protocol==='file:')setStatus('Запустите START_MAC.command / START_WINDOWS.bat для загрузки встроенных шаблонов.');
})();
