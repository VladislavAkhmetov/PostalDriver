import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Bucket, boxGeo, mat, planeGeo } from '../core/geom';
import { makeCanvas, Textures, toTex } from '../core/textures';

/** Shared by geometry, clickable controls and hand targets. Cabin metres, forward -Z. */
export const DASH_CONTROLS = {
  y: .302, z: -1.642,
  wipers: -.025, lights: .095, vent: .035,
  ignition: new THREE.Vector3(-.70,.315,-1.645),
  radio: new THREE.Vector3(.20,.375,-1.635),
};
let speedTemplate: THREE.Group | undefined;
let loading: Promise<void> | undefined;
export function loadDashboardAssets(): Promise<void> {
  return loading ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/cabin-game/uaz-speedometer-game.glb`).then(gltf => {
    const source=(gltf.scene.getObjectByName('speedometer_static') as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const material=new THREE.MeshLambertMaterial({map:source.map,emissive:'#c0ae76',emissiveMap:source.map,emissiveIntensity:0});
    gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.material=material;});
    speedTemplate=gltf.scene;
  });
}

export class Dashboard {
  readonly group=new THREE.Group();
  readonly needles: Record<'speed'|'fuel'|'temp'|'oil'|'amp',THREE.Object3D>;
  readonly lamps: Record<'brake'|'oil'|'charge'|'beam',THREE.MeshBasicMaterial>;
  readonly instrumentMaterial: THREE.MeshLambertMaterial;
  private smallMaterial: THREE.MeshLambertMaterial;

  constructor(T: Textures) {
    if(!speedTemplate)throw new Error('Dashboard assets must load before Cabin construction');
    this.group.name='dashboard';
    const b=new Bucket();
    const add=(key:string,g:THREE.BufferGeometry,x:number,y:number,z:number,c:THREE.ColorRepresentation='#ffffff',rx=0,ry=0,rz=0)=>b.add(key,g,mat(x,y,z,rx,ry,rz),c);
    // One continuous folded section: windscreen shelf, rolled lip, fascia and bottom return.
    // The upper surface stays at the existing clutter/ashtray height; no overlapping slabs.
    const section=[[-1.947,.497],[-1.77,.497],[-1.688,.491],[-1.663,.483],[-1.652,.470],[-1.655,.300],[-1.665,.278],[-1.685,.267],[-1.704,.272],[-1.690,.287],[-1.676,.306],[-1.674,.464],[-1.692,.473],[-1.77,.479],[-1.947,.479]];
    const shape=new THREE.Shape(section.map(([z,y])=>new THREE.Vector2(-z,y)));
    const shell=new THREE.ExtrudeGeometry(shape,{depth:1.8,bevelEnabled:false,steps:1,curveSegments:1});
    shell.rotateY(Math.PI/2);shell.translate(-.9,0,0);
    // UV in metres, independent of triangulation of the end caps.
    const p=shell.attributes.position,uv=shell.attributes.uv;
    for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)*2,(p.getY(i)+p.getZ(i))*2);
    add('paint',shell,0,0,0,'#c4ccc6');
    // Glove compartment: inset dark seam, stamped lid and small latch.
    add('flat',boxGeo(.412,.176,.006),.662,.378,-1.648,'#414a43');
    add('paint',boxGeo(.402,.166,.007),.662,.378,-1.643,'#bdc6bd');
    add('flat',boxGeo(.358,.003,.001),.662,.347,-1.638,'#9ba69b');
    add('flat',new THREE.CylinderGeometry(.009,.009,.008,8),.662,.435,-1.633,'#b3b7a4',Math.PI/2);
    add('flat',boxGeo(.007,.002,.002),.662,.435,-1.628,'#242a22');
    // Slim ventilation slots on the shelf; no per-slot draw calls.
    for(const x of [-.55,.55]) {
      add('flat',boxGeo(.185,.0015,.021),x,.498,-1.867,'#687368');
      for(let i=0;i<4;i++)add('flat',boxGeo(.168,.001,.002),x,.499,-1.875+i*.005,'#252d25');
    }
    // Four small instruments form a compact inset, rather than a raised common pod.
    add('flat',boxGeo(.336,.087,.008),-.626,.403,-1.646,'#313b33');
    add('flat',boxGeo(.326,.077,.003),-.626,.403,-1.640,'#141d18');
    // Black utility plate beside the small gauges, seen in the reference photographs.
    add('flat',boxGeo(.047,.078,.008),-.414,.399,-1.644,'#242b24');
    for(const y of [.369,.429])add('flat',new THREE.CircleGeometry(.003,6),-.414,y,-1.638,'#b8b9a8');
    // Radio, an ashtray and a blanking plug sit in the fascia, not on a floating shelf.
    add('flat',boxGeo(.202,.065,.015),.20,.375,-1.646,'#242b23');
    add('radio',planeGeo(.182,.046),.20,.375,-1.637);
    add('flat',new THREE.CylinderGeometry(.008,.008,.009,10),.117,.375,-1.630,'#70786b',Math.PI/2);
    add('flat',boxGeo(.085,.026,.025),.365,.316,-1.642,'#878c7d');
    add('flat',boxGeo(.069,.004,.019),.365,.330,-1.635,'#21271f');
    add('flat',new THREE.CircleGeometry(.023,16),.373,.408,-1.646,'#a7b3a6');
    // Small amber/red telltale bezel to the right of the speedometer.
    add('flat',new THREE.RingGeometry(.009,.014,12),-.13,.423,-1.643,'#272c24');
    // Small lower switch rail. Switch stems remain separately animated in Cabin.
    add('flat',boxGeo(.184,.042,.008),.035,.302,-1.650,'#293128');
    const radioCanvas=makeCanvas(128,32),radio=radioCanvas.getContext('2d')!;
    radio.fillStyle='#202920';radio.fillRect(0,0,128,32);
    radio.fillStyle='#a5ac95';radio.fillRect(17,3,94,9);
    radio.strokeStyle='#313c2c';for(let x=20;x<110;x+=5){radio.beginPath();radio.moveTo(x,4);radio.lineTo(x,9);radio.stroke();}
    radio.fillStyle='#c46b3e';radio.fillRect(65,3,2,9);
    radio.fillStyle='#0c140d';radio.fillRect(29,16,70,7);
    radio.fillStyle='#7b8975';for(let x=35;x<99;x+=13)radio.fillRect(x,26,9,3);
    for(const x of [8,120]){radio.beginPath();radio.arc(x,20,6,0,Math.PI*2);radio.fill();}
    this.group.add(b.build({paint:new THREE.MeshLambertMaterial({map:T.paintMetal,vertexColors:true}),flat:new THREE.MeshLambertMaterial({vertexColors:true}),radio:new THREE.MeshLambertMaterial({map:toTex(radioCanvas),vertexColors:true})},'dashboard-static'));

    const speed=speedTemplate.clone(true);speed.name='dashboard-speedometer';
    speed.position.set(-.254,.387,-1.642);
    this.group.add(speed);
    this.instrumentMaterial=(speed.getObjectByName('speedometer_static') as THREE.Mesh).material as THREE.MeshLambertMaterial;
    const canvas=makeCanvas(256,64),ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#151e19';ctx.fillRect(0,0,256,64);
    for(let i=0;i<4;i++){
      const x=i*64+32;ctx.strokeStyle='#acb6a3';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(x,32,27,0,Math.PI*2);ctx.stroke();
      for(let k=0;k<7;k++){
        const a=Math.PI*1.25+k*Math.PI/12;
        ctx.beginPath();ctx.moveTo(x+20*Math.cos(a),32+20*Math.sin(a));ctx.lineTo(x+24*Math.cos(a),32+24*Math.sin(a));ctx.stroke();
      }
      ctx.fillStyle='#b9c0a7';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(['Б','°C','М','А'][i],x,48);
    }
    const map=toTex(canvas);this.smallMaterial=new THREE.MeshLambertMaterial({map,emissive:'#b6bc91',emissiveMap:map,emissiveIntensity:0});
    const face=new THREE.Mesh(new THREE.PlaneGeometry(.312,.078),this.smallMaterial);
    face.position.set(-.626,.403,-1.636);this.group.add(face);
    const ns:THREE.Object3D[]=[];
    const needleMat=new THREE.MeshBasicMaterial({color:'#d1c7a8'});
    for(let i=0;i<4;i++){
      const geo=new THREE.PlaneGeometry(.020,.0016);geo.translate(.009,0,0);
      const n=new THREE.Mesh(geo,needleMat);n.name=['fuel_needle','temp_needle','oil_needle','amp_needle'][i];
      n.position.set(-.117+i*.078,0,.001);face.add(n);ns.push(n);
    }
    this.needles={speed:speed.getObjectByName('speed_needle')!,fuel:ns[0],temp:ns[1],oil:ns[2],amp:ns[3]};
    const lamp=(name:string,x:number,y:number,color:string,r=.005)=>{
      const m=new THREE.MeshBasicMaterial({color:'#1c211b'});m.userData.on=new THREE.Color(color);
      const o=new THREE.Mesh(new THREE.CircleGeometry(r,8),m);o.name=name;o.position.set(x,y,-1.634);this.group.add(o);return m;
    };
    this.lamps={brake:lamp('brake_lamp',-.13,.423,'#f03b25',.009),oil:lamp('oil_lamp',-.73,.348,'#f03b25'),charge:lamp('charge_lamp',-.66,.348,'#f03b25'),beam:lamp('beam_lamp',-.59,.348,'#6597e5')};
  }
  setIllumination(on:boolean):void {
    this.instrumentMaterial.emissiveIntensity=on?.22:0;
    this.smallMaterial.emissiveIntensity=on?.22:0;
  }
}
