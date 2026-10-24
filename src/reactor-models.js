import * as THREE from '../node_modules/three/build/three.module.js';
import { seabedHeight } from './biology.js';
import { interactionPosition, reactorEntranceYaw } from './ecosystem.js';

const TAU=Math.PI*2;
const clamp=THREE.MathUtils.clamp;

// Original industrial and benthic geometry. Coordinates are local; the scene
// positions these groups at the simulation entity's interaction point.
function paint(geometry,hex) {
  const c=new THREE.Color(hex),values=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(values,3));return geometry;
}

function part(geometry,color,position=[0,0,0],rotation=[0,0,0]) {
  const mesh=new THREE.Mesh(paint(geometry,color));mesh.position.set(...position);mesh.rotation.set(...rotation);return mesh;
}

function mergeParts(parts,material) {
  const positions=[],normals=[],colors=[];
  for(const item of parts) {
    item.updateMatrix();
    const geometry=item.geometry.index?item.geometry.toNonIndexed():item.geometry.clone();geometry.applyMatrix4(item.matrix);
    positions.push(...geometry.attributes.position.array);normals.push(...geometry.attributes.normal.array);colors.push(...geometry.attributes.color.array);
    geometry.dispose();item.geometry.dispose();
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeBoundingSphere();return new THREE.Mesh(geometry,material);
}

function pipe(points,radius,color,segments=28) {
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal');
  return part(new THREE.TubeGeometry(path,segments,radius,8,false),color);
}

function beam(a,b,width,color) {
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
  const mesh=part(new THREE.BoxGeometry(width,delta.length(),width),color,start.add(end).multiplyScalar(.5).toArray());
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return mesh;
}

function surfaceMaterial(roughness=.86,metalness=.23) {
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness,metalness,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 industrialPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nindustrialPosition=position;');
    shader.fragmentShader='varying vec3 industrialPosition;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float rust=sin(industrialPosition.x*17.+sin(industrialPosition.z*8.))*sin(industrialPosition.y*11.+industrialPosition.z*13.);
      float grain=sin(industrialPosition.x*149.+industrialPosition.z*83.)*sin(industrialPosition.y*111.);
      diffuseColor.rgb*=.86+rust*.11+grain*.035;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.085,.04),smoothstep(.61,.92,rust)*.28);
    `);
  };
  material.customProgramCacheKey=()=> 'submerged-industrial-v1';return material;
}

function breachedShell() {
  const positions=[],indices=[],colors=[],shell=new THREE.Color(0x68706a),inner=new THREE.Color(0x393e3b);
  const sides=52,rows=24,start=.32,length=TAU-1.12;
  for(let wall=0;wall<2;wall++)for(let j=0;j<=rows;j++)for(let i=0;i<=sides;i++) {
    const t=j/rows,z=-3.15+t*6.3,edge=i===0||i===sides;
    const tear=edge?Math.sin(t*41)*.12+Math.sin(t*19)*.18:0;
    const angle=start+i/sides*length+tear;
    const rim=1-Math.abs(t-.5)*.11,radius=(wall?2.16:2.31)*rim+(edge?.12*Math.sin(t*29):0);
    positions.push(Math.cos(angle)*radius,Math.sin(angle)*radius+.45,z);
    const color=wall?inner:shell,mottle=.9+Math.sin(z*21+angle*13)*.07;
    colors.push(color.r*mottle,color.g*mottle,color.b*mottle);
    if(j<rows&&i<sides) {
      const n=wall*(rows+1)*(sides+1)+j*(sides+1)+i;
      indices.push(...(wall?[n,n+sides+1,n+1,n+1,n+sides+1,n+sides+2]:[n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1]));
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return new THREE.Mesh(geometry);
}

function suspendedCoolant(seed) {
  const count=72,positions=new Float32Array(count*3),phases=new Float32Array(count),sizes=new Float32Array(count);
  for(let i=0;i<count;i++){phases[i]=(i*.6180339+seed*.073)%1;sizes[i]=.6+(i%7)*.11;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const points=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xa8b4a3,size:.11,transparent:true,opacity:.42,depthWrite:false,sizeAttenuation:true}));
  points.frustumCulled=false;points.userData.phases=phases;points.userData.sizes=sizes;return points;
}

export function createReactor(entity) {
  const group=new THREE.Group(),steel=[],concrete=[],hardware=[],seed=entity.seed||0;
  const scale=(entity.radius||6)/6,point=interactionPosition(entity),ingressY=(point.y-entity.y)/scale;
  const frameColor=0x465853,rust=0x796650,steelColor=0x828b7f;
  group.name='sunken-reactor-installation';
  // A skid, pressure vessel, containment rings, broken coolant circuit and
  // collapsed gantry establish a machine silhouette at long viewing distances.
  concrete.push(part(new THREE.BoxGeometry(8.8,.65,9.4),0x69716a,[0,-1.9,0]));
  concrete.push(part(new THREE.BoxGeometry(2.9,.48,4.2),0x5f6a63,[4.8,-1.72,.7],[.06,.15,-.1]));
  for(const x of [-3.25,3.25])for(const z of [-3.45,3.45]) {
    const ground=(seabedHeight(entity.x+x*scale,entity.z+z*scale)-entity.y)/scale;
    if(ground<-2.22) {
      concrete.push(part(new THREE.BoxGeometry(1.3,.5,1.3),0x59655c,[x,ground+.18,z]));
      concrete.push(part(new THREE.BoxGeometry(.6,-2.1-ground,.6),0x657166,[x,(ground-2.1)/2,z]));
      steel.push(beam([x,ground+.3,z],[x*.6,-2.1,z*.65],.13,frameColor));
    }
  }
  for(const x of [-3.8,3.8])for(const z of [-4.1,4.1])steel.push(beam([x,-1.6,z],[x,2.8,z],.19,frameColor));
  for(const y of [-1.4,2.8]) {
    for(const x of [-3.8,3.8])steel.push(beam([x,y,-4.1],[x,y,4.1],.22,frameColor));
    for(const z of [-4.1,4.1])steel.push(beam([-3.8,y,z],[3.8,y,z],.22,frameColor));
  }
  steel.push(beam([-3.8,-1.35,4.1],[-3.8,2.8,-4.1],.12,rust));
  steel.push(beam([3.8,-1.4,4.1],[3.8,1.9,-2.8],.12,rust));
  steel.push(beam([-3.8,2.8,2.5],[.2,2.95,-.1],.18,frameColor));
  steel.push(beam([.2,2.95,-.1],[2.8,-.65,-2.3],.18,frameColor));
  steel.push(breachedShell());
  for(const z of [-2.88,-1.45,1.1,2.85])hardware.push(part(new THREE.TorusGeometry(2.32,.085,6,52,TAU-.84),steelColor,[0,.45,z],[0,0,.26]));
  hardware.push(part(new THREE.CylinderGeometry(2.2,2.2,.18,40),0x515e58,[0,.45,3.1],[Math.PI/2,0,0]));
  // The front head is a ring with an actual dark, recessed access throat.
  hardware.push(part(new THREE.TorusGeometry(1.45,.65,12,40),0x717b70,[0,.35,-3.18]));
  hardware.push(part(new THREE.TorusGeometry(.91,.15,8,36),0xa19b7d,[0,ingressY,-3.9]));
  hardware.push(part(new THREE.CylinderGeometry(.8,.8,.85,28,1,true),0x333b35,[0,ingressY,-3.55],[Math.PI/2,0,0]));
  hardware.push(part(new THREE.CircleGeometry(.79,28),0x101b1a,[0,ingressY,-3.11],[0,Math.PI,0]));
  if(ingressY>.15)steel.push(pipe([[0,0,-3.12],[0,.15,-4.7],[0,ingressY-.3,-4.7],[0,ingressY,-3.9]],.91,0x69766b,32));
  for(let i=0;i<12;i++) {
    const a=i/12*TAU;hardware.push(part(new THREE.CylinderGeometry(.065,.065,.11,6),0xb0aa8e,[Math.cos(a)*1.01,ingressY+Math.sin(a)*1.01,-4.03],[Math.PI/2,0,0]));
  }
  for(const side of [-1,1]) {
    steel.push(pipe([[side*1.7,.8,-1.7],[side*2.9,.7,-1.7],[side*3.15,-.65,-1.2],[side*3.15,-.85,1.8],[side*1.7,-.2,2.2]],.24,0x687d71));
    hardware.push(part(new THREE.TorusGeometry(.32,.08,6,16),rust,[side*3.15,-.82,.9]));
    hardware.push(part(new THREE.TorusGeometry(.32,.08,6,16),rust,[side*3.15,-.82,1.3]));
  }
  steel.push(pipe([[-1.25,1.8,.5],[-2.1,2.8,.55],[-2.2,3.4,.7],[-1.7,3.85,.8]],.21,0x8b8870));
  hardware.push(part(new THREE.TorusGeometry(.26,.06,6,18),rust,[-1.7,3.85,.8],[.2,.5,0]));
  for(let i=0;i<9;i++)steel.push(pipe([[2.85,-.85,-2.2+i*.47],[4.1,-.65,-2.2+i*.47],[4.2,.75,-2.2+i*.47],[3.1,.85,-2.2+i*.47]],.075,0x8b8c73,16));
  steel.push(part(new THREE.BoxGeometry(1.15,1.7,.52),0x64736a,[-3.1,-.25,-3.65],[0,.12,.12]));
  hardware.push(part(new THREE.BoxGeometry(.75,.48,.04),0x202f2c,[-3.1,.1,-3.95],[0,.12,.12]));
  for(let i=0;i<8;i++)hardware.push(beam([-3.4,.4+i*.22,1.45],[-2.8,.4+i*.22,1.45],.045,0x969780));
  for(const x of [-3.4,-2.8])hardware.push(beam([x,.2,1.45],[x,2.1,1.45],.06,0x7b8577));
  // Open core internals are visible through the torn shell; no glowing sphere.
  const rods=[];
  for(let i=0;i<14;i++) {
    const angle=i/14*TAU,r=.6+(i%3)*.3;
    rods.push(part(new THREE.CylinderGeometry(.095,.095,4.75,7),i%3?0x716b53:0x969078,[Math.cos(angle)*r,.45+Math.sin(angle)*r,.15],[Math.PI/2,0,0]));
  }
  for(const z of [-2.1,0,2.2])rods.push(part(new THREE.TorusGeometry(1.22,.075,5,24),0x686f61,[0,.45,z]));
  const concreteMesh=mergeParts(concrete,surfaceMaterial(.98,.02));concreteMesh.name='settled-foundation';
  const steelMesh=mergeParts(steel,surfaceMaterial(.88,.3));steelMesh.name='ruptured-pressure-vessel-and-frame';
  const hardwareMesh=mergeParts(hardware,surfaceMaterial(.76,.35));hardwareMesh.name='coolant-hardware-and-ingress';
  const core=mergeParts(rods,surfaceMaterial(.71,.38));core.name='exposed-fuel-assembly';
  group.add(concreteMesh,steelMesh,hardwareMesh,core);
  // Small safety lamps convey the discharge cycle without making the whole
  // installation look emissive. Fungal coverage fills the access collar.
  const statusMaterial=new THREE.MeshStandardMaterial({color:0xc1954d,emissive:0x8d501b,emissiveIntensity:.45,roughness:.55});
  const statusParts=[];
  for(let i=0;i<3;i++)statusParts.push(part(new THREE.BoxGeometry(.16,.1,.035),0xffffff,[-3.31+i*.23,-.31,-3.99]));
  const lamps=mergeParts(statusParts,statusMaterial);lamps.name='cycle-status-lamps';group.add(lamps);
  const colonyParts=[];
  for(let i=0;i<9;i++) {
    const a=i/9*TAU;colonyParts.push(pipe([[Math.cos(a)*.94,ingressY+Math.sin(a)*.94,-4.06],[Math.cos(a+.05)*.77,ingressY+Math.sin(a+.05)*.77,-4.08],[Math.cos(a+.12)*.57,ingressY+Math.sin(a+.12)*.57,-4.07]],.048,0x83957b,12));
  }
  const colony=mergeParts(colonyParts,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.84,transparent:true,opacity:0}));colony.name='colonized-access-throat';group.add(colony);
  const coolant=suspendedCoolant(seed);coolant.name='leaking-coolant-suspension';group.add(coolant);
  group.scale.setScalar(scale);
  group.rotation.y=reactorEntranceYaw(entity);
  Object.assign(group.userData,{reactor:true,proceduralModelVersion:1,statusMaterial,colony,coolant,modelScale:scale,ingressOffset:new THREE.Vector3(0,ingressY,-3.9),phase:entity.phase,shutdown:entity.status==='shutdown'||!!entity.shutdown,seed});
  animateReactor(group,entity,0,0);return group;
}

export function animateReactor(group,entity,time,dt=0) {
  const data=group.userData,shutdown=entity.status==='shutdown'||!!entity.shutdown;
  const phase=entity.phase||'warning',discharging=phase==='discharge';
  data.phase=phase;data.shutdown=shutdown;
  const lampColor=shutdown?0x5f8c7c:discharging?0xc18c51:phase==='cooldown'?0x789594:0xc0aa64;
  data.statusMaterial.color.setHex(lampColor);data.statusMaterial.emissive.setHex(lampColor);
  data.statusMaterial.emissiveIntensity=shutdown?.1:discharging?.5+Math.sin(time*8)*.2:.2;
  data.colony.material.opacity=clamp(entity.progress||0,0,1)*.94;
  const particles=data.coolant,positions=particles.geometry.attributes.position,phases=particles.userData.phases;
  particles.visible=!shutdown;particles.material.opacity=discharging?.52:.19;
  for(let i=0;i<phases.length;i++) {
    const travel=(time*(discharging?.16:.06)+phases[i])%1,spread=.13+travel*.85,angle=i*2.399+time*.15;
    positions.setXYZ(i,-1.7+Math.cos(angle)*spread+travel*.85,3.85+travel*(discharging?7:4.8),.8+Math.sin(angle)*spread);
  }
  positions.needsUpdate=true;
}

export function createBiofilm(entity) {
  const group=new THREE.Group(),positions=[],indices=[],colors=[],rows=7,sides=64,seed=entity.seed||0;
  const olive=new THREE.Color(0x767e60),edge=new THREE.Color(0xa49b72),color=new THREE.Color();
  for(let r=0;r<=rows;r++)for(let i=0;i<=sides;i++) {
    const angle=i/sides*TAU,t=r/rows,lobes=1+Math.sin(angle*5+seed)*.14+Math.cos(angle*9-seed)*.09;
    const radius=t*lobes,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    const folds=Math.sin(angle*13+radius*17)*.018+Math.sin(x*23+z*14)*.012;
    positions.push(x,.06+Math.sin(t*Math.PI)*.1+folds*t,z);
    color.copy(olive).lerp(edge,t**2*.7).multiplyScalar(.94+Math.sin(x*31+z*27)*.06);colors.push(color.r,color.g,color.b);
    if(r<rows&&i<sides){const n=r*(sides+1)+i;indices.push(n,n+sides+1,n+1,n+1,n+sides+1,n+sides+2);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const filmMaterial=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.67,metalness:.02,emissive:0x2f4a38,emissiveIntensity:.55});
  const film=new THREE.Mesh(geometry,filmMaterial);film.name='attached-folded-bacterial-mat';group.add(film);
  // 菌落自己会发光。深海里这是玩家唯一能远距离看见的东西 ——
  // 之前菌膜藏在纯黑的水里，玩家只能靠雷达上的一个像素去找。
  const halo=new THREE.Mesh(new THREE.SphereGeometry(4.6,20,14),new THREE.MeshBasicMaterial({
    color:0x8fe0b4,transparent:true,opacity:.26,blending:THREE.AdditiveBlending,depthWrite:false}));
  halo.position.y=.8;halo.name='biofilm-bioluminescence';group.add(halo);
  // 远距离也能看见的一层薄雾：深海里这是玩家唯一的路标。
  const farHalo=new THREE.Mesh(new THREE.SphereGeometry(10,16,12),new THREE.MeshBasicMaterial({
    color:0x6fd2a8,transparent:true,opacity:.03,blending:THREE.AdditiveBlending,depthWrite:false}));
  farHalo.position.y=1.4;farHalo.name='biofilm-beacon-haze';group.add(farHalo);
  const beacon=new THREE.PointLight(0x9fe8c0,20,38,2);
  beacon.position.y=1.4;beacon.name='biofilm-beacon';group.add(beacon);
  const filaments=[];
  for(let i=0;i<24;i++) {
    const angle=i/24*TAU,radius=.2+(i%6)*.11,x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    filaments.push(pipe([[x,.14,z],[x+.02,.24,z-.01],[x+.05,.32+(i%3)*.05,z+.03],[x+.1,.36+(i%4)*.035,z+.04]],.007,0xa3a382,10));
  }
  for(let i=0;i<9;i++) {
    const a=i/9*TAU;filaments.push(pipe([[0,.075,0],[Math.cos(a+.15)*.3,.16,Math.sin(a+.15)*.3],[Math.cos(a)*.62,.12,Math.sin(a)*.62],[Math.cos(a+.07)*.92,.07,Math.sin(a+.07)*.92]],.016,0x9b9c76,16));
  }
  const flow={value:0},ciliaMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.76});
  ciliaMaterial.onBeforeCompile=shader=>{
    shader.uniforms.filmTime=flow;shader.vertexShader='uniform float filmTime;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      transformed.x+=sin(filmTime*1.2+position.z*8.)*max(0.,position.y-.14)*.18;
      transformed.z+=cos(filmTime+position.x*7.)*max(0.,position.y-.14)*.12;
    `);
  };
  ciliaMaterial.customProgramCacheKey=()=> 'benthic-biofilm-cilia-v1';
  const cilia=mergeParts(filaments,ciliaMaterial);cilia.name='biofilm-flowing-filaments';group.add(cilia);
  const radius=entity.radius||2,verticalScale=Math.min(radius,1.7),substrate=[];
  if(entity.siteId==='nursery') {
    const trunk=new THREE.CylinderGeometry(.75,.69,2.35,14,7);trunk.rotateZ(Math.PI/2);trunk.scale(1,.35,1.35);
    substrate.push(part(trunk,0x6d6653,[0,-.26,0]));
    substrate.push(pipe([[-.61,-.2,.08],[-.77,-.08,.31],[-1.12,.04,.47]],.095,0x807661,15));
    substrate.push(pipe([[.59,-.2,-.09],[.78,-.09,-.31],[1.01,.08,-.43]],.073,0x69634f,15));
    for(let i=0;i<8;i++)substrate.push(pipe([[-1.1,-.26+Math.sin(i)*.23,Math.cos(i)*.22],[-.3,-.27+Math.sin(i+.13)*.23,Math.cos(i+.13)*.22],[.5,-.26+Math.sin(i)*.25,Math.cos(i)*.25],[1.12,-.26+Math.sin(i+.21)*.24,Math.cos(i+.21)*.24]],.008,0x4e5043,16));
  } else {
    const ground=(seabedHeight(entity.x,entity.z)-entity.y)/verticalScale,height=Math.max(.6,-ground);
    const rockGeometry=new THREE.CylinderGeometry(.87,entity.siteId==='shelf'?1.45:2.25,height,11,12),rockPositions=rockGeometry.attributes.position;
    for(let i=0;i<rockPositions.count;i++) {
      const x=rockPositions.getX(i),y=rockPositions.getY(i),z=rockPositions.getZ(i),variation=1+Math.sin(y*2.4+x*9)*Math.cos(z*6-y*.9)*.09;
      rockPositions.setXYZ(i,x*variation+Math.sin(y*.29)*.13,y,z*variation);
    }
    rockGeometry.computeVertexNormals();substrate.push(part(rockGeometry,entity.siteId==='shelf'?0x65716a:0x687367,[0,-height*.5-.04,0]));
  }
  const carrier=mergeParts(substrate,surfaceMaterial(.98,.02));carrier.name=entity.siteId==='nursery'?'waterlogged-driftwood':'rooted-benthic-substrate';group.add(carrier);
  group.scale.set(radius,verticalScale,radius);group.name='benthic-biofilm-patch';
  Object.assign(group.userData,{biofilm:true,film,cilia,flow,seed,baseColor:filmMaterial.color.clone()});return group;
}

export function animateBiofilm(group,entity,time,dt=0) {
  const data=group.userData,depleted=!!entity.depleted;
  data.flow.value=time+data.seed;
  const condition=depleted?.42:1-clamp(entity.progress||0,0,1)*.25;
  data.film.material.color.setRGB(condition,condition,depleted?condition*1.06:condition);
  data.cilia.scale.y=depleted?.34:1;data.cilia.material.color.setScalar(condition);
}
