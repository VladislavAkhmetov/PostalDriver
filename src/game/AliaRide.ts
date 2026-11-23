import type { Ground } from '../world/Ground';
import type { World } from '../world/World';
import type { Person } from '../world/People';
import type { Vehicle } from '../vehicle/Vehicle';
import { makeAlia } from '../world/Alia';
import { ALIA, aliaScene, aliaShift, completeAlia, readAlia, type AliaShift, type AliaState } from './AliaStory';

export interface AliaHooks {
  choice(who: string, text: string, options: string[], pick: (i: number) => void): void;
  closeChoice(): void;
  choiceOpen(): boolean;
  say(who: string, text: string): void;
  hint(text: string): void;
  clearHint(): void;
  seat(on: boolean): void;
  complete(state: AliaState): void;
}
/** Physical locations shared by the encounter and tests; no new road or interior. */
export function aliaPlaces(world: World, ground: Ground) {
  const home = world.villageHomes.find(h => h.id === 'alia');
  if (!home) throw new Error('Alia needs her Urmanly plot');
  const roadPoint = (road: Ground['main'], s: number, side: number) => {
    const f = road.frame(s), lat = side * (road.zoneAt(s).width / 2 + 2.5);
    return {x:f.x+f.rx*lat,z:f.z+f.rz*lat,rot:Math.atan2(-f.rx*side,-f.rz*side)};
  };
  return {home:roadPoint(ground.homeRoad,home.s,home.side),town:roadPoint(ground.main,118,1),post:world.postDoor};
}

/** One optional commute. No mission time, reward, penalty or main-route passenger. */
export class AliaRide {
  private state: 'wait'|'asked'|'ride'|'arrival'|'leaving'|'done' = 'wait';
  private person: Person | null = null;
  private wait = 0;
  private still = 0;
  private chat = 10;
  private said = false;
  private hinted = false;
  private leave = 0;
  private readonly before: AliaState;
  private readonly scene;
  private readonly places;

  constructor(private world: World, private ground: Ground, private day: number, private shift: AliaShift,
    state: AliaState | undefined, private hooks: AliaHooks, createPerson = makeAlia) {
    this.before = readAlia(state);
    this.scene = aliaScene(this.before,shift);
    this.places = aliaPlaces(world,ground);
    if (aliaShift(day,this.before) !== shift) { this.state='done'; return; }
    const p = this.person = createPerson();
    const at = shift === 'morning' ? this.places.home : this.places.town;
    p.group.position.set(at.x,ground.height(at.x,at.z),at.z); p.group.rotation.y=at.rot;
    world.group.add(p.group); world.people.push(p);
  }
  get riding(): boolean { return this.state==='ride'||this.state==='arrival'||this.state==='leaving'; }
  get busy(): boolean { return this.state==='asked'||this.state==='arrival'||this.state==='leaving'; }
  get active(): boolean { return this.state!=='done'; }
  private removePerson(): void {
    if (!this.person) return;
    this.person.group.removeFromParent();
    const i=this.world.people.indexOf(this.person);if(i>=0)this.world.people.splice(i,1);
    this.person=null;
  }
  dispose(): void { this.removePerson();this.hooks.seat(false);this.hooks.clearHint();this.state='done'; }

  update(dt: number, v: Vehicle): void {
    if(this.state==='done')return;
    const h=this.hooks, speed=Math.abs(v.speedKmh);
    if(this.state==='leaving') {
      this.leave-=dt;
      if(this.leave<=0){this.state='done';h.clearHint();}
      return;
    }
    const from=this.shift==='morning'?this.places.home:this.places.town;
    const d=Math.hypot(v.x-from.x,v.z-from.z);
    if(this.state==='asked') {
      if(d>30||speed>10){h.closeChoice();this.state='wait';this.still=0;}
      return;
    }
    if(h.choiceOpen())return;
    if(this.state==='wait') {
      this.wait+=dt;
      if(this.wait>240){this.dispose();return;}
      if(d<80&&!this.hinted){this.hinted=true;h.hint(this.shift==='morning'?'Алия у голубых ворот · можно подвезти до Ключевска':'Алия у остановки · можно подвезти в Урманлы');}
      if(d<55&&d>15&&this.person)this.person.wave=.5;
      this.still=d<18&&speed<2&&v.handbrake?this.still+dt:0;
      if(this.still<.6)return;
      this.state='asked';
      h.choice(ALIA,this.scene.pickup,['Садись, подвезу','Сегодня не смогу, извини'],i=>{
        if(this.state!=='asked')return;
        if(i!==0){h.say(ALIA,'Ничего, я на автобусе. До встречи.');this.dispose();return;}
        this.state='ride';this.still=0;if(this.person)this.person.group.visible=false;
        h.seat(true);h.hint(this.shift==='morning'?'Алия в кабине · остановитесь у почты':'Алия в кабине · до голубых ворот в Урманлы');
      });
      return;
    }
    if(this.state!=='ride')return;
    if(speed>5)this.chat-=dt;
    if(this.chat<=0&&!this.said){this.said=true;h.say(ALIA,this.scene.chatter);}
    const to=this.shift==='morning'?this.places.post:this.places.home;
    this.still=Math.hypot(v.x-to.x,v.z-to.z)<20&&speed<2&&v.handbrake?this.still+dt:0;
    if(this.still<.6)return;
    this.state='arrival';
    // Even a very short/fast trip keeps its biographical beat at the stop.
    const text=(this.said?'':this.scene.chatter+'\n\n')+this.scene.arrival;
    h.choice(ALIA,text,this.scene.answers.map(a=>a.text),i=>{
      if(this.state!=='arrival'||!this.scene.answers[i])return;
      h.complete(completeAlia(this.before,this.day,this.shift,i));
      h.seat(false);h.say(ALIA,this.scene.answers[i].reply);
      if(this.person){this.person.group.position.set(to.x,this.ground.height(to.x,to.z),to.z);this.person.group.visible=true;this.person.wave=3;}
      this.state='leaving';this.leave=6;
    });
  }
}
