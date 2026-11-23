import * as THREE from 'three';
import { Bucket, boxGeo, mat } from '../core/geom';
import { mulberry32 } from '../core/math';
import { makeCanvas, toTex } from '../core/textures';

/** Shared leatherette: small grain, without door screw marks or oversized flutes. */
export function makeCabinVinyl(): THREE.CanvasTexture {
  const canvas=makeCanvas(32,32), ctx=canvas.getContext('2d')!, pixels=ctx.createImageData(32,32), random=mulberry32(452);
  for(let i=0;i<pixels.data.length;i+=4) {
    const shade=96+Math.floor(random()*12);
    pixels.data[i]=shade;pixels.data[i+1]=shade+1;pixels.data[i+2]=shade;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  return toTex(canvas);
}

/** Dimensions shared by the steel apertures and their glass, in cabin metres. */
export const SIDE_WINDOW = { x: .918, front: -1.82, rear: -.70, bottom: .58, top: 1.12, radius: .045, divider: -1.42, rake: .19 };

/** The windshield and the front quarterlight edge share one rake, not two
 * independently guessed rotations. Positive rake moves the top into the cab. */
const glassSlope=SIDE_WINDOW.rake/(SIDE_WINDOW.top-SIDE_WINDOW.bottom);
export const WINDSCREEN = { bottomY:.5, bottomZ:-1.93, height:.62, bow:.055, slope:glassSlope, angle:Math.atan(glassSlope) };
export const windscreenSlantHeight=WINDSCREEN.height/Math.cos(WINDSCREEN.angle);
/** Cabin-space Z of the bowed glass at an absolute height. */
export function windscreenZ(x:number,y:number):number {
  return WINDSCREEN.bottomZ+(y-WINDSCREEN.bottomY)*WINDSCREEN.slope+WINDSCREEN.bow*(x/.85)**2/Math.cos(WINDSCREEN.angle);
}

/** One contour drives sheet metal, rubber and glazing: u = -cabin Z. */
export function sideWindowOutline(inset = 0): THREE.Shape {
  const w=SIDE_WINDOW;
  const points=cabinOutline(-w.rear+inset,w.bottom+inset,-w.front-inset,w.top-inset,Math.max(.008,w.radius-inset)).getPoints();
  for(const p of points) p.x-=w.rake*((p.y-w.bottom)/(w.top-w.bottom))*((p.x+w.rear)/(w.rear-w.front));
  return new THREE.Shape(points);
}

/** Clip the same aperture at the fixed upright, leaving separate panes. */
export function sideWindowPane(quarterlight: boolean): THREE.Shape {
  const points=sideWindowOutline(.017).getPoints();
  const boundary=-SIDE_WINDOW.divider+(quarterlight ? .010 : -.010);
  const inside=(p:THREE.Vector2)=>quarterlight ? p.x>=boundary : p.x<=boundary;
  const result:THREE.Vector2[]=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],c=points[(i+1)%points.length];
    if(inside(a))result.push(a.clone());
    if(inside(a)!==inside(c))result.push(new THREE.Vector2(boundary,a.y+(c.y-a.y)*(boundary-a.x)/(c.x-a.x)));
  }
  return new THREE.Shape(result);
}

/** Two segments per corner retain a purposeful PS2 silhouette. */
export function cabinOutline(x0: number, y0: number, x1: number, y1: number, r: number): THREE.Shape {
  const points: THREE.Vector2[] = [];
  for (const [x,y,a] of [[x1-r,y0+r,-Math.PI/2],[x1-r,y1-r,0],[x0+r,y1-r,Math.PI/2],[x0+r,y0+r,Math.PI]]) {
    for(let i=0;i<=2;i++) points.push(new THREE.Vector2(x+Math.cos(a+i*Math.PI/4)*r,y+Math.sin(a+i*Math.PI/4)*r));
  }
  return new THREE.Shape(points);
}

/** Closed cushion/housing with one bevel, not a subdivided rounded cube. */
export function cabinCushion(w: number, h: number, d: number, radius: number, bevel = .01): THREE.BufferGeometry {
  const g=new THREE.ExtrudeGeometry(cabinOutline(-w/2+bevel,-h/2+bevel,w/2-bevel,h/2-bevel,radius),{
    depth:d-2*bevel,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,steps:1,curveSegments:1,
  });
  g.translate(0,0,-d/2+bevel);
  return g;
}

export function addCabinStructure(b: Bucket): void {
  const add=(key:string,g:THREE.BufferGeometry,x:number,y:number,z:number,c:THREE.ColorRepresentation='#ffffff',rx=0,ry=0,rz=0)=>b.add(key,g,mat(x,y,z,rx,ry,rz),c);
  const steel='#c4ccc6', trim='#252a27', chrome='#9fa6a0';
  const bar=(a:THREE.Vector3,c:THREE.Vector3,r:number,color:THREE.ColorRepresentation=trim)=>{
    const g=new THREE.CylinderGeometry(r,r,a.distanceTo(c),6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),c.clone().sub(a).normalize()));
    const mid=a.clone().add(c).multiplyScalar(.5);add('flat',g,mid.x,mid.y,mid.z,color);
  };
  const side=(g:THREE.BufferGeometry,s:number,offset=0)=>{g.rotateY(Math.PI/2);g.translate(s*(SIDE_WINDOW.x-offset),0,0);return g;};

  // Each door is a single closed sheet with a real window opening. Its edges
  // meet the front frame, floor and rear jamb; no solid panel lies behind glass.
  for(const s of [-1,1]) {
    const outline=cabinOutline(.635,.125,1.91,1.19,.045).getPoints();
    for(const p of outline)p.x=Math.min(p.x,-windscreenZ(SIDE_WINDOW.x,p.y)+.04);
    const door=new THREE.Shape(outline);
    door.holes.push(new THREE.Path(sideWindowOutline().getPoints().reverse()));
    const shell=new THREE.ExtrudeGeometry(door,{depth:.024,bevelEnabled:false,curveSegments:1});
    shell.translate(0,0,-.012);
    add('paint',side(shell,s),0,0,0,steel);
    const seal=sideWindowOutline(-.007);
    seal.holes.push(new THREE.Path(sideWindowOutline(.014).getPoints().reverse()));
    // The two-sided extrusion makes left/right normals unambiguous.
    const gasket=new THREE.ExtrudeGeometry(seal,{depth:.006,bevelEnabled:false,curveSegments:1});
    gasket.translate(0,0,-.003);add('flat',side(gasket,s,.016),0,0,0,'#161b18');
    // Shallow grey leatherette card over the pressed steel, bounded by piping.
    // It deliberately shares the seat material: no extra upholstery draw call.
    add('flat',side(cabinCushion(1.158,.385,.009,.025,.002),s,.020),0,.355,-1.265,'#272d29');
    add('seat',side(cabinCushion(1.142,.369,.010,.022,.002),s,.025),0,.355,-1.265,'#979e98');
    for(const y of [.285,.415]) {
      add('flat',boxGeo(.002,.0015,1.095),s*.887,y,-1.265,'#424a44');
      add('flat',boxGeo(.002,.001,1.095),s*.886,y+.003,-1.265,'#838a80');
    }
    for(const z of [-.735,-1.795])for(const y of [.20,.51]) {
      add('flat',new THREE.CylinderGeometry(.004,.004,.003,6),s*.884,y,z,'#898e85',0,0,Math.PI/2);
    }
    // Belt rail and flocked glass run: a thin dark inset, not a painted beam.
    add('paint',boxGeo(.035,.023,1.16),s*.893,.558,-1.255,steel);
    add('flat',boxGeo(.017,.009,1.10),s*.893,.575,-1.255,'#181e1a');
    add('flat',boxGeo(.018,.515,.020),s*.902,.85,SIDE_WINDOW.divider,'#202722');
    add('flat',boxGeo(.003,.508,.004),s*.891,.85,SIDE_WINDOW.divider-.009,chrome);
    // Quarterlight has its own perimeter, upper/lower pivots and a latch at
    // the bottom of the fixed upright, as seen in the close reference photo.
    const quarter=sideWindowPane(true).getPoints();
    for(let i=0;i<quarter.length;i++) {
      const a=quarter[i],c=quarter[(i+1)%quarter.length];
      if(a.distanceTo(c)>.001)bar(new THREE.Vector3(s*.900,a.y,-a.x),new THREE.Vector3(s*.900,c.y,-c.x),.004,'#343b34');
    }
    for(const y of [.605,1.087])add('flat',boxGeo(.027,.025,.021),s*.891,y,-1.52,'#656e63');
    add('flat',new THREE.CylinderGeometry(.012,.012,.012,6),s*.880,.614,SIDE_WINDOW.divider-.028,'#71796e',0,0,Math.PI/2);
    add('flat',boxGeo(.012,.014,.056),s*.867,.623,SIDE_WINDOW.divider-.012,'#1e241f',-.2);
    // Door release and black bakelite window crank, each with a visible base.
    add('flat',cabinCushion(.085,.055,.023,.012,.003),s*.879,.427,-1.68,trim,0,Math.PI/2);
    add('flat',cabinCushion(.028,.021,.105,.006,.002),s*.851,.44,-1.64,'#343a32',.12);
    add('flat',new THREE.CylinderGeometry(.025,.025,.014,10),s*.875,.397,-1.37,'#1e231f',0,0,Math.PI/2);
    // The driver's crank is articulated by WindowWinder; the passenger's is fixed.
    if (s === 1) {
      bar(new THREE.Vector3(s*.855,.397,-1.37),new THREE.Vector3(s*.847,.365,-1.25),.011,'#242a25');
      add('flat',new THREE.CylinderGeometry(.018,.018,.035,8),s*.831,.365,-1.25,'#181e19',0,0,Math.PI/2);
    }
    // Flat flexible pull strap, mounted diagonally; cylinders looked like rope.
    const strap=[new THREE.Vector3(s*.880,.520,-1.03),new THREE.Vector3(s*.844,.423,-.987),new THREE.Vector3(s*.880,.325,-.92)];
    for(let i=0;i<2;i++) {
      const a=strap[i],c=strap[i+1],mid=a.clone().add(c).multiplyScalar(.5);
      const g=boxGeo(.006,a.distanceTo(c),.026);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),c.clone().sub(a).normalize()));
      add('flat',g,mid.x,mid.y,mid.z,'#242c25');
    }
    for(const p of [strap[0],strap[2]]) {
      add('flat',new THREE.CylinderGeometry(.018,.018,.008,8),p.x,p.y,p.z,'#323a31',0,0,Math.PI/2);
      add('flat',new THREE.CylinderGeometry(.005,.005,.011,6),p.x-s*.005,p.y,p.z,chrome,0,0,Math.PI/2);
    }
    // Roof rail, rear door jamb, sill and the sloping front grab handle.
    add('paint',boxGeo(.047,1.09,.055),s*.9,.67,-.62,steel);
    add('paint',boxGeo(.035,1.10,.35),s*.918,.675,-.445,steel);
    add('paint',boxGeo(.07,.05,1.29),s*.898,.14,-1.265,steel);
    bar(new THREE.Vector3(s*.856,.70,windscreenZ(.918,.70)+.045),new THREE.Vector3(s*.856,1.01,windscreenZ(.918,1.01)+.045),.010,steel);
    for(const y of [.70,1.01])bar(new THREE.Vector3(s*.856,y,windscreenZ(.918,y)+.045),new THREE.Vector3(s*.90,y,windscreenZ(.918,y)+.035),.009,steel);
  }

  // A lightly vaulted steel roof, continuous across its width. The ribs follow
  // the same section and stop at the rails instead of protruding through them.
  const section=[[-.94,1.16],[-.85,1.205],[-.58,1.245],[0,1.26],[.58,1.245],[.85,1.205],[.94,1.16]];
  const roof=new THREE.Shape(section.map(([x,y])=>new THREE.Vector2(x,y)));
  for(const [x,y] of [...section].reverse())roof.lineTo(x,y+.022);
  const roofGeo=new THREE.ExtrudeGeometry(roof,{depth:1.655,bevelEnabled:false,steps:1});
  // Trim the front of the roof to the raked frame, including the corner bow.
  const rp=roofGeo.attributes.position;
  for(let i=0;i<rp.count;i++) {
    const t=rp.getZ(i)/1.655, front=windscreenZ(rp.getX(i),rp.getY(i))-.012;
    rp.setZ(i,front*(1-t)-.235*t);
  }
  roofGeo.computeVertexNormals();
  add('paint',roofGeo,0,0,0,'#d5d9cf');
  // Close the curved header between the windshield flange and vaulted lining.
  const header=new THREE.Shape(section.map(([x,y])=>new THREE.Vector2(x,y+.014)));
  header.lineTo(.94,1.14);header.lineTo(-.94,1.14);
  const headerGeo=new THREE.ExtrudeGeometry(header,{depth:.075,bevelEnabled:false,steps:1});
  const hp=headerGeo.attributes.position;
  for(let i=0;i<hp.count;i++)hp.setZ(i,hp.getZ(i)+windscreenZ(hp.getX(i),hp.getY(i))-.012);
  headerGeo.computeVertexNormals();
  add('paint',headerGeo,0,0,0,steel);
  for(const z of [-1.57,-.94,-.38])for(let i=0;i<section.length-1;i++) {
    const [x,y]=section[i], [xx,yy]=section[i+1];
    bar(new THREE.Vector3(x,y-.008,z),new THREE.Vector3(xx,yy-.008,z),.012,'#b5bcb3');
  }

  // Rounded vinyl seats, accurately attached piping, tubular legs and runners.
  // Hip and eye anchors stay unchanged so seated character animations still fit.
  for(const [x,z] of [[-.48,-.80],[.62,-.60]]) {
    add('seat',cabinCushion(.48,.46,.115,.045,.012),x,.285,z,'#c1c2bf',-Math.PI/2);
    add('seat',cabinCushion(.48,.53,.095,.045,.012),x,.58,z+.215,'#b6b8b4',.12);
    for(const sx of [-.205,.205]) {
      add('flat',boxGeo(.028,.022,.43),x+sx,.151,z,trim);
      bar(new THREE.Vector3(x+sx,.16,z-.15),new THREE.Vector3(x+sx,.237,z-.15),.012);
      bar(new THREE.Vector3(x+sx,.16,z+.15),new THREE.Vector3(x+sx,.237,z+.15),.012);
      bar(new THREE.Vector3(x+sx,.24,z+.25),new THREE.Vector3(x+sx,.83,z+.315),.012);
    }
    // Thin perimeter seam shares the cushion footprint and is merged with trim.
    const loop=cabinOutline(-.227,-.217,.227,.217,.04).getPoints();
    for(let i=0;i<loop.length-1;i++)bar(new THREE.Vector3(x+loop[i].x,.31,z+loop[i].y),new THREE.Vector3(x+loop[i+1].x,.31,z+loop[i+1].y),.0035,'#484b46');
  }

  // Mirror arms terminate at the back of each housing, with fixed door mounts.
  for(const s of [-1,1]) {
    add('flat',boxGeo(.025,.11,.065),s*.944,.75,-1.875,trim);
    const end=new THREE.Vector3(s*1.2,.84,-1.915);
    bar(new THREE.Vector3(s*.957,.80,-1.875),end,.009);
    bar(new THREE.Vector3(s*.957,.70,-1.875),end,.008);
  }
}
