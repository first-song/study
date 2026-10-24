import { WATER_SURFACE_Y } from './biology.js';

// The landmass is a fictional, Japan-inspired archipelago silhouette:
// a long mountainous main island, a broad southern bay and a chain of
// smaller offshore ridges. It is deliberately much larger than the first
// playable shore so the surface and settlements read at naval scale.
export const ISLAND_RADIUS_X=76;
export const ISLAND_RADIUS_Z=116;
export const ISLAND_MAX_HEIGHT=31;
const layoutCache=new WeakMap();

function cachedLayout(world,key,factory) {
  let entry=layoutCache.get(world);
  if(!entry){entry={};layoutCache.set(world,entry);}
  if(!entry[key])entry[key]=factory();
  return entry[key];
}

export function islandCenter(world) {
  return {x:world.core.x,z:world.core.z+34};
}

function coastline(world,angle) {
  const seed=(world.seed%997)/997*Math.PI*2;
  return 1
    +Math.sin(angle*3+seed)*.085
    +Math.cos(angle*5-seed*.63)*.052
    +Math.sin(angle*9+seed*.27)*.025
    +Math.sin(angle*13-seed*.41)*.014;
}

export function islandMetric(world,x,z) {
  const center=islandCenter(world);
  const dx=x-center.x,dz=z-center.z;
  // 远离岛屿时不需要精确的海岸线：这一项在碰撞检查里每秒被调用上万次，
  // 而岛只占整片海域的一小块。远处的径向距离足够判断"肯定不在岛上"。
  const raw=Math.hypot(dx/ISLAND_RADIUS_X,dz/ISLAND_RADIUS_Z);
  if(raw>1.6)return {center,dx,dz,angle:0,coast:1,radial:raw,inside:false};
  const angle=Math.atan2(dz/ISLAND_RADIUS_Z,dx/ISLAND_RADIUS_X);
  const coast=coastline(world,angle);
  const radial=raw/coast;
  return {center,dx,dz,angle,coast,radial,inside:radial<=1};
}

export function islandSurfaceAt(world,x,z) {
  const metric=islandMetric(world,x,z);
  if(!metric.inside)return null;
  const {dx,dz,radial}=metric;
  const base=.28+Math.pow(1-radial,.62)*6.1;
  const northMountain=15.8*Math.exp(-(((dx+8)/24)**2)-(((dz+24)/38)**2));
  const eastRidge=9.8*Math.exp(-(((dx-27)/20)**2)-(((dz-5)/49)**2));
  const southernCape=5.4*Math.exp(-(((dx+31)/18)**2)-(((dz-47)/27)**2));
  const bayCut=2.1*Math.exp(-(((dx+22)/18)**2)-(((dz-32)/25)**2));
  return WATER_SURFACE_Y+Math.max(.18,base+northMountain+eastRidge+southernCape-bayCut);
}

export function islandVisualSurfaceAt(world,x,z) {
  const surface=islandSurfaceAt(world,x,z);
  if(surface===null)return null;
  const metric=islandMetric(world,x,z);
  const fold=(Math.sin(x*.31+z*.17)*.075+Math.cos(z*.43-x*.12)*.045)*(1-metric.radial*.45);
  return surface+fold;
}

export function islandShorePoint(world,angle,outset=0) {
  const base=cachedLayout(world,`shore:${angle.toFixed(5)}`,()=>{
    const center=islandCenter(world),coast=coastline(world,angle);
    return {x:center.x+Math.cos(angle)*ISLAND_RADIUS_X*coast,z:center.z+Math.sin(angle)*ISLAND_RADIUS_Z*coast};
  });
  if(!outset)return {x:base.x,z:base.z,y:WATER_SURFACE_Y};
  const nx=Math.cos(angle)*outset,nz=Math.sin(angle)*outset;
  return {x:base.x+nx,z:base.z+nz,y:WATER_SURFACE_Y};
}

// The harbor settlement sits just beyond the island footprint, so it is not
// covered by islandObstacleAt(). Keep a small compound collider here for both
// the player and simulated animals, aligned with the visible shack, warehouse,
// cargo stacks and crane base.
export function islandHumanStructureAt(world,x,y,z,clearance=0) {
  if(y<WATER_SURFACE_Y-.6)return false;
  const shore=islandShorePoint(world,Math.PI/2);
  const lx=x-shore.x,lz=z-(shore.z-1.5),localY=y-WATER_SURFACE_Y;
  const hit=(minX,maxX,minY,maxY,minZ,maxZ)=>
    lx>=minX-clearance&&lx<=maxX+clearance&&
    localY>=minY-clearance&&localY<=maxY+clearance&&
    lz>=minZ-clearance&&lz<=maxZ+clearance;
  if(hit(-7.35,-2.65,1.1,4.9,-.5,3.45))return true;
  if(hit(-10.1,-2.75,1.1,5.55,5.65,11.2))return true;
  if(hit(3.15,8.9,1.15,4.9,9.45,11.15))return true;
  if(Math.hypot(lx-5,lz+1)<.58+clearance&&localY<9.2)return true;
  return false;
}

export function islandPoint(world,radial,angle) {
  const center=islandCenter(world),coast=coastline(world,angle);
  const x=center.x+Math.cos(angle)*ISLAND_RADIUS_X*coast*radial;
  const z=center.z+Math.sin(angle)*ISLAND_RADIUS_Z*coast*radial;
  return {x,z,y:islandSurfaceAt(world,x,z)};
}

export function islandTreeLayout(world) {
  if(layoutCache.get(world)?.trees)return layoutCache.get(world).trees;
  const center=islandCenter(world),trees=[];
  let rng=(world.seed^0x5a17c9)>>>0;
  const random=()=>{
    rng=(Math.imul(rng,1664525)+1013904223)>>>0;
    return rng/4294967296;
  };
  const roads=islandRoadLayout(world);
  const houses=islandHouseLayout(world);
  const blocked=(x,z)=>{
    const lx=x-center.x,lz=z-center.z;
    if(Math.abs(lx+4)<23&&Math.abs(lz+12)<21)return true;
    if(Math.abs(lx-22)<18&&Math.abs(lz-24)<25)return true;
    if(Math.hypot(lx+4,lz+52)<20||Math.hypot(lx-31,lz+8)<16)return true;
    if(lz>78&&Math.abs(lx)<43)return true;
    if(lz>40&&Math.abs(lx-8)<20)return true;
    if(roads.some(road=>road.y!==null&&Math.hypot(x-road.x,z-road.z)<4.2))return true;
    if(houses.some(house=>Math.hypot(x-house.x,z-house.z)<2.8))return true;
    return false;
  };
  // Groves follow mountain shoulders and sheltered valley pockets. This avoids
  // the artificial "one tree per grid point" look of the first island pass.
  const groves=[
    {x:-35,z:-44,rx:25,rz:32,count:66,bias:'cedar'},
    {x:29,z:-47,rx:21,rz:27,count:54,bias:'mixed'},
    {x:38,z:8,rx:18,rz:32,count:52,bias:'broadleaf'},
    {x:-31,z:34,rx:22,rz:22,count:44,bias:'pine'},
    {x:3,z:54,rx:18,rz:19,count:34,bias:'broadleaf'},
    {x:-14,z:15,rx:12,rz:22,count:26,bias:'cedar'},
    {x:22,z:47,rx:14,rz:14,count:22,bias:'pine'},
  ];
  let index=0;
  for(const grove of groves){
    let accepted=0,attempts=0;
    while(accepted<grove.count&&attempts<grove.count*4){
      attempts++;
      const angle=random()*Math.PI*2,radius=Math.sqrt(random());
      const lx=grove.x+Math.cos(angle)*grove.rx*radius;
      const lz=grove.z+Math.sin(angle)*grove.rz*radius;
      const x=center.x+lx,z=center.z+lz,y=islandVisualSurfaceAt(world,x,z);
      if(y===null||blocked(x,z))continue;
      const roll=random();
      const species=grove.bias==='mixed'
        ? (roll<.48?'cedar':roll<.8?'pine':'broadleaf')
        : grove.bias==='pine'
          ? (roll<.72?'pine':'broadleaf')
          : grove.bias==='broadleaf'
            ? (roll<.76?'broadleaf':'pine')
            : (roll<.76?'cedar':'broadleaf');
      const scale=species==='cedar'?.92+random()*.42:species==='pine'?.78+random()*.36:.84+random()*.42;
      trees.push({
        x,z,y,angle:random()*Math.PI*2,scale,species,variant:index%7,
        leanX:(random()-.5)*.075,leanZ:(random()-.5)*.075,
      });
      accepted++;index++;
    }
  }
  // A second narrow belt of coastal pines breaks up the inland forest edge.
  for(let i=0;i<22;i++){
    const angle=.52+i/21*1.32;
    const point=islandPoint(world,.76+random()*.13,angle);
    if(point.y!==null)point.y=islandVisualSurfaceAt(world,point.x,point.z);
    if(point.y===null||blocked(point.x,point.z))continue;
    trees.push({
      x:point.x,z:point.z,y:point.y,angle:random()*Math.PI*2,
      scale:.72+random()*.27,species:i%5===0?'broadleaf':'pine',variant:i%7,
      leanX:(random()-.5)*.12,leanZ:(random()-.5)*.12,
    });
  }
  return cachedLayout(world,'trees',()=>trees);
}

export function islandHouseLayout(world) {
  if(layoutCache.get(world)?.houses)return layoutCache.get(world).houses;
  const center=islandCenter(world),houses=[];
  for(let i=0;i<24;i++){
    const district=i<16?0:1,local=i%16;
    const angle=-.18+local/16*1.62;
    const lx=district? 22+Math.cos(angle)*14+(local%3-1)*2.4 : 16+Math.cos(angle)*13+(local%3-1)*2;
    const lz=district? 24+Math.sin(angle)*20 : 18+Math.sin(angle)*15;
    houses.push({x:center.x+lx,z:center.z+lz,y:islandVisualSurfaceAt(world,center.x+lx,center.z+lz),angle:angle+.35,width:3.2+(i%3)*.35,height:2.6+(i%2)*.5});
  }
  return cachedLayout(world,'houses',()=>houses);
}

export function islandRoadLayout(world) {
  if(layoutCache.get(world)?.roads)return layoutCache.get(world).roads;
  const center=islandCenter(world),roads=[];
  for(let i=0;i<24;i++){
    const t=i/23,x=center.x+7-Math.sin(t*Math.PI*.86)*17,z=center.z+ISLAND_RADIUS_Z*.7-t*ISLAND_RADIUS_Z*.9;
    roads.push({x,z,y:islandVisualSurfaceAt(world,x,z),angle:.16+Math.sin(t*Math.PI)*.32});
  }
  return cachedLayout(world,'roads',()=>roads);
}

// The final reactor chamber is intentionally carved below the island.
// This corridor keeps the mountain solid at the surface while leaving a
// readable, physically consistent trench entrance from the southern sea.
export function islandDeepPassageAt(world,x,z) {
  const center=islandCenter(world);
  const coreLocal={x:world.core.x-center.x,z:world.core.z-center.z};
  const localX=x-center.x,localZ=z-center.z;
  const x1=coreLocal.x,z1=coreLocal.z,x2=0,z2=ISLAND_RADIUS_Z*.92;
  const vx=x2-x1,vz=z2-z1,wx=localX-x1,wz=localZ-z1;
  const lengthSquared=vx*vx+vz*vz;
  const t=lengthSquared>0?Math.max(0,Math.min(1,(wx*vx+wz*vz)/lengthSquared)):0;
  return Math.hypot(localX-(x1+vx*t),localZ-(z1+vz*t))<=ISLAND_RADIUS_X*.66;
}

export function islandFinalCorePoint(world) {
  const shore=islandShorePoint(world,Math.PI/2,22);
  return {x:shore.x,y:44,z:shore.z};
}

export function islandReactorAccessPoint(world,site,clearance=16) {
  if(site.x===undefined||site.z===undefined||islandSurfaceAt(world,site.x,site.z)===null)return site;
  const metric=islandMetric(world,site.x,site.z);
  for(const extra of [clearance,clearance+10,clearance+22,clearance+38,clearance+58]){
    const point=islandShorePoint(world,metric.angle,extra);
    if(islandSurfaceAt(world,point.x,point.z)===null)return {...site,...point};
  }
  return {...site,...islandShorePoint(world,metric.angle,clearance+82)};
}

export function islandObstacleAt(world,x,z) {
  const center=islandCenter(world),dx=x-center.x,dz=z-center.z;
  const insideEllipse=(cx,cz,rx,rz)=>((dx-cx)/rx)**2+((dz-cz)/rz)**2<1;
  if(insideEllipse(-4,-12,21,17)||insideEllipse(-31,14,7.5,7.5)||insideEllipse(24,38,13,10)||
      insideEllipse(-4,-52,20,18)||insideEllipse(31,-8,16,14))return true;
  for(const tree of islandTreeLayout(world))if(Math.hypot(x-tree.x,z-tree.z)<.62*tree.scale+.35)return true;
  for(const house of islandHouseLayout(world)){
    const cos=Math.cos(-house.angle),sin=Math.sin(-house.angle),rx=x-house.x,rz=z-house.z;
    const localX=rx*cos-rz*sin,localZ=rx*sin+rz*cos;
    if(Math.abs(localX)<house.width*.55&&Math.abs(localZ)<house.width*.42)return true;
  }
  const gateBase=islandSurfaceAt(world,center.x+2,center.z+28);
  if(gateBase!==null&&Math.hypot(x-(center.x+2),z-(center.z+28))<5.8&&Math.abs(dx-2)>2.6)return true;
  return false;
}

