// Simulation keeps the same 60 Hz cadence at 30, 60 and 144 Hz presentation rates.
// A long background-tab gap is discarded; active frames can catch up six steps.
export class FrameStepper {
  constructor(step=1/60) {
    this.step=step;this.accumulator=0;this.previous=null;this.snapshotEntities=new Map();
  }
  reset() { this.accumulator=0;this.previous=null;this.snapshotEntities.clear(); }
  advance(elapsed,engine,input) {
    if(engine.state.mode!=='playing') { this.reset(); return engine.state; }
    this.accumulator+=Math.max(0,Math.min(.1,elapsed));
    while(this.accumulator+1e-10>=this.step&&engine.state.mode==='playing') {
      const p=engine.state.player;
      const entities=this.snapshotEntities;
      const current=engine.state.entities||[];
      if(entities.size>current.length*2+128){
        const liveIds=new Set(current.map(entity=>entity.id));
        for(const id of entities.keys())if(!liveIds.has(id))entities.delete(id);
      }
      for(const entity of current){
        let sample=entities.get(entity.id);
        if(!sample){sample={};entities.set(entity.id,sample);}
        sample.x=entity.x;sample.y=entity.y;sample.z=entity.z;
        sample.vx=entity.vx;sample.vy=entity.vy;sample.vz=entity.vz;
        sample.heading=entity.heading;
      }
      this.previous={x:p.x,y:p.y,z:p.z,entities};
      engine.update(this.step,input());
      this.accumulator-=this.step;
    }
    const state=engine.state,p=state.player,old=this.previous;
    if(!old||Math.hypot(p.x-old.x,p.y-old.y,p.z-old.z)>10)return state;
    const alpha=Math.max(0,Math.min(1,this.accumulator/this.step));
    const entities=(state.entities||[]).map(entity=>{
      const sample=old.entities.get(entity.id);
      if(!sample||Math.hypot(entity.x-sample.x,entity.y-sample.y,entity.z-sample.z)>8)return entity;
      const interpolated={
        ...entity,
        x:sample.x+(entity.x-sample.x)*alpha,
        y:sample.y+(entity.y-sample.y)*alpha,
        z:sample.z+(entity.z-sample.z)*alpha,
        vx:(sample.vx??entity.vx)+(entity.vx-(sample.vx??entity.vx))*alpha,
        vy:(sample.vy??entity.vy)+(entity.vy-(sample.vy??entity.vy))*alpha,
        vz:(sample.vz??entity.vz)+(entity.vz-(sample.vz??entity.vz))*alpha,
      };
      if(Number.isFinite(sample.heading)&&Number.isFinite(entity.heading)){
        const delta=Math.atan2(Math.sin(entity.heading-sample.heading),Math.cos(entity.heading-sample.heading));
        interpolated.heading=sample.heading+delta*alpha;
      }
      return interpolated;
    });
    return {
      ...state,
      player:{...p,x:old.x+(p.x-old.x)*alpha,y:old.y+(p.y-old.y)*alpha,z:old.z+(p.z-old.z)*alpha},
      entities,
    };
  }
}

export function seedFromText(value) {
  const text=String(value||'').trim();
  if(!text)return undefined;
  if(/^\d+$/.test(text))return Number(BigInt(text)&0xffffffffn);
  let hash=2166136261;
  for(const char of text){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}
