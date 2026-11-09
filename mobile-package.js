/* Read standard ZIP archives locally; export the mobile two-level package. */
(() => {
  'use strict';
  async function unzip(file) {
    const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer);
    let end=bytes.length-22;
    while(end>=Math.max(0,bytes.length-65557) && view.getUint32(end,true)!==0x06054b50)end--;
    if(end<Math.max(0,bytes.length-65557))throw Error('Некорректный ZIP');
    const count=view.getUint16(end+10,true),out=[];
    let pos=view.getUint32(end+16,true);
    for(let i=0;i<count;i++) {
      if(view.getUint32(pos,true)!==0x02014b50)throw Error('Некорректный каталог ZIP');
      const flags=view.getUint16(pos+8,true),method=view.getUint16(pos+10,true),size=view.getUint32(pos+20,true),unpacked=view.getUint32(pos+24,true);
      const length=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),offset=view.getUint32(pos+42,true);
      const name=new TextDecoder().decode(bytes.subarray(pos+46,pos+46+length));
      pos+=46+length+extra+comment;
      if(name.endsWith('/') || name.startsWith('__MACOSX/') || name.split('/').some(p=>p.startsWith('.')))continue;
      if(name.startsWith('/') || name.includes('\\') || name.split('/').some(p=>p==='..'))throw Error('Недопустимый путь ZIP');
      if(flags&1)throw Error('Зашифрованный ZIP не поддерживается');
      if(view.getUint32(offset,true)!==0x04034b50)throw Error('Некорректная запись ZIP');
      const start=offset+30+view.getUint16(offset+26,true)+view.getUint16(offset+28,true);
      let data=bytes.slice(start,start+size);
      if(method===8) data=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else if(method!==0)throw Error('Неподдерживаемое сжатие ZIP: '+method);
      if(data.length!==unpacked)throw Error('Неполные данные ZIP: '+name);
      let crc=0xffffffff;
      for(const byte of data){crc^=byte;for(let b=0;b<8;b++)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1;}
      if(((crc^0xffffffff)>>>0)!==view.getUint32(pos-46-length-extra-comment+16,true))throw Error('Ошибка CRC ZIP: '+name);
      out.push({name,bytes:data});
    }
    return out;
  }
  async function expandLayers(files) {
    const archives=[...files].filter(([path])=>/(^|\/)Layers\.zip$/i.test(path));
    for(const [path,record] of archives) {
      const prefix=path.slice(0,path.lastIndexOf('/')+1);
      for(const entry of await unzip(record.file)) {
        if(!entry.name.startsWith('Layers/'))throw Error('В Layers.zip ожидается дерево Layers/');
        const target=prefix+entry.name;
        if(files.has(target)) {
          const unpacked=new Uint8Array(await files.get(target).file.arrayBuffer());
          if(unpacked.length!==entry.bytes.length || unpacked.some((byte,index)=>byte!==entry.bytes[index]))throw Error('В Layers.zip и папке Layers разные версии файла: '+target+'. Выберите сборку с одним вариантом Layers.');
          continue;
        }
        files.set(target,{file:new File([entry.bytes],entry.name.split('/').pop()),handle:null});
      }
      files.delete(path);
    }
    return archives.length>0;
  }
  async function build(manifest,entries,buildZip) {
    if(entries.some(e=>!e.name.startsWith('Layers/')))throw Error('Неверный путь внутри Layers.zip');
    const layers=buildZip(entries);
    return buildZip([
      {name:'all_in_one.json',bytes:new TextEncoder().encode(JSON.stringify(manifest,null,4)+'\n')},
      {name:'Layers.zip',bytes:new Uint8Array(await layers.arrayBuffer())}
    ]);
  }
  globalThis.MobilePackage={unzip,expandLayers,build};
})();
