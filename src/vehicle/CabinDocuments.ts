import * as THREE from 'three';
import { Bucket, boxGeo, mat } from '../core/geom';
import { makeCanvas, toTex } from '../core/textures';
import { mulberry32 } from '../core/math';

type Rect = { x:number; y:number; w:number; h:number };
const SIZE=512;
const WAYBILL:Rect={x:0,y:0,w:256,h:352};
const REGISTER:Rect={x:256,y:0,w:256,h:352};
const ENVELOPE:Rect={x:0,y:352,w:256,h:160};
const FOLDER:Rect={x:256,y:352,w:256,h:160};

/** Fictional working papers inspired by late-1990s forms, not a usable facsimile.
 * A single opaque atlas covers every sheet, the envelope and the cardboard. */
export function makeDocumentAtlas():THREE.CanvasTexture {
  const canvas=makeCanvas(SIZE,SIZE),g=canvas.getContext('2d')!,random=mulberry32(1998);
  const line=(x:number,y:number,xx:number,yy:number,color='#77766b',width=.65)=>{
    g.strokeStyle=color;g.lineWidth=width;g.beginPath();g.moveTo(x,y);g.lineTo(xx,yy);g.stroke();
  };
  const type=(text:string,x:number,y:number,size=8,bold=false)=>{
    g.fillStyle='#414238';g.font=`${bold?'bold ':''}${size}px "Times New Roman", serif`;g.fillText(text,x,y);
  };
  const hand=(text:string,x:number,y:number,size=10)=>{
    g.save();g.translate(x,y);g.transform(1,-.025,-.18,1,0,0);
    g.fillStyle='#4b5680';g.font=`italic ${size}px cursive`;g.fillText(text,0,0);g.restore();
  };
  const signature=(x:number,y:number)=>{
    g.strokeStyle='#4d527a';g.lineWidth=.9;g.beginPath();g.moveTo(x,y);
    g.bezierCurveTo(x+5,y-11,x+9,y+8,x+13,y-6);g.bezierCurveTo(x+3,y-3,x+21,y+4,x+27,y-4);
    g.lineTo(x+22,y+2);g.lineTo(x+38,y-1);g.stroke();
  };
  const stock=(r:Rect,color:string)=>{
    g.save();g.beginPath();g.rect(r.x,r.y,r.w,r.h);g.clip();g.translate(r.x,r.y);
    g.fillStyle=color;g.fillRect(0,0,r.w,r.h);
    for(let i=0;i<2600;i++) {g.fillStyle=`rgba(80,65,35,${random()*.055})`;g.fillRect(random()*r.w,random()*r.h,1,1);}
    g.strokeStyle='rgba(126,101,62,.18)';g.lineWidth=4;g.strokeRect(1,1,r.w-2,r.h-2);
  };
  const fold=(w:number,h:number)=>{
    line(w*.49,5,w*.51,h-6,'rgba(108,91,58,.13)',1);
    line(w*.49+1,5,w*.51+1,h-6,'rgba(255,255,245,.35)',1);
    line(5,h*.53,w-7,h*.53+1,'rgba(108,91,58,.10)',1);
  };

  stock(WAYBILL,'#dedbca');
  g.save();g.translate(15,15);g.rotate(-.055);g.strokeStyle='rgba(87,68,120,.64)';g.lineWidth=.8;g.strokeRect(0,0,80,31);
  g.fillStyle='rgba(87,68,120,.75)';g.font='bold 6px serif';g.textAlign='center';
  g.fillText('КЛЮЧЕВСКИЙ',40,9);g.fillText('РАЙОННЫЙ УЗЕЛ СВЯЗИ',40,17);g.fillText('ДИСПЕТЧЕРСКАЯ',40,25);g.restore();
  type('Форма 4-П',194,17,7);type('Серия ПС',173,29,7);
  type('ПУТЕВОЙ ЛИСТ',66,66,16,true);
  type('грузового автомобиля',79,78,9);
  type('№',83,94,9);hand('0041',98,94,11);hand('май 1998 г.',158,94,10);
  type('Организация',12,111,7);hand('Ключевский узел связи',69,111,9);line(66,114,243,114);
  type('Автомобиль',12,130,7);hand('УАЗ-452',72,130,10);type('Гаражный №',157,130,7);hand('07',222,130,10);line(66,133,243,133);
  type('Водитель',12,149,7);hand('Тимур',69,149,10);line(66,152,243,152);
  type('РАБОТА ВОДИТЕЛЯ И АВТОМОБИЛЯ',35,173,9,true);
  for(const y of [179,197,216,235])line(12,y,244,y);
  for(const x of [12,93,137,184,244])line(x,179,x,235);
  type('Операция',20,191,7);type('Время',103,191,7);type('Спидометр',142,191,7);type('Топливо, л',191,191,7);
  type('Выезд из гаража',17,209,7);hand('7:30',102,210,9);hand('47218',144,210,9);hand('38',205,210,9);
  type('Возвращение',17,228,7);hand('18:10',102,230,9);hand('47364',144,230,9);hand('19',205,230,9);
  type('ЗАДАНИЕ ВОДИТЕЛЮ',69,253,10,true);
  for(const y of [260,278,296])line(12,y,244,y);
  for(const x of [12,38,194,244])line(x,260,x,296);
  type('1',22,273,8);hand('Урманлы — Ключевск',45,273,9);hand('почта',199,273,9);
  type('2',22,291,8);hand('Сосновка — отделение связи',45,291,8);hand('мешки',199,291,8);
  type('Автомобиль технически исправен',13,312,7);type('Водитель',139,333,7);type('Механик',13,333,7);
  signature(56,333);signature(184,333);fold(256,352);g.restore();

  stock(REGISTER,'#e5dfcc');
  type('РАЙОННЫЙ УЗЕЛ СВЯЗИ',36,24,11,true);
  type('НАКЛАДНАЯ № 128',48,46,16,true);
  type('на отправку почты по маршруту',39,62,9);
  hand('Ключевск — Урманлы',37,83,12);line(15,88,241,88);
  type('Май 1998 г.',16,104,8);type('Экземпляр для водителя',135,104,7);
  for(const y of [120,145,172,199,226,253,280])line(14,y,242,y);
  for(const x of [14,39,151,191,242])line(x,120,x,280);
  type('№',22,137,8);type('Наименование',59,137,8);type('Мест',159,137,8);type('Отметка',199,137,8);
  const rows=[['Письма заказные','12'],['Газеты и журналы','4'],['Посылки','3'],['Почтовые мешки','2']];
  rows.forEach(([label,count],i)=>{const y=164+i*27;type(String(i+1),23,y,9);type(label,46,y,8);hand(count,163,y,11);hand('принято',196,y,8);});
  type('Всего мест',47,272,8,true);hand('21',163,273,12);
  type('Сдал',16,304,8);signature(48,303);type('Принял',135,304,8);signature(183,304);
  g.save();g.translate(194,325);g.rotate(.13);g.strokeStyle='rgba(91,64,128,.48)';g.lineWidth=1;
  g.beginPath();g.arc(0,0,18,0,Math.PI*2);g.stroke();g.beginPath();g.arc(0,0,15,0,Math.PI*2);g.stroke();
  g.fillStyle='rgba(91,64,128,.65)';g.font='6px serif';g.textAlign='center';g.fillText('УЗЕЛ СВЯЗИ',0,-2);g.fillText('КЛЮЧЕВСК',0,6);g.restore();
  fold(256,352);g.restore();

  stock(ENVELOPE,'#c6b895');
  line(5,5,127,90,'#a79a78');line(250,5,127,90,'#a79a78');
  type('СЛУЖЕБНАЯ КОРРЕСПОНДЕНЦИЯ',21,111,10,true);
  hand('Начальнику отделения связи',26,132,10);
  g.strokeStyle='#817a67';g.lineWidth=.7;g.strokeRect(203,16,33,39);type('ПОЧТА',207,39,7);
  g.restore();

  stock(FOLDER,'#978465');
  for(let i=0;i<95;i++){g.fillStyle='rgba(214,198,158,.16)';g.fillRect(random()*256,random()*160,3+random()*12,1);}
  line(19,0,19,160,'#75664e',1);line(22,0,22,160,'#b3a181',1);
  type('ДЕЛО № 7',90,55,16,true);type('ПУТЕВЫЕ ЛИСТЫ',64,77,12,true);type('1998 г.',104,98,12);
  g.restore();
  return toTex(canvas,{repeat:false});
}

/** Only the upper face carries writing. Three subdivisions support a small
 * curled corner; paper edges and backing remain plain solid geometry. */
function sheet(w:number,d:number,r:Rect,curl=0):THREE.BufferGeometry {
  const g=new THREE.PlaneGeometry(w,d,2,3);g.rotateX(-Math.PI/2);
  const p=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++) {
    const lift=Math.max(0,(p.getX(i)/w-.15)/.35)*Math.max(0,(p.getZ(i)/d-.16)/.34)*curl;
    p.setY(i,lift);
    uv.setXY(i,(r.x+.5+uv.getX(i)*(r.w-1))/SIZE,1-(r.y+.5+(1-uv.getY(i))*(r.h-1))/SIZE);
  }
  g.computeVertexNormals();return g;
}

export function addCabinDocuments(b:Bucket):void {
  const add=(key:string,g:THREE.BufferGeometry,x:number,y:number,z:number,ry=0,color:THREE.ColorRepresentation='#ffffff')=>b.add(key,g,mat(x,y,z,0,ry,0),color);
  // A worn cardboard folder supports loose A4-ish sheets, rather than a solid
  // block with the same printed image repeated down every side.
  const main=mat(.015,.603,-1.025,0,-.10,0);
  b.add('flat',boxGeo(.226,.003,.312),main,'#807154');
  b.add('documents',sheet(.226,.312,FOLDER),main.clone().multiply(mat(0,.0016,0)));
  for(let i=0;i<3;i++)b.add('flat',boxGeo(.203,.00055,.285),main.clone().multiply(mat(.002-i*.001,.002+i*.0007,.004-i*.002,0,(i-1)*.009,0)),['#c9c5b5','#c1bea9','#d8d5c5'][i]);
  // Blue-black carbon sheet just peeks out underneath the actual form.
  b.add('flat',boxGeo(.200,.0004,.279),main.clone().multiply(mat(.003,.0041,.004,0,.018,0)),'#444a59');
  b.add('documents',sheet(.198,.279,WAYBILL,.003),main.clone().multiply(mat(-.003,.0048,-.003,0,-.015,0)));
  // Small metal spring clip: no giant printed rectangle masquerading as metal.
  b.add('flat',boxGeo(.041,.004,.016),main.clone().multiply(mat(0,.008,-.133)),'#777b72');
  b.add('flat',boxGeo(.030,.001,.008),main.clone().multiply(mat(0,.0105,-.135)),'#adb0a1');
  for(const x of [-.013,.013])b.add('flat',boxGeo(.003,.002,.004),main.clone().multiply(mat(x,.011,-.135)),'#51584e');
  // A postal consignment note overlaps the folder; its far corner curls by 4 mm.
  const loose=mat(.170,.612,-.865,0,.16,0);
  b.add('flat',boxGeo(.151,.0007,.213),loose.clone().multiply(mat(.002,-.0013,.001)),'#bdbba7');
  b.add('documents',sheet(.148,.209,REGISTER,.004),loose);
  // A folded kraft service envelope partly under the consignment note.
  add('flat',boxGeo(.170,.0015,.106),.159,.606,-.755,-.07,'#ad9a75');
  add('documents',sheet(.170,.106,ENVELOPE,.0015),.159,.607,-.755,-.07);
}
