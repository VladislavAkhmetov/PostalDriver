import * as THREE from 'three';
import { Bucket, boxGeo, mat, planeGeo } from '../core/geom';

/** Fictional district print, drawn in one atlas. No contemporary branding or web assets. */
function printedMatter(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const c = canvas.getContext('2d')!, size = 256;
  for (let tile = 0; tile < 16; tile++) {
    c.save(); c.translate((tile % 4) * size, Math.floor(tile / 4) * size);
    c.beginPath(); c.rect(0, 0, size, size); c.clip();
    c.fillStyle = '#ded5b9'; c.fillRect(0, 0, size, size);
    c.fillStyle = '#39382e'; c.strokeStyle = '#777060'; c.lineWidth = 1;
    const text = (s: string, y: number, font = 'bold 16px serif', color = '#39382e') => {
      c.fillStyle = color; c.font = font; c.textAlign = 'center'; c.fillText(s, 128, y, 232);
    };
    const rule = (y: number) => { c.beginPath(); c.moveTo(14, y); c.lineTo(242, y); c.stroke(); };
    if (tile === 0) {
      text('КЛЮЧЕВСКОЕ ОТДЕЛЕНИЕ СВЯЗИ', 23, '12px serif');
      text('ПУТЕВОЙ ЛИСТ', 49, 'bold 23px serif'); text('№ 001   •   6 мая 1998 г.', 69, '14px monospace');
      for (let y = 86; y < 224; y += 23) rule(y);
      c.textAlign = 'left'; c.font = '12px serif';
      for (const [i, label] of ['Водитель', 'Автомобиль', 'Маршрут', 'Выезд', 'Возвращение', 'Подпись'].entries()) c.fillText(label, 18, 82 + i * 23);
      c.strokeStyle = '#465c88'; c.lineWidth = 2; c.beginPath(); c.arc(205, 214, 23, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#465c88'; c.font = '10px serif'; c.textAlign = 'center'; c.fillText('ПОЧТА', 205, 218);
    } else if (tile === 1) {
      c.fillStyle = '#746146'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#d2c8a7'; c.fillRect(27, 49, 202, 106);
      text('ЖУРНАЛ', 83, 'bold 24px serif'); text('выдачи путевых листов', 112, '16px serif'); text('1998', 141, '20px serif');
    } else if (tile === 2) {
      c.fillStyle = '#7d3730'; c.fillRect(0, 0, 256, 59); text('МАЙ 1998', 40, 'bold 30px serif', '#eee6cf');
      c.font = '15px sans-serif'; c.textAlign = 'center';
      ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].forEach((s, i) => { c.fillStyle = i > 4 ? '#963e31' : '#373a30'; c.fillText(s, 21 + 35 * i, 84); });
      // May 1, 1998 was Friday; the first working day in the game is Wednesday, May 6.
      for (let d = 1; d <= 31; d++) {
        const n = d + 3, col = n % 7, row = Math.floor(n / 7);
        c.fillStyle = col > 4 || d === 1 || d === 9 ? '#963e31' : '#373a30';
        c.fillText(String(d), 21 + col * 35, 112 + row * 27);
        if (d === 6) { c.strokeStyle = '#4c5c83'; c.beginPath(); c.arc(21 + col * 35, 106 + row * 27, 13, 0, Math.PI * 2); c.stroke(); }
      }
    } else if (tile >= 3 && tile <= 5) {
      text(['ЧАСЫ РАБОТЫ', 'ИНФОРМАЦИЯ', 'ОБРАЗЕЦ АДРЕСА'][tile - 3], 33, 'bold 23px serif'); rule(45);
      const lines = tile === 3 ? ['ПН — ПТ', '9:00 — 17:00', 'Перерыв', '13:00 — 14:00', 'Суббота: 9:00 — 13:00', 'Воскресенье — выходной']
        : tile === 4 ? ['Письма и открытки', 'Посылки и переводы', 'Подписка на газеты', 'и журналы', '', 'Бланки заполняйте', 'разборчиво']
        : ['Кому: Иванову И. И.', 'Куда: с. Ключевское', 'ул. Центральная, д. 7', 'Республика Башкортостан', '', 'Укажите почтовый индекс'];
      lines.forEach((s, i) => text(s, 76 + i * 23, '16px serif'));
    } else if (tile === 6 || tile === 7) {
      text(tile === 6 ? 'КЛЮЧЕВСКИЙ' : 'ШИШМӘ', 30, 'bold 29px serif');
      text(tile === 6 ? 'ВЕСТНИК' : 'Район гәзите', 57, tile === 6 ? 'bold 30px serif' : '18px serif');
      rule(65); text('6 мая 1998   •   № 36', 80, '12px serif'); rule(87);
      text(tile === 6 ? 'Весенние заботы' : 'Яҙғы эштәр', 109, 'bold 22px serif');
      c.fillStyle = '#98967b'; c.fillRect(16, 123, 101, 64);
      c.fillStyle = '#656c54'; c.beginPath(); c.moveTo(16, 165); c.lineTo(49, 140); c.lineTo(83, 162); c.lineTo(117, 145); c.lineTo(117, 187); c.lineTo(16, 187); c.fill();
      c.fillStyle = '#6d6856';
      for (let col = 0; col < 3; col++) for (let row = 0; row < 24; row++) {
        if (col < 2 && row < 14) continue;
        c.fillRect(16 + col * 78, 121 + row * 5, 63 - ((row * 11 + col * 7) % 17), 1);
      }
    } else if (tile >= 8 && tile <= 11) {
      const palettes = ['#d9c3a1', '#d3bcb5', '#b3c5bb', '#ded2b0'];
      c.fillStyle = palettes[tile - 8]; c.fillRect(0, 0, 256, 256);
      if (tile === 10) {
        c.fillStyle = '#95b9c0'; c.fillRect(12, 12, 232, 159);
        c.fillStyle = '#638267'; c.beginPath(); c.moveTo(12, 150); c.lineTo(80, 45); c.lineTo(139, 118); c.lineTo(189, 65); c.lineTo(244, 145); c.lineTo(244, 172); c.lineTo(12, 172); c.fill();
        c.fillStyle = '#c3ccab'; c.fillRect(12, 150, 232, 30); text('РОДНЫЕ КРАЯ', 215, 'italic 23px serif', '#405c54');
      } else {
        c.lineWidth = 4;
        for (let i = 0; i < 5; i++) {
          const x = 55 + i * 35, y = 68 + (i % 3) * 24;
          c.strokeStyle = '#536b42'; c.beginPath(); c.moveTo(130, 187); c.lineTo(x, y); c.stroke();
          c.fillStyle = i % 2 ? '#a54f48' : '#b87b63';
          for (let petal = 0; petal < 5; petal++) { const a = petal * Math.PI * 2 / 5; c.beginPath(); c.ellipse(x + Math.cos(a) * 12, y + Math.sin(a) * 12, 11, 7, a, 0, Math.PI * 2); c.fill(); }
          c.fillStyle = '#dcbd68'; c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
        }
        text(tile === 8 ? 'С днём рождения!' : tile === 9 ? 'Поздравляю!' : 'С праздником!', 221, 'italic bold 23px serif', '#88423b');
      }
      c.strokeStyle = '#e9dfc5'; c.lineWidth = 4; c.strokeRect(7, 7, 242, 242);
    } else if (tile === 12) {
      c.fillStyle = '#e7dfc5'; c.fillRect(0, 0, 256, 256);
      c.strokeStyle = '#383c33'; c.lineWidth = 3;
      for (let i = 0; i < 60; i++) { const a = i * Math.PI / 30; const r = i % 5 === 0 ? 93 : 101; c.beginPath(); c.moveTo(128 + Math.sin(a) * r, 128 - Math.cos(a) * r); c.lineTo(128 + Math.sin(a) * 110, 128 - Math.cos(a) * 110); c.stroke(); }
      c.font = '23px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#34392f';
      for (let i = 1; i <= 12; i++) { const a = i * Math.PI / 6; c.fillText(String(i), 128 + Math.sin(a) * 77, 136 - Math.cos(a) * 77); }
      c.lineWidth = 6; c.beginPath(); c.moveTo(68, 119); c.lineTo(128, 128); c.lineTo(215, 128); c.stroke();
      text('КВАРЦ', 169, '11px sans-serif');
    } else if (tile === 13) {
      c.fillStyle = '#d6ceb0'; c.fillRect(0, 0, 256, 256); text('1', 139, 'bold 115px serif'); text('ПРИЁМ И ВЫДАЧА', 191, 'bold 19px serif');
    } else {
      c.fillStyle = '#d7ceb1'; c.fillRect(0, 0, 256, 256);
      text(tile === 14 ? 'ОТКРЫТКИ' : 'ГАЗЕТЫ', 140, 'bold 36px serif');
    }
    c.restore();
  }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; return tex;
}

/** Static detail is batched into a handful of material meshes, not hundreds of draw calls. */
export function addPostOfficeDetails(parent: THREE.Group): { dispose(): void } {
  const atlas = printedMatter();
  const colors: Record<string, string> = {
    oak: '#6b5039', edge: '#9a8059', enamel: '#bfbda6', iron: '#454a42', black: '#292c29',
    paper: '#d8ccb0', green: '#48634c', cloth: '#635a56', red: '#8b4f3b', brass: '#958263',
  };
  const mats: Record<string, THREE.Material> = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, new THREE.MeshLambertMaterial({ color, vertexColors: true })]));
  mats.print = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
  mats.sheet = new THREE.MeshLambertMaterial({ map: atlas, side: THREE.DoubleSide });
  const b = new Bucket();
  const box = (key: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => {
    const g = boxGeo(w, h, d); b.add(key, g, mat(x, y, z, 0, ry)); g.dispose();
  };
  const cylinder = (key: string, r: number, h: number, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const g = new THREE.CylinderGeometry(r, r, h, 10); b.add(key, g, mat(x, y, z, rx, 0, rz)); g.dispose();
  };
  const print = (tile: number, w: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const u = (tile % 4) / 4, v = 1 - Math.floor(tile / 4) / 4;
    // Rack labels use the central strip, keeping lettering legible on a narrow plate.
    const g = planeGeo(w, h, u + .002, v - (tile >= 14 ? .17 : .248), u + .248, v - (tile >= 14 ? .08 : .002));
    b.add('print', g, mat(x, y, z, rx, ry, rz)); g.dispose();
  };

  // Operator sits on +Z, with her back to the window. Drawers open towards her.
  box('edge', 1.41, .018, .015, -1.45, .756, .947);
  for (const x of [-1.98, -.92]) for (const y of [.19, .41, .63]) {
    box('edge', .265, .195, .018, x, y, .902);
    box('oak', .244, .172, .021, x, y, .914);
    box('black', .09, .018, .028, x, y + .025, .936);
  }
  box('green', .68, .008, .5, -1.42, .795, .52);
  box('oak', .24, .024, .31, -1.94, .805, .46);
  print(1, .235, .3, -1.94, .818, .46, -Math.PI / 2);
  box('black', .012, .012, .14, -1.2, .811, .68, .15);
  // Rotary telephone: recognisable receiver, dial, cradle and coiled cable.
  box('black', .27, .065, .21, -1.96, .825, .79);
  cylinder('enamel', .062, .008, -1.96, .862, .828);
  cylinder('black', .032, .012, -1.96, .868, .828);
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; cylinder('black', .008, .009, -1.96 + Math.cos(a) * .047, .87, .828 + Math.sin(a) * .047); }
  box('black', .26, .035, .055, -1.96, .916, .73);
  for (const x of [-2.06, -1.86]) cylinder('black', .039, .058, x, .89, .73);
  for (let i = 0; i < 17; i++) {
    const g = new THREE.TorusGeometry(.014, .004, 4, 8); b.add('black', g, mat(-1.8, .84, .77 + i * .006, 0, Math.PI / 2)); g.dispose();
  }
  // Desk lamp and enamel cup.
  cylinder('green', .09, .026, -.94, .805, .79);
  cylinder('brass', .012, .28, -.94, .955, .79);
  const shade = new THREE.CylinderGeometry(.047, .11, .11, 12); b.add('green', shade, mat(-.94, 1.12, .79)); shade.dispose();
  cylinder('enamel', .038, .085, -.96, .835, .54);
  cylinder('oak', .031, .004, -.96, .88, .54);
  const handle = new THREE.TorusGeometry(.028, .008, 6, 10); b.add('enamel', handle, mat(-.913, .842, .54)); handle.dispose();
  box('black', .09, .025, .065, -1.14, .81, .86); // stamp pad
  box('oak', .04, .018, .03, -1.1, .806, .72); cylinder('black', .012, .045, -1.1, .837, .72);

  // Printed stock follows the existing two rack positions; every cover is visible above its rail.
  for (let row = 0; row < 5; row++) for (const [col, x] of [-.1, .2].entries()) {
    print(8 + (row + col) % 4, .22, .17, x, .34 + row * .22, -1.97);
  }
  for (let row = 0; row < 3; row++) {
    const y = .38 + row * (.95 / 3);
    for (const [col, x] of [1.15, 1.65].entries()) {
      box('paper', .42, .008, .2, x, y - .12, -1.99);
      print(6 + col, .43, .265, x, y + .012, -2.011);
    }
  }
  box('enamel', .65, .13, .025, .05, 1.53, -2.14); print(14, .61, .12, .05, 1.53, -2.125);
  box('enamel', 1.05, .13, .025, 1.4, 1.38, -2.14); print(15, 1, .12, 1.4, 1.38, -2.125);

  // Small document cupboard in the staff corner; storage parcels stay in the adjoining room.
  box('oak', .65, 1.75, .4, -2.34, .875, -1.55);
  for (const x of [-2.5, -2.18]) { box('edge', .303, 1.63, .028, x, .9, -1.337); box('black', .018, .12, .03, x + (x < -2.34 ? .11 : -.11), .88, -1.31); }
  box('paper', .45, .11, .25, -2.34, 1.81, -1.55);
  // Calendar on the left, clock over the racks, public notices on the right.
  box('oak', .025, .55, .4, -2.67, 1.78, .25); print(2, .37, .5, -2.65, 1.78, .25, 0, Math.PI / 2);
  box('oak', .4, .4, .075, 1.75, 2.32, -2.25); print(12, .35, .35, 1.75, 2.32, -2.208);
  box('oak', .055, 1.05, 1.26, 2.65, 1.8, -.53);
  box('green', .02, .95, 1.16, 2.612, 1.8, -.53);
  for (const [i, z] of [-.92, -.53, -.14].entries()) print(3 + i, .34, .6, 2.598, 1.78, z, 0, -Math.PI / 2);
  print(4, .78, .19, 2.597, 2.18, -.53, 0, -Math.PI / 2);
  box('paper', .21, .02, .29, 2.48, 1.074, -.65);
  print(5, .2, .28, 2.48, 1.085, -.65, -Math.PI / 2);
  print(13, .34, .34, .443, 1.91, .975, 0, Math.PI / 2);
  // Painted cast-iron radiator and exposed pipes below the window.
  for (let i = 0; i < 10; i++) {
    const x = -2.4 + i * .12;
    box('enamel', .075, .55, .16, x, .42, 2.1);
    box('enamel', .1, .045, .12, x, .68, 2.1);
  }
  for (const y of [.17, .65]) cylinder('enamel', .018, 1.8, -1.85, y, 2.15, 0, Math.PI / 2);
  cylinder('enamel', .018, 2.65, -2.63, 1.325, 2.15);
  cylinder('red', .035, .012, -2.55, .65, 2.12, Math.PI / 2);
  // A low plant leaves the view and sampled clear panes unobstructed.
  const pot = new THREE.CylinderGeometry(.075, .055, .12, 10); b.add('red', pot, mat(-1.13, 1, 2.23)); pot.dispose();
  for (let i = 0; i < 7; i++) {
    const leaf = new THREE.SphereGeometry(.055, 5, 3); leaf.scale(.45, 1, .32);
    b.add('green', leaf, mat(-1.13 + Math.sin(i * 2) * .04, 1.09 + (i % 3) * .03, 2.23 + Math.cos(i * 2) * .04, .4, i, .3)); leaf.dispose();
  }
  // Cloth over the empty guest-chair back, a low bin and a coir mat at the entrance.
  box('cloth', .24, .35, .035, 1.85, .7, -.45);
  cylinder('iron', .12, .26, -2.34, .13, -.37);
  cylinder('black', .108, .006, -2.34, .263, -.37);
  box('cloth', .85, .015, .48, 1.62, .012, 1.86);
  for (let i = 0; i < 17; i++) box('edge', .022, .003, .44, 1.22 + i * .05, .021, 1.86);

  const group = b.build(mats, 'post-office-details'); parent.add(group);
  // A separate real sheet can slide across the desk and pass into Timur's hand in a cutscene.
  const sheet = new THREE.Mesh(planeGeo(.245, .34, .002, .752, .248, .998), mats.sheet);
  sheet.name = 'post-office-route-sheet'; sheet.position.set(-1.43, .802, .51);
  sheet.rotation.set(-Math.PI / 2, 0, 0); group.add(sheet);
  // Soft contact shade: no point-light hotspot on the low ceiling, no expensive shadow map.
  const aoCanvas = document.createElement('canvas'); aoCanvas.width = aoCanvas.height = 64;
  const ctx = aoCanvas.getContext('2d')!, gradient = ctx.createRadialGradient(32, 32, 3, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(30,24,16,.3)'); gradient.addColorStop(1, 'rgba(30,24,16,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const aoTex = new THREE.CanvasTexture(aoCanvas);
  const aoMat = new THREE.MeshBasicMaterial({map:aoTex,transparent:true,depthWrite:false});
  const aoGroup = new THREE.Group(); aoGroup.name = 'post-office-contact-shadows'; parent.add(aoGroup);
  for (const [x,z,w,d] of [[-1.45,.55,1.7,1.2],[-1.45,1.3,.65,.65],[-2.02,-.55,.65,.65],[1.85,-.65,.65,.65],[.05,-2,.8,.65],[1.4,-2,1.2,.65],[-2.34,-1.55,.8,.6]]) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(w,d),aoMat); shadow.rotation.x=-Math.PI/2; shadow.position.set(x,.004,z); aoGroup.add(shadow);
  }
  return { dispose: () => {
    group.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
    aoGroup.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});
    Object.values(mats).forEach(m=>m.dispose());atlas.dispose();aoMat.dispose();aoTex.dispose();
    group.removeFromParent();aoGroup.removeFromParent();
  }};
}
