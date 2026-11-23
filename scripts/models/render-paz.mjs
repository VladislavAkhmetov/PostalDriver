/** Offline geometry review; no browser, GPU, or model changes. */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('src/assets/cars/paz.glb');
const W = 1200, H = 850, group = new THREE.Group(), textures = new Map();
for (const node of doc.getRoot().listNodes()) {
  if (!node.getMesh()) continue;
  for (const primitive of node.getMesh().listPrimitives()) {
    const geo = new THREE.BufferGeometry();
    for (const [a, b] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['TEXCOORD_0', 'uv']]) {
      const accessor = primitive.getAttribute(a); geo.setAttribute(b, new THREE.BufferAttribute(accessor.getArray().slice(), accessor.getElementSize()));
    }
    geo.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray().slice(), 1));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    mesh.position.fromArray(node.getTranslation()); mesh.quaternion.fromArray(node.getRotation()); mesh.scale.fromArray(node.getScale()); mesh.name = node.getName();
    if (process.argv.includes('--rolling') && mesh.name.startsWith('Wheel_')) mesh.rotation.x += Math.PI / 2;
    group.add(mesh);
    const image = primitive.getMaterial().getBaseColorTexture();
    const pixels = await sharp(Buffer.from(image.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    textures.set(mesh, pixels);
  }
}
group.updateMatrixWorld(true);
group.updateMatrixWorld(true);
mkdirSync('reports/paz',{recursive:true});
const shots = [['front',[0,2.1,8.5]],['front-low',[0,.85,8.5]],['three',[8,4.3,9]],['three-low',[7,1.9,9]],['side',[-11,2.5,0]],['rear',[0,1.15,-8.5]]];
if(process.argv.includes('--wheels')) for(const [name,wheel]of [['wheel-front','Wheel_FL'],['wheel-rear','Wheel_RL']]) {
  const target=group.getObjectByName(wheel).position.toArray();
  shots.push([name,target.map((v,a)=>v+[1.5,.22,.65][a]),target,wheel]);
  shots.push([name+'-inside',target.map((v,a)=>v+[-1.5,.22,.65][a]),target,wheel]);
}
for (const [name, eye, target=[0,1.4,0], only] of shots) {
  const camera = new THREE.PerspectiveCamera(38,W/H,.1,100); camera.position.fromArray(eye); camera.lookAt(...target); camera.updateMatrixWorld();
  const vp = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse);
  const color=Buffer.alloc(W*H*3),depth=new Float32Array(W*H).fill(Infinity);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) { const i=(y*W+x)*3; const b=y>H*.79?146:180; color[i]=b; color[i+1]=b+7; color[i+2]=b; }
  for(const mesh of group.children) {
    if(only && mesh.name!==only)continue;
    const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,ix=g.index;
    const tex=textures.get(mesh),normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const P=Array.from({length:p.count},(_,i)=>{
      const world=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
      const clip=new THREE.Vector4(world.x,world.y,world.z,1).applyMatrix4(vp);
      const nn=new THREE.Vector3().fromBufferAttribute(n,i).applyMatrix3(normalMatrix).normalize();
      return {x:(clip.x/clip.w+1)*W/2,y:(1-clip.y/clip.w)*H/2,z:clip.z/clip.w,iw:1/clip.w,u:uv.getX(i),v:uv.getY(i),light:.75+.25*Math.max(0,nn.dot(new THREE.Vector3(.4,.7,.6).normalize()))};
    });
    for(let t=0;t<ix.count;t+=3) {
      const a=P[ix.getX(t)],b=P[ix.getX(t+1)],c=P[ix.getX(t+2)];
      const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y); if(Math.abs(den)<1e-8)continue;
      const x0=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),x1=Math.min(W-1,Math.ceil(Math.max(a.x,b.x,c.x)));
      const y0=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),y1=Math.min(H-1,Math.ceil(Math.max(a.y,b.y,c.y)));
      for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) {
        const u=((b.y-c.y)*(x+.5-c.x)+(c.x-b.x)*(y+.5-c.y))/den;
        const v=((c.y-a.y)*(x+.5-c.x)+(a.x-c.x)*(y+.5-c.y))/den,w=1-u-v;
        if(u<0||v<0||w<0)continue;
        const z=a.z*u+b.z*v+c.z*w,i=y*W+x;if(z>=depth[i])continue;depth[i]=z;
        const d=a.iw*u+b.iw*v+c.iw*w;
        const tu=(a.u*a.iw*u+b.u*b.iw*v+c.u*c.iw*w)/d,tv=(a.v*a.iw*u+b.v*b.iw*v+c.v*c.iw*w)/d;
        const tx=Math.max(0,Math.min(tex.info.width-1,Math.floor(tu*tex.info.width))),ty=Math.max(0,Math.min(tex.info.height-1,Math.floor(tv*tex.info.height)));
        const ti=(ty*tex.info.width+tx)*3,light=a.light*u+b.light*v+c.light*w;
        for(let ch=0;ch<3;ch++)color[i*3+ch]=Math.min(255,tex.data[ti+ch]*light);
      }
    }
  }
  await sharp(color,{raw:{width:W,height:H,channels:3}}).png().toFile(`reports/paz/${name}${process.argv.includes('--rolling') ? '-rolling' : ''}.png`);
  console.log('rendered',name);
}
