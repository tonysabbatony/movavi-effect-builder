/* Local review-video export. No network services or shader/JSON mutations. */
(() => {
  'use strict';
  const cancelled=()=>new DOMException('Экспорт отменён.','AbortError');
  function waitFor(video,event,predicate,signal,checkNow=true) {
    return new Promise((resolve,reject)=>{
      let timer;
      const events=Array.isArray(event)?event:[event];
      const clean=()=>{clearTimeout(timer);for(const name of events)video.removeEventListener(name,check);video.removeEventListener('error',fail);signal?.removeEventListener('abort',abort);};
      const check=()=>{if(predicate()){clean();resolve();}};
      const fail=()=>{clean();reject(Error('Не удалось прочитать видео. Попробуйте MP4 H.264.'));};
      const abort=()=>{clean();reject(signal.reason || cancelled());};
      for(const name of events)video.addEventListener(name,check);video.addEventListener('error',fail);signal?.addEventListener('abort',abort,{once:true});
      timer=setTimeout(()=>{clean();reject(Error('Видео слишком долго не отвечает. Экспорт остановлен.'));},20000);
      if(signal?.aborted)abort();else if(video.error)fail();else if(checkNow)check();
    });
  }
  const ready=(video,signal)=>waitFor(video,['loadeddata','seeked','canplay'],()=>video.readyState>=2 && !video.seeking,signal);
  async function seek(video,time,signal) {
    if(signal?.aborted)throw signal.reason || cancelled();
    if(Math.abs(video.currentTime-time)<.001 && !video.seeking)return ready(video,signal);
    // Do not resolve against the old frame before currentTime has been set.
    // Near zero, an overlay's previous timestamp can already fit the tolerance.
    const result=waitFor(video,'seeked',()=>!video.seeking && Math.abs(video.currentTime-time)<.05 && video.readyState>=2,signal,false);
    video.currentTime=time;await result;
  }
  function format() {
    if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)return null;
    return ['video/mp4;codecs=avc1.420028,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
  }
  function install(hooks) {
    const dialog=document.createElement('dialog');dialog.id='videoExportDialog';dialog.className='video-export-dialog';
    dialog.setAttribute('aria-labelledby','videoExportTitle');
    dialog.innerHTML=`<h2 id="videoExportTitle">Экспорт видео</h2>
      <p id="videoExportDetails"></p>
      <fieldset id="videoExportOptions">
        <label for="videoExportScope">Какие пресеты</label>
        <select id="videoExportScope"><option value="current">Текущий пресет</option><option value="all">Все пресеты сборки · ZIP</option></select>
        <label for="videoExportMode">Что сохранить</label>
        <select id="videoExportMode"><option value="Before_After">Before / After рядом</option><option value="After">After — с эффектом</option><option value="Before">Before — исходное видео</option></select>
        <label class="export-check"><input id="videoExportLabels" type="checkbox" checked> Название пресета и подписи Before / After в кадре</label>
        <label class="export-check"><input id="videoExportAudio" type="checkbox" checked> Исходный звук, если он есть</label>
      </fieldset>
      <p class="export-hint">Сохраняется весь выбранный клип с начала до конца. After учитывает текущую общую силу, Solo и выключенные слои.</p>
      <p class="export-hint">Для всей сборки используется текущее исходное видео и выбранная общая сила; каждый пресет рендерится со всеми своими слоями. В ZIP сохраняются отдельные папки и имена пресетов. Обработка последовательная, вкладку нужно оставлять открытой.</p>
      <p class="export-hint">Качество — как в превью: до 960 px по длинной стороне каждого видео. Запись идёт во время воспроизведения: оставьте эту вкладку открытой на время экспорта. При тяжёлых эффектах плавность может снижаться.</p>
      <p id="videoExportFilename" class="export-filename"></p>
      <progress id="videoExportProgress" max="100" value="0" hidden></progress>
      <p id="videoExportStatus" role="status" aria-live="polite"></p>
      <div id="videoExportResult"></div>
      <div class="export-actions"><button id="videoExportClose" class="btn">Закрыть</button><button id="videoExportStart" class="btn primary">Экспортировать</button></div>`;
    document.body.append(dialog);
    const $=id=>dialog.querySelector('#'+id),video=hooks.video;
    let run=null,resultUrl=null,audioContext=null,audioSource=null,batch={index:0,total:1,label:''};
    const warmedFormats=new Set();
    const timeLabel=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
    const safe=value=>String(value).replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').replace(/\s+/g,'_').slice(0,90) || 'Video';
    const presetFileName=value=>String(value).replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,90)||'Preset';
    function filename(info,mode,type) {
      const stamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','_').slice(0,15);
      return `${presetFileName(info.preset)}_${safe(info.source)}_${mode}_${stamp}.${type.startsWith('video/mp4')?'mp4':'webm'}`;
    }
    function describe() {
      const info=hooks.details(),type=format();
      const count=hooks.presets?.().length||1;
      $('videoExportScope').options[1].textContent=`Все пресеты сборки (${count}) · ZIP`;
      $('videoExportScope').options[1].disabled=count<2;
      $('videoExportDetails').textContent=`${info.label} · общая сила ${info.strength}%${info.note?' · '+info.note:''} · ${info.source} · ${timeLabel(video.duration || 0)}`;
      $('videoExportFilename').textContent=type ? filename(info,$('videoExportMode').value,type) : '';
      $('videoExportStart').disabled=!type;
      if(!type)$('videoExportStatus').textContent='Этот браузер не поддерживает запись видео. Откройте сборку в Chrome.';
    }
    function clearResult() {
      if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;$('videoExportResult').replaceChildren();
    }
    function close() {
      if(run){run.abort(cancelled());return;}
      dialog.close();clearResult();
    }
    $('videoExportClose').onclick=close;
    dialog.oncancel=e=>{e.preventDefault();close();};
    $('videoExportMode').onchange=describe;
    $('videoExportScope').onchange=describe;
    hooks.button.onclick=()=>{
      clearResult();$('videoExportStatus').textContent='';$('videoExportProgress').hidden=true;
      describe();dialog.showModal();
    };
    function composite(info,mode,labels) {
      const src=hooks.before,w=src.width,h=src.height,side=mode==='Before_After';
      const header=labels?Math.max(48,Math.round(w/12/2)*2):0;
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(w*(side?2:1)/2)*2;canvas.height=Math.ceil((h+header)/2)*2;
      const ctx=canvas.getContext('2d',{alpha:false});
      const text=(value,x,y,max)=>{let s=value;while(s.length && ctx.measureText(s).width>max)s=s.slice(0,-1);ctx.fillText(s===value?s:s+'…',x,y);};
      return {canvas,draw(){
        ctx.fillStyle='#101218';ctx.fillRect(0,0,canvas.width,canvas.height);
        if(side){ctx.drawImage(hooks.before,0,header);ctx.drawImage(hooks.after,w,header);ctx.fillStyle='#89fe00';ctx.fillRect(w-1,header,2,h);}
        else ctx.drawImage(mode==='Before'?hooks.before:hooks.after,0,header);
        if(labels){
          const pad=Math.max(8,Math.round(w*.02)),font=Math.min(24,Math.max(12,Math.round(w/25)));
          ctx.fillStyle='#f3f4f7';ctx.font=`700 ${font}px Aeroport, sans-serif`;
          text(`${info.label} · ${info.strength}%${info.note?' · '+info.note:''}`,pad,header*.42,canvas.width-pad*3);
          ctx.fillStyle='#89fe00';ctx.font=`400 ${Math.max(11,font*.8)}px Aeroport, sans-serif`;
          ctx.fillText(side?'Before':mode,pad,header*.82);if(side)ctx.fillText('After',w+pad,header*.82);
        }
      }};
    }
    async function record(recorder,output,signal,beforeOnly) {
      const chunks=[];let size=0,frame=0,watchdog,rendering=null,finishing=false;
      return new Promise((resolve,reject)=>{
        let problem=null,lastTime=video.currentTime,lastProgress=performance.now();
        const cleanup=()=>{cancelAnimationFrame(frame);clearInterval(watchdog);video.removeEventListener('ended',ended);video.removeEventListener('error',error);signal.removeEventListener('abort',abort);document.removeEventListener('visibilitychange',visibility);};
        const finish=async reason=>{
          if(finishing)return;finishing=true;problem=reason;cleanup();video.pause();
          try{await rendering;if(!problem){await hooks.render(beforeOnly,signal);output.draw();}}catch(e){problem ||= e;}
          if(recorder.state!=='inactive')recorder.stop();else {cleanup();reject(problem || Error('Запись видео неожиданно завершилась.'));}
        };
        const ended=()=>finish();
        const error=()=>finish(Error('Браузер прервал чтение исходного видео.'));
        const abort=()=>finish(signal.reason || cancelled());
        const visibility=()=>{if(document.hidden)finish(Error('Вкладка была скрыта: запись остановлена. Повторите экспорт, оставив её открытой.'));};
        const loop=async()=>{
          if(finishing)return;
          try{rendering=hooks.render(beforeOnly,signal);await rendering;if(finishing)return;output.draw();}
          catch(e){finish(e);return;}
          const percent=Math.min(99,Math.floor(video.currentTime/video.duration*100));
          $('videoExportProgress').value=(batch.index+percent/100)/batch.total*100;
          $('videoExportStatus').textContent=`${batch.total>1?`${batch.index+1}/${batch.total} · ${batch.label} · `:''}Экспорт: ${percent}% · ${timeLabel(video.currentTime)} / ${timeLabel(video.duration)}`;
          frame=requestAnimationFrame(loop);
        };
        recorder.ondataavailable=e=>{
          if(!e.data.size)return;chunks.push(e.data);size+=e.data.size;
          if(size>512*1024*1024)finish(Error('Размер записи превысил 512 МБ. Выберите более короткий клип.'));
        };
        recorder.onerror=e=>finish(e.error || Error('Не удалось закодировать видео.'));
        recorder.onstop=()=>{cleanup();if(problem)reject(problem);else if(chunks.length)resolve(new Blob(chunks,{type:recorder.mimeType}));else reject(Error('Браузер создал пустое видео.'));};
        video.addEventListener('ended',ended,{once:true});video.addEventListener('error',error,{once:true});
        signal.addEventListener('abort',abort,{once:true});document.addEventListener('visibilitychange',visibility);
        watchdog=setInterval(()=>{
          if(video.currentTime!==lastTime){lastTime=video.currentTime;lastProgress=performance.now();}
          else if(performance.now()-lastProgress>15000)finish(Error('Воспроизведение остановилось. Повторите экспорт.'));
        },1000);
        // Prime the encoder with the paused first frame before starting playback.
        // At large resolutions encoder startup can otherwise omit the clip's head.
        recorder.onstart=()=>{
          if(finishing)return;
          Promise.all([hooks.play(beforeOnly),video.play()]).then(()=>{if(!finishing)frame=requestAnimationFrame(loop);},finish);
        };
        try{
          if(signal.aborted){abort();return;}
          recorder.start(1000);
          output.draw();recorder.stream.getVideoTracks()[0]?.requestFrame?.();
        }catch(e){finish(e);}
      });
    }
    async function warmEncoder(stream,output,type,signal) {
      const key=type+'|'+output.canvas.width+'x'+output.canvas.height+'|'+stream.getAudioTracks().length;
      if(warmedFormats.has(key))return;
      $('videoExportStatus').textContent='Запускаю кодировщик…';
      await new Promise((resolve,reject)=>{
        const recorder=new MediaRecorder(stream,{mimeType:type});let timer,timeout,problem=null,settled=false;
        const done=()=>{if(settled)return;settled=true;clearInterval(timer);clearTimeout(timeout);signal.removeEventListener('abort',abort);problem?reject(problem):resolve();};
        const stop=error=>{problem ||= error;try{if(recorder.state!=='inactive')recorder.stop();else done();}catch(e){problem ||= e;done();}};
        const abort=()=>stop(signal.reason||cancelled());
        recorder.ondataavailable=e=>{if(e.data.size)stop();};recorder.onerror=e=>stop(e.error||Error('Не удалось запустить кодировщик.'));
        recorder.onstop=done;
        if(signal.aborted){reject(signal.reason||cancelled());return;}
        signal.addEventListener('abort',abort,{once:true});
        try{recorder.start(100);timer=setInterval(()=>{output.draw();stream.getVideoTracks()[0]?.requestFrame?.();},30);
          timeout=setTimeout(()=>stop(Error('Кодировщик не ответил. Повторите экспорт.')),10000);
        }catch(e){stop(e);}
      });
      warmedFormats.add(key);output.draw();stream.getVideoTracks()[0]?.requestFrame?.();
    }
    $('videoExportStart').onclick=async()=>{
      if(run)return;
      const type=format();if(!type)return;
      const controller=new AbortController();run=controller;
      const initialInfo=hooks.details(),mode=$('videoExportMode').value,beforeOnly=mode==='Before',all=$('videoExportScope').value==='all';
      const presets=all?hooks.presets():[{id:initialInfo.preset}];
      const snapshot={time:video.currentTime,loop:video.loop,rate:video.playbackRate,muted:video.muted,volume:video.volume};
      let appSnapshot,stream,destination;
      clearResult();$('videoExportOptions').disabled=true;$('videoExportStart').disabled=true;$('videoExportClose').textContent='Отменить';
      $('videoExportProgress').value=0;$('videoExportProgress').hidden=false;$('videoExportStatus').textContent='Подготавливаю видео и ресурсы…';
      try{
        if(all){const names=presets.map(p=>presetFileName(p.id).toLowerCase());if(new Set(names).size!==names.length)throw Error('Имена пресетов совпадают после преобразования в имена файлов.');}
        appSnapshot=await hooks.begin(beforeOnly);
        if($('videoExportAudio').checked){
          audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
          audioSource ||= audioContext.createMediaElementSource(video);
          await audioContext.resume();
          if(audioContext.state!=='running')throw Error('Браузер не разрешил звук. Повторите экспорт или снимите галочку звука.');
        }
        video.loop=false;video.playbackRate=1;
        const entries=[];let resultBlob,totalBytes=0;
        for(let index=0;index<presets.length;index++){
          if(controller.signal.aborted)throw controller.signal.reason||cancelled();
          video.pause();if(all)await hooks.selectPreset(presets[index].id);
          const info=hooks.details();batch={index,total:presets.length,label:info.preset};
          await ready(video,controller.signal);await seek(video,0,controller.signal);await hooks.ready(beforeOnly,controller.signal);
          await hooks.render(beforeOnly,controller.signal);
          const output=composite(info,mode,$('videoExportLabels').checked);output.draw();
          stream=output.canvas.captureStream(30);
          if($('videoExportAudio').checked){destination=audioContext.createMediaStreamDestination();audioSource.connect(destination);for(const track of destination.stream.getAudioTracks())stream.addTrack(track);video.muted=false;video.volume=1;}
          await warmEncoder(stream,output,type,controller.signal);
          const recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:Math.min(16000000,Math.max(2500000,output.canvas.width*output.canvas.height*8)),audioBitsPerSecond:192000});
          const blob=await record(recorder,output,controller.signal,beforeOnly);
          if(controller.signal.aborted)throw controller.signal.reason||cancelled();
          totalBytes+=blob.size;if(totalBytes>512*1024*1024)throw Error('Суммарный размер видео превышает 512 МБ. Экспортируйте более короткий исходник или отдельные пресеты.');
          if(all){const uid=presetFileName(info.preset),ext=blob.type.startsWith('video/mp4')?'mp4':'webm';entries.push({name:`${uid}/${uid}_${mode}.${ext}`,bytes:new Uint8Array(await blob.arrayBuffer())});}
          else resultBlob=blob;
          for(const track of stream.getTracks())track.stop();stream=null;if(destination){audioSource.disconnect(destination);destination=null;}
        }
        if(all)resultBlob=await hooks.buildZip(entries);
        const name=all?`${safe(hooks.collectionName?.()||'Presets')}_${mode}_videos.zip`:filename(initialInfo,mode,resultBlob.type);resultUrl=URL.createObjectURL(resultBlob);
        const link=document.createElement('a');link.href=resultUrl;link.download=name;link.className='btn primary';link.textContent='Скачать видео ещё раз';
        $('videoExportResult').append(link);link.click();
        $('videoExportProgress').value=100;
        $('videoExportStatus').textContent=`Готово: ${name} · ${(resultBlob.size/1024/1024).toFixed(1)} МБ${all?` · ${entries.length} пресетов`:''}`;
        hooks.setStatus(`Видео экспортировано: ${name}`);
      }catch(e){
        $('videoExportStatus').textContent=e.name==='AbortError'?'Экспорт отменён. Файл не сохранён.':`Экспорт остановлен: ${e.message}`;
        hooks.setStatus($('videoExportStatus').textContent);
      }finally{
        try{
          video.pause();if(stream)for(const track of stream.getTracks())track.stop();
          if(destination)audioSource.disconnect(destination);
          if(audioContext?.state==='running')await audioContext.suspend();
          video.muted=snapshot.muted;video.volume=snapshot.volume;video.loop=snapshot.loop;video.playbackRate=snapshot.rate;
          try{await seek(video,snapshot.time);}catch{}
        }finally{
          try{await hooks.end(appSnapshot);}
          finally{run=null;$('videoExportOptions').disabled=false;$('videoExportStart').disabled=false;$('videoExportClose').textContent='Закрыть';}
        }
      }
    };
  }
  window.VideoExport={install,ready,seek};
})();
