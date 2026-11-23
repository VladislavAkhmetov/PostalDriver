import * as THREE from 'three';
import { Human, Person, type Outfit } from './People';

export const ALIA_OUTFIT: Outfit = {colors:{Hair:'#493229',HairBase:'#493229',Skin:'#d4aa8c',Jacket:'#728d9a',LightJacket:'#728d9a',Shirt:'#e5dcc7',Pants:'#353b43',Shoes:'#514235'}};
export function dressAlia(h: Human, seated = false): void {
  const hair = new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshLambertMaterial({color:'#493229'}));
  hair.scale.set(.07,.13,.065);
  hair.position.copy(h.bindAt('Head')).add(new THREE.Vector3(0,.04,-.12));
  h.attach('Head',hair);
  if (seated) return;
  const bag = new THREE.Mesh(new THREE.BoxGeometry(.27,.3,.09),new THREE.MeshLambertMaterial({color:'#b4a283'}));
  bag.position.copy(h.bindAt('Hips')).add(new THREE.Vector3(-.22,-.16,0));
  h.attach('Hips',bag);
  const strap = new THREE.Mesh(new THREE.BoxGeometry(.035,.58,.025),new THREE.MeshLambertMaterial({color:'#8f7f65'}));
  strap.position.copy(h.bindAt('Hips')).add(new THREE.Vector3(-.22,.22,.04));
  h.attach('Hips',strap);
  const book = new THREE.Mesh(new THREE.BoxGeometry(.18,.1,.06),new THREE.MeshLambertMaterial({color:'#59765a'}));
  book.position.copy(h.bindAt('Hips')).add(new THREE.Vector3(-.22,.01,0));
  h.attach('Hips',book);
}
export function makeAlia(): Person {
  const p = new Person('woman',ALIA_OUTFIT);
  dressAlia(p.human);
  return p;
}
