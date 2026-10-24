import { GameEngine } from '../src/engine.js';
import { interactionPosition, interactionTarget, REACTOR_SITES } from '../src/ecosystem.js';
import { islandDeepPassageAt, islandSurfaceAt } from '../src/island.js';

const seed=Number(process.argv[2]||11);
const engine=new GameEngine({seed});
engine.start();
let chosen=null;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
for(let frame=0;frame<3600&&engine.state.mode==='playing';frame++){
  const state=engine.state,player=state.player,input={};
  if(!state.expedition.biofilms.length)chosen=state.entities.find(entity=>entity.type==='biofilm'&&entity.siteId==='nursery');
  else if(!state.expedition.hostAdaptations.length){
    if(!chosen||chosen.type!=='fish'||!state.entities.includes(chosen))chosen=state.entities.filter(entity=>entity.type==='fish').sort((a,b)=>distance(a,player)-distance(b,player))[0];
  }else if(state.expedition.shutdowns.length<REACTOR_SITES.length){
    chosen=state.entities.filter(entity=>entity.type==='reactor'&&entity.status!=='shutdown').sort((a,b)=>distance(a,player)-distance(b,player))[0];
  }else chosen=state.entities.find(entity=>entity.type==='boss');
  if(player.attachment){
    if(player.attachment.kind==='host'&&state.expedition.hostAdaptations.length)input.detach=true;
    if(player.attachment.kind==='reactor'&&chosen.phase!=='cooldown')input.detach=true;
  }else if(chosen){
    const point=chosen.type==='boss'?chosen:interactionPosition(chosen),remaining=distance(point,player);
    if(remaining>1.8){input.x=(point.x-player.x)/remaining;input.y=(point.y-player.y)/remaining;input.z=(point.z-player.z)/remaining;}
    const target=interactionTarget(state);
    if(target?.entityId===chosen.id&&target.canAttach&&(chosen.type!=='reactor'||chosen.phaseRemaining>9.3))input.interact=true;
    if(chosen.type==='boss'&&chosen.weakened&&player.apex&&distance(chosen,player)<chosen.radius+player.size+5)input.feed=true;
    input.pulse=state.entities.some(entity=>['predator','drone','shark','squid','angler','boss'].includes(entity.type)&&distance(entity,player)<11);
  }
  engine.update(.1,input);
  engine.drainEvents();
  if(frame%200===0||engine.state.mode!=='playing')console.log(JSON.stringify({
    t:engine.state.time.toFixed(1),mode:engine.state.mode,level:player.level,
    p:{x:+player.x.toFixed(1),y:+player.y.toFixed(1),z:+player.z.toFixed(1)},
    attachment:player.attachment?.kind||null,chosen:chosen?{id:chosen.id,type:chosen.type,siteId:chosen.siteId,x:+chosen.x.toFixed(1),y:+chosen.y.toFixed(1),z:+chosen.z.toFixed(1),phase:chosen.phase,status:chosen.status}:null,
    biofilms:engine.state.expedition.biofilms,hosts:engine.state.expedition.hostAdaptations,shutdowns:engine.state.expedition.shutdowns,
    boss:engine.state.entities.find(entity=>entity.type==='boss')?{x:+engine.state.entities.find(entity=>entity.type==='boss').x.toFixed(1),y:+engine.state.entities.find(entity=>entity.type==='boss').y.toFixed(1),z:+engine.state.entities.find(entity=>entity.type==='boss').z.toFixed(1),weakened:engine.state.entities.find(entity=>entity.type==='boss').weakened}:null,
  }));
}
const p=engine.state.player;
console.log('nearby',JSON.stringify(engine.state.entities
  .map(entity=>({type:entity.type,id:entity.id,distance:+distance(entity,p).toFixed(2),x:+entity.x.toFixed(1),y:+entity.y.toFixed(1),z:+entity.z.toFixed(1),radius:entity.radius,status:entity.status}))
  .filter(entity=>entity.distance<45)
  .sort((a,b)=>a.distance-b.distance)
  .slice(0,30)));
console.log('terrain',JSON.stringify({
  ground:islandSurfaceAt(engine.state.world,p.x,p.z),
  passage:islandDeepPassageAt(engine.state.world,p.x,p.z),
  p:{x:p.x,y:p.y,z:p.z},
}));
