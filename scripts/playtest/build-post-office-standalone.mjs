// Offline preview for screenshot review when localhost is unavailable to the browser.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const mime = {'.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary','.fbx':'application/octet-stream'};
const result = await build({
  entryPoints:['src/previews/PostOfficePreview.ts'], bundle:true, write:false, format:'iife', minify:true,
  plugins:[{name:'inline-assets',setup(api){
    api.onResolve({filter:/\?(url|raw)$/},args=>({path:path.resolve(args.resolveDir,args.path),namespace:'inline-asset'}));
    api.onLoad({filter:/.*/,namespace:'inline-asset'},args=>{
      const [filename,kind]=args.path.split('?'); const bytes=readFileSync(filename);
      const value=kind==='raw'?bytes.toString('utf8'):`data:${mime[path.extname(filename)]||'application/octet-stream'};base64,${bytes.toString('base64')}`;
      return {contents:'export default '+JSON.stringify(value),loader:'js'};
    });
  }}],
});
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const html=readFileSync('post-office-preview.html','utf8').replace(/<script type="module"[^>]*><\/script>/,()=>`<script>${js}</script>`);
mkdirSync('reports/post-office',{recursive:true});
writeFileSync('reports/post-office/standalone.html',html);
console.log('Offline preview created:',Math.round(Buffer.byteLength(html)/1024/1024)+' MB');
