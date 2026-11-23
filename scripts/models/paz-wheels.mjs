import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { Matrix4, Vector3, BufferGeometry, BufferAttribute } from 'three';
import sharp from 'sharp';
import { straightenWheel } from './wheel-axis.mjs';

const TILE=256, DIAMETER=.92;
const quantile=(a,f)=>a[Math.floor((a.length-1)*f)];
const project=(p,chart,width)=> chart<2 ? [p[2]/DIAMETER+.5,.5-p[1]/DIAMETER] : [Math.atan2(p[1],p[2])/(2*Math.PI)+.5,p[0]/width+.5];
function clipSeam(poly,keepLow) {
  const result=[];
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length],insideA=keepLow?a.uv[0]<=1:a.uv[0]>=1,insideB=keepLow?b.uv[0]<=1:b.uv[0]>=1;
    if(insideA)result.push(a);
    if(insideA!==insideB) {
      const t=(1-a.uv[0])/(b.uv[0]-a.uv[0]),mix=(a,b)=>a.map((v,i)=>v+(b[i]-v)*t);
      result.push({position:mix(a.position,b.position),normal:mix(a.normal,b.normal),uv:mix(a.uv,b.uv)});
    }
  }
  return result;
}

async function prepare(file,width,alignAxis=false) {
  const source=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
  const node=source.getRoot().listNodes().find(n=>n.getMesh()),primitive=node.getMesh().listPrimitives()[0];
  const pos=primitive.getAttribute('POSITION'),uv=primitive.getAttribute('TEXCOORD_0'),ix=primitive.getIndices();
  const matrix=new Matrix4().fromArray(node.getWorldMatrix());
  let points=Array.from({length:pos.getCount()},(_,i)=>new Vector3(...pos.getElement(i,[])).applyMatrix4(matrix).toArray());
  let sourceAxis=[0,0,1];
  if(alignAxis) {const corrected=straightenWheel(points);points=corrected.points;sourceAxis=corrected.axis;}
  const lo=[0,1,2].map(a=>Math.min(...points.map(p=>p[a]))),hi=[0,1,2].map(a=>Math.max(...points.map(p=>p[a])));
  const center=lo.map((v,a)=>(v+hi[a])/2);
  const uniform=DIAMETER/Math.max(hi[0]-lo[0],hi[1]-lo[1]);
  // Front: preserve the original proportions after correcting the source axis.
  // Rear: retain the previously approved dimensions and geometry preparation.
  if(alignAxis)width=(hi[2]-lo[2])*uniform;
  const scale=alignAxis?[uniform,uniform,uniform]:[DIAMETER/(hi[0]-lo[0]),DIAMETER/(hi[1]-lo[1]),width/(hi[2]-lo[2])];
  // The six-bolt outer face of both supplied sources points along +Z.
  const P=points.map(p=>{
    let [x,y,z]=p.map((v,a)=>(v-center[a])*scale[a]);
    const r=Math.hypot(x,y);
    if(r>.4){const target=.46-(.46-Math.min(.46,r))*.4;x*=target/r;y*=target/r;}
    return [z,y,-x];
  });
  const UV=Array.from({length:uv.getCount()},(_,i)=>uv.getElement(i,[])),IX=Array.from(ix.getArray());
  const {data:sourceImage,info}=await sharp(Buffer.from(primitive.getMaterial().getBaseColorTexture().getImage()))
    .resize(1024,1024).removeAlpha().raw().toBuffer({resolveWithObject:true});
  const charts=[];
  for(let chart=0;chart<4;chart++) {
    const data=Buffer.alloc(TILE*TILE*3,chart===3?130:28),mask=new Uint8Array(TILE*TILE).fill(chart===3?2:0),depth=new Float32Array(TILE*TILE).fill(-Infinity);
    for(let t=0;t<IX.length;t+=3) {
      const ids=IX.slice(t,t+3),points=ids.map(i=>P[i]),q=points.map(p=>project(p,chart,width));
      if(chart>=2 && Math.max(...q.map(p=>p[0]))-Math.min(...q.map(p=>p[0]))>.5)
        q.forEach(p=>{if(p[0]<.5)p[0]+=1;});
      const z=points.map(p=>chart===0?p[0]:chart===1?-p[0]:chart===2?Math.hypot(p[1],p[2]):-Math.hypot(p[1],p[2]));
      const r=points.map(p=>Math.hypot(p[1],p[2]));
      if(chart===3) {
        const radial=(r[0]+r[1]+r[2])/3;
        const face=new Vector3(...points[1]).sub(new Vector3(...points[0])).cross(new Vector3(...points[2]).sub(new Vector3(...points[0]))).normalize();
        if(radial<.21||radial>.34||Math.abs(face.x)>.7)continue;
      }
      const [a,b,c]=q.map(p=>p.map(v=>v*TILE));
      const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)continue;
      const x0=Math.floor(Math.min(a[0],b[0],c[0])),x1=Math.ceil(Math.max(a[0],b[0],c[0]));
      const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(TILE-1,Math.ceil(Math.max(a[1],b[1],c[1])));
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
        if(chart<2&&(x<0||x>=TILE))continue;
        const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den;
        const v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den,w=1-u-v;
        if(Math.min(u,v,w)<-.003)continue;
        const pixel=y*TILE+((x%TILE+TILE)%TILE),d=z[0]*u+z[1]*v+z[2]*w;
        if(d<depth[pixel])continue;depth[pixel]=d;
        const tu=UV[ids[0]][0]*u+UV[ids[1]][0]*v+UV[ids[2]][0]*w,tv=UV[ids[0]][1]*u+UV[ids[1]][1]*v+UV[ids[2]][1]*w;
        const tx=Math.max(0,Math.min(info.width-1,Math.floor(tu*info.width))),ty=Math.max(0,Math.min(info.height-1,Math.floor(tv*info.height))),o=(ty*info.width+tx)*3;
        for(let c=0;c<3;c++)data[pixel*3+c]=sourceImage[o+c];
        mask[pixel]=chart===3||(chart<2 && r[0]*u+r[1]*v+r[2]*w<.3)?2:1;
      }
    }
    charts.push({data,mask});
  }
  const distributions=[[],[],[]];
  for(const {data,mask}of charts)for(let i=0;i<mask.length;i++)if(mask[i])distributions[mask[i]].push((data[i*3]+data[i*3+1]+data[i*3+2])/3);
  distributions.forEach(a=>a.sort((a,b)=>a-b));
  for(const {data,mask}of charts)for(let i=0;i<mask.length;i++) {
    const kind=mask[i]||1,a=distributions[kind],lum=(data[i*3]+data[i*3+1]+data[i*3+2])/3;
    const low=quantile(a,.15),high=quantile(a,.85),t=Math.max(0,Math.min(1,(lum-low)/Math.max(1,high-low)));
    const value=kind===1?24+t*22:(lum<32?27:Math.max(105,Math.min(150,130+(lum-quantile(a,.5))*.25)));
    data[i*3]=value;data[i*3+1]=value+1;data[i*3+2]=value-(kind===2?5:1);
  }
  // Simplify the watertight geometry independently of the fragmented source UVs.
  // New planar/cylindrical UVs refer to the baked charts above.
  await MeshoptSimplifier.ready;
  const welded=[],remap=[],unique=new Map();
  for(const p of P) {
    const key=p.map(v=>Math.round(v*1e6)).join(',');
    if(!unique.has(key)){unique.set(key,welded.length);welded.push(p);}
    remap.push(unique.get(key));
  }
  const [result]=MeshoptSimplifier.simplify(new Uint32Array(IX.map(i=>remap[i])),new Float32Array(welded.flat()),3,2600*3,.01,[]);
  const geometry=new BufferGeometry().setAttribute('position',new BufferAttribute(new Float32Array(welded.flat()),3));
  geometry.setIndex(new BufferAttribute(result,1));geometry.computeVertexNormals();
  const normals=geometry.attributes.normal;
  const p=[],n=[],tex=[],indices=[];
  for(let t=0;t<result.length;t+=3) {
    const ids=Array.from(result.slice(t,t+3)),vertices=ids.map(i=>welded[i]);
    const a=new Vector3(...vertices[1]).sub(new Vector3(...vertices[0])),b=new Vector3(...vertices[2]).sub(new Vector3(...vertices[0]));
    const face=a.cross(b).normalize();
    const radial=vertices.reduce((sum,p)=>sum+Math.hypot(p[1],p[2]),0)/3;
    const chart=radial<.21?0:radial<.35 ? (Math.abs(face.x)>.4?0:3) : (Math.abs(face.x)>.4?0:2);
    const q=vertices.map(p=>project(p,chart,width));
    if(chart>=2&&Math.max(...q.map(p=>p[0]))-Math.min(...q.map(p=>p[0]))>.5)q.forEach(p=>{if(p[0]<.5)p[0]+=1;});
    const poly=vertices.map((position,j)=>({position,normal:[normals.getX(ids[j]),normals.getY(ids[j]),normals.getZ(ids[j])],uv:q[j]}));
    const emit=(poly,shift=0)=>{
      for(let j=1;j+1<poly.length;j++)for(const vertex of[poly[0],poly[j],poly[j+1]]) {
        p.push(...vertex.position);n.push(...vertex.normal);tex.push(vertex.uv[0]-shift,vertex.uv[1],chart);indices.push(indices.length);
      }
    };
    if(chart>=2&&q.some(p=>p[0]>1)) {emit(clipSeam(poly,true));emit(clipSeam(poly,false),1);}
    else emit(poly);
  }
  console.log('wheel source',file,'triangles',result.length/3,'width',width,'sourceAxis',sourceAxis);
  return {p,n,tex,indices,charts,width,sourceAxis};
}

export async function appendPazWheels(doc,scene,buffer,mounts,frontFile,rearFile) {
  const variants=[await prepare(frontFile,null,true),await prepare(rearFile,.50)];
  // Correcting the oblique front source changes which texels cover its tyre.
  // Match it to the approved rear wheel, without altering the rear atlas.
  const sampleTone=(wheel,kind)=>{
    const values=[];
    for(let i=0;i<wheel.p.length;i+=3) {
      const radius=Math.hypot(wheel.p[i+1],wheel.p[i+2]);
      if(kind===1?radius<=.38:radius>=.29)continue;
      const [u,v,chart]=wheel.tex.slice(i,i+3),x=Math.max(0,Math.min(TILE-1,Math.floor(u*TILE))),y=Math.max(0,Math.min(TILE-1,Math.floor(v*TILE)));
      const data=wheel.charts[chart].data,o=(y*TILE+x)*3,lum=(data[o]+data[o+1]+data[o+2])/3;
      if(kind===1?lum<55:lum>65)values.push(lum);
    }
    values.sort((a,b)=>a-b);return quantile(values,.5);
  };
  for(const kind of [1,2]) {
    const delta=sampleTone(variants[1],kind)-sampleTone(variants[0],kind);
    for(const {data,mask} of variants[0].charts)for(let i=0;i<mask.length;i++)if((mask[i]||1)===kind)
      for(let ch=0;ch<3;ch++)data[i*3+ch]=Math.max(kind===1?18:25,Math.min(kind===1?49:155,data[i*3+ch]+delta));
  }
  const composites=[];
  for(const [i,w]of variants.entries())for(const [chart,{data}]of w.charts.entries())
    composites.push({input:data,raw:{width:TILE,height:TILE,channels:3},left:(i*2+chart%2)*TILE,top:chart>=2?TILE:0});
  const atlas=await sharp({create:{width:TILE*4,height:TILE*2,channels:3,background:'#242523'}}).composite(composites).jpeg({quality:90,chromaSubsampling:'4:4:4'}).toBuffer();
  const texture=doc.createTexture('Matched wheel rubber and steel').setImage(atlas).setMimeType('image/jpeg');
  const material=doc.createMaterial('Wheel_rubber_steel').setBaseColorTexture(texture).setMetallicFactor(0).setRoughnessFactor(1).setDoubleSided(true);
  const meshes=[];
  for(const [i,w]of variants.entries()) {
    const acc=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer),uv=[];
    for(let j=0;j<w.tex.length;j+=3) {
      const [u,v,chart]=w.tex.slice(j,j+3),x=i*2+chart%2,y=chart>=2?1:0;
      uv.push((x+Math.max(.002,Math.min(.998,u)))/4,(y+Math.max(.002,Math.min(.998,v)))/2);
    }
    const primitive=doc.createPrimitive().setMaterial(material)
      .setAttribute('POSITION',acc('VEC3',new Float32Array(w.p)))
      .setAttribute('NORMAL',acc('VEC3',new Float32Array(w.n)))
      .setAttribute('TEXCOORD_0',acc('VEC2',new Float32Array(uv)))
      .setIndices(acc('SCALAR',new Uint16Array(w.indices)));
    meshes.push(doc.createMesh(i===0?'Supplied_front_wheel':'Supplied_rear_wheel').addPrimitive(primitive));
  }
  for(const mount of mounts) {
    const front=mount.name.startsWith('Wheel_F'),side=Math.sign(mount.cx),variant=variants[front?0:1],x=side*(front?1.26-variant.width/2:1.01);
    scene.addChild(doc.createNode(mount.name).setMesh(meshes[front?0:1]).setTranslation([x,.46,mount.cz])
      .setRotation(side>0?[0,0,0,1]:[0,1,0,0]).setExtras({radius:.46,width:variant.width,sourceAxis:variant.sourceAxis,source:front?'pazik_wheel_front.glb':'pazik_wheel_back.glb'}));
  }
}
