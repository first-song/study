import { WATER_SURFACE_Y } from './biology.js';
import { islandCenter, ISLAND_RADIUS_X, ISLAND_RADIUS_Z } from './island.js';

export const HUMAN_SONAR_CYCLE=14;
export const HUMAN_SONAR_WARNING=10.5;
export const HUMAN_SONAR_PULSE=12;

const TAU=Math.PI*2;
const boatOffsets=[0,4.7,9.2];

export function humanBoatStates(world,time) {
  const core=islandCenter(world);
  return boatOffsets.map((offset,index)=>{
    // Follow an ellipse just outside the expanded archipelago. The former
    // circular orbit sat over the enlarged island after the geography pass.
    const clearance=20+index*14+(world.seed%7);
    const radiusX=ISLAND_RADIUS_X+clearance;
    const radiusZ=ISLAND_RADIUS_Z+clearance;
    const speed=.021+index*.0025;
    const angle=time*speed+offset*.63+(world.seed%360)*Math.PI/180;
    const phase=((time+offset)%HUMAN_SONAR_CYCLE+HUMAN_SONAR_CYCLE)%HUMAN_SONAR_CYCLE;
    return {
      index,offset,phase,radius:Math.hypot(radiusX,radiusZ)/Math.SQRT2,
      x:core.x+Math.cos(angle)*radiusX+(index-1)*3,
      y:WATER_SURFACE_Y+.2+Math.sin(time*.72+offset)*.16,
      z:core.z+Math.sin(angle)*radiusZ+(1-index)*2,
      heading:angle+Math.PI,
      beamAngle:time*(1.15+index*.12)+offset,
      warning:phase>=HUMAN_SONAR_WARNING&&phase<HUMAN_SONAR_PULSE,
      active:phase>=HUMAN_SONAR_PULSE,
      angle,
    };
  });
}

export function crossedSonarPhase(previousTime,currentTime,offset,threshold) {
  const wrap=value=>((value%HUMAN_SONAR_CYCLE)+HUMAN_SONAR_CYCLE)%HUMAN_SONAR_CYCLE;
  const previous=wrap(previousTime+offset),current=wrap(currentTime+offset);
  if(currentTime<=previousTime)return false;
  if(previous<=current)return previous<threshold&&current>=threshold;
  return previous<threshold||current>=threshold;
}

