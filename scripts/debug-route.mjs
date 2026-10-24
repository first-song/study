import { GameEngine } from '../src/engine.js';
import { interactionPosition, interactionTarget, REACTOR_SITES } from '../src/ecosystem.js';

const seed=Number(process.argv[2]||195),engine=new GameEngine({seed});
engine.start();
let chosen=null;
for(let frame=0;frame<3600&&engine.state.mode==='playing';frame++){
  const state=engine.state,p=state.player,input={};
  const dist=target=>Math.hypot(target.x-p.x,target.y-p.y,target.z-p.z);
  if(!state.expedition.biofilms.length)chosen=state.entities.find(e=>e.type==='biofilm'&&e.siteId==='nursery');
  else if(!state.expedition.hostAdaptations.length)chosen=chosen?.type==='fish'&&state.entities.includes(chosen)?chosen:state.entities.filter(e=>e.type==='fish').sort((a,b)=>dist(a)-dist(b))[0];
  else if(state.expedition.shutdowns.length<REACTOR_SITES.length)chosen=state.entities.filter(e=>e.type==='reactor'&&e.status!=='shutdown').sort((a,b)=>dist(a)-dist(b))[0];
  else chosen=state.entities.find(e=>e.type==='boss');
  if(p.attachment){
    if(p.attachment.kind==='host'&&state.expedition.hostAdaptations.length)input.detach=true;
    if(p.attachment.kind==='reactor'&&chosen.phase!=='cooldown')input.detach=true;
  }else if(chosen){
    const point=chosen.type==='boss'?chosen:interactionPosition(chosen),remaining=dist(point);
    if(remaining>1.8){input.x=(point.x-p.x)/remaining;input.y=(point.y-p.y)/remaining;input.z=(point.z-p.z)/remaining;}
    const target=interactionTarget(state);
    if(target?.entityId===chosen.id&&target.canAttach&&(chosen.type!=='reactor'||chosen.phaseRemaining>9.3))input.interact=true;
    if(chosen.type==='boss'&&chosen.weakened&&p.apex&&dist(chosen)<chosen.radius+p.size+5)input.feed=true;
    input.pulse=state.entities.some(e=>['predator','drone','shark','squid','angler','boss'].includes(e.type)&&dist(e)<11);
  }
  engine.update(.1,input);engine.drainEvents();
  if(frame%300===0||state.mode!=='playing')console.log(JSON.stringify({
    t:+state.time.toFixed(1),mode:state.mode,level:p.level,hp:+p.hp.toFixed(1),
    p:[p.x,p.y,p.z].map(v=>+(+v).toFixed(1)),chosen:chosen&&{type:chosen.type,site:chosen.siteId,status:chosen.status,phase:chosen.phase},
    dist:chosen?+dist(chosen.type==='boss'?chosen:interactionPosition(chosen)).toFixed(1):null,
    attachment:p.attachment&&{kind:p.attachment.kind,progress:+p.attachment.progress.toFixed(2)},
    shutdowns:state.expedition.shutdowns,
  }));
}
const save=engine.serialize();
const restored=new GameEngine({seed:1}).restore(save);
const subsetResults={};
for(const types of [
  ['reactor','biofilm','islandNode','diver'],
  ['reactor','biofilm','islandNode','diver','fish','lanternfish'],
  ['reactor','biofilm','islandNode','diver','fish','lanternfish','jelly','shark','squid','whale','ray','turtle','angler','crab','cuttlefish','oarfish'],
  ['reactor','biofilm','islandNode','diver','fish','lanternfish','jelly','shark','squid','whale','ray','turtle','angler','crab','cuttlefish','oarfish','food'],
  ['reactor','biofilm','islandNode','diver','fish','lanternfish','jelly','shark','squid','whale','ray','turtle','angler','crab','cuttlefish','oarfish','food','isotope'],
  ['reactor','biofilm','islandNode','diver','fish','lanternfish','jelly','shark','squid','whale','ray','turtle','angler','crab','cuttlefish','oarfish','food','isotope','marineSnow'],
  ['reactor','biofilm','islandNode','diver','fish','lanternfish','jelly','shark','squid','whale','ray','turtle','angler','crab','cuttlefish','oarfish','food','isotope','marineSnow','predator'],
]){
  const candidate=structuredClone(save);
  candidate.state.entities=candidate.state.entities.filter(entity=>types.includes(entity.type));
  subsetResults[types.length]=new GameEngine({seed:1}).restore(candidate);
}
const snow=save.state.entities.filter(entity=>entity.type==='marineSnow');
console.log(JSON.stringify({
  restore:restored,
  subsetResults,
  mode:save.state.mode,
  stage:save.state.stage,
  ending:save.state.ending,
  stats:save.state.stats,
  expedition:save.state.expedition,
  entityCount:save.state.entities.length,
  snowAudit:{
    count:snow.length,
    minY:Math.min(...snow.map(entity=>entity.y)),
    maxY:Math.max(...snow.map(entity=>entity.y)),
    badNutrition:snow.filter(entity=>entity.nutrition!==undefined&&(!(entity.nutrition>0)||entity.nutrition>30)).slice(0,5),
    badSource:snow.filter(entity=>entity.sourceId!==undefined&&(entity.sourceType===undefined||entity.sourceY===undefined)).slice(0,5),
    duplicateSourceIds:snow.map(entity=>entity.sourceId).filter((id,index,list)=>id!==undefined&&list.indexOf(id)!==index).slice(0,5),
    sourceProblems:snow.flatMap(entity=>{
      if(entity.sourceId===undefined)return [];
      const relatives=snow.filter(other=>other.sourceId===entity.sourceId);
      const record=save.state.player.assimilationHistory.find(entry=>entry.sourceId===entity.sourceId);
      const problems=[];
      if(entity.sourceId>=entity.id)problems.push(`id ${entity.sourceId}>=${entity.id}`);
      if(save.state.entities.some(other=>other.id===entity.sourceId))problems.push('donor still exists');
      if(!Number.isFinite(entity.sourceY)||entity.sourceY<-3||entity.sourceY>52)problems.push(`sourceY ${entity.sourceY}`);
      if(relatives.some(other=>other.sourceType!==entity.sourceType||other.sourceY!==entity.sourceY))problems.push('mixed source');
      if(record&&(record.sourceType!==entity.sourceType||record.sourceY!==entity.sourceY))problems.push('record mismatch');
      return problems.length?[{id:entity.id,...entity,problems}]:[];
    }).slice(0,8),
  },
  player:save.state.player,
  invalidEntities:save.state.entities.map(entity=>({...entity,planar:Math.hypot(entity.x,entity.z)}))
    .filter(entity=>entity.planar>save.state.world.radius+15||entity.y<-3||entity.y>60)
    .slice(0,12),
},null,2));
