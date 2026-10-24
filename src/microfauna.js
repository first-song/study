import * as THREE from '../node_modules/three/build/three.module.js';
import { mergeGeometries } from '../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { WATER_SURFACE_Y } from './biology.js';
import { worldRandom } from './world.js';

const TAU=Math.PI*2;

function merged(parts) {
  const normalized=[];
  for(const source of parts){
    const geometry=source.index?source.toNonIndexed():source.clone();
    if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
    normalized.push(geometry);
    if(source.index)source.dispose();
  }
  const result=mergeGeometries(normalized,false);
  for(const geometry of normalized)geometry.dispose();
  result.computeVertexNormals();
  return result;
}

function bacteriumGeometry() {
  const body=new THREE.CapsuleGeometry(.035,.16,3,7);
  body.rotateZ(Math.PI/2);
  const tail=new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.09,0,0),new THREE.Vector3(-.16,.025,.02),
    new THREE.Vector3(-.23,-.018,.04),new THREE.Vector3(-.3,.02,.02),
  ]),7,.005,4,false);
  return merged([body,tail]);
}

function ciliateGeometry() {
  const body=new THREE.SphereGeometry(.12,14,9);
  body.scale(1.25,.78,.92);
  const parts=[body];
  for(let index=0;index<16;index++){
    const angle=index/16*TAU;
    const cilium=new THREE.CylinderGeometry(.004,.006,.21,4,1);
    cilium.rotateZ(Math.PI*.5);
    cilium.rotateY(angle);
    cilium.translate(Math.cos(angle)*.16,Math.sin(angle*.7)*.032,Math.sin(angle)*.14);
    parts.push(cilium);
  }
  return merged(parts);
}

function diatomGeometry() {
  const parts=[new THREE.TorusGeometry(.105,.011,4,16)];
  for(let index=0;index<3;index++){
    const spoke=new THREE.BoxGeometry(.2,.007,.007);
    spoke.rotateZ(index/3*Math.PI);
    parts.push(spoke);
  }
  return merged(parts);
}

function colonyGeometry() {
  const parts=[new THREE.SphereGeometry(.045,9,7)];
  for(let branch=0;branch<5;branch++){
    const angle=branch/5*TAU+.26,side=branch%2?-1:1;
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,0,0),
      new THREE.Vector3(Math.cos(angle)*.09,.09,Math.sin(angle)*.09),
      new THREE.Vector3(Math.cos(angle)*.17,.22,Math.sin(angle)*.17),
    ]),5,.012,4,false));
    for(let index=0;index<5;index++){
      const cell=new THREE.SphereGeometry(.045+(index%2)*.007,7,5);
      const spread=.07+index*.025,cellAngle=angle+side*index*.21;
      cell.translate(
        Math.cos(cellAngle)*(.17+spread),
        .19+index*.055+Math.sin(index*.9)*.018,
        Math.sin(cellAngle)*(.17+spread),
      );
      parts.push(cell);
    }
  }
  return merged(parts);
}

function larvaGeometry() {
  const body=new THREE.SphereGeometry(.075,12,8);
  body.scale(1.2,1.4,.72);
  const tail=new THREE.ConeGeometry(.07,.19,6,1,true);
  tail.rotateX(Math.PI*.5);tail.translate(0,0,-.15);
  const fin=new THREE.PlaneGeometry(.19,.08,4,1);
  fin.rotateX(Math.PI*.5);fin.translate(0,0,-.2);
  return merged([body,tail,fin]);
}

function copepodGeometry() {
  const body=new THREE.SphereGeometry(.085,12,8);
  body.scale(1.65,.7,.78);
  const head=new THREE.SphereGeometry(.045,9,6);
  head.translate(.135,.008,0);
  const parts=[body,head];
  for(const side of [-1,1]){
    const antenna=new THREE.CylinderGeometry(.003,.005,.24,4,1);
    antenna.rotateZ(Math.PI*.42);
    antenna.rotateY(side*.46);
    antenna.translate(.22,side*.055,side*.035);
    parts.push(antenna);
  }
  const tail=new THREE.ConeGeometry(.065,.18,6,1,true);
  tail.rotateZ(-Math.PI*.5);
  tail.translate(-.24,0,0);
  parts.push(tail);
  return merged(parts);
}

function salpChainGeometry() {
  const parts=[];
  for(let index=0;index<8;index++) {
    const t=index/7,segment=new THREE.CapsuleGeometry(.055-t*.016,.13,3,7);
    segment.rotateX(Math.PI*.5);
    segment.translate(Math.sin(t*Math.PI*1.7)*.075,.025*Math.sin(t*Math.PI*2),-.24+t*.48);
    parts.push(segment);
    if(index<7){
      const link=new THREE.TorusGeometry(.044-t*.011,.006,4,9);
      link.rotateX(Math.PI*.5);
      link.translate(Math.sin((t+.08)*Math.PI*1.7)*.075,0,-.21+t*.48);
      parts.push(link);
    }
  }
  return merged(parts);
}

function rotiferGeometry() {
  const body=new THREE.CapsuleGeometry(.055,.17,4,9);
  body.rotateZ(Math.PI*.5);
  const parts=[body];
  const wheel=new THREE.TorusGeometry(.075,.012,5,16);
  wheel.rotateY(Math.PI*.5);wheel.translate(.14,.05,0);parts.push(wheel);
  const foot=new THREE.ConeGeometry(.035,.15,6,1,true);
  foot.rotateZ(-Math.PI*.5);foot.translate(-.17,-.03,0);parts.push(foot);
  for(let index=0;index<8;index++){
    const angle=index/8*TAU;
    const hair=new THREE.CylinderGeometry(.0025,.004,.1,4,1);
    hair.rotateZ(angle);
    hair.translate(.17+Math.cos(angle)*.045,.05+Math.sin(angle)*.045,0);
    parts.push(hair);
  }
  return merged(parts);
}

function radiolariaGeometry() {
  const inner=new THREE.TorusGeometry(.11,.009,4,16);
  inner.rotateX(Math.PI*.5);
  inner.rotateY(Math.PI*.33);
  const parts=[new THREE.TorusGeometry(.16,.012,4,20),inner];
  for(let index=0;index<14;index++){
    const angle=index/14*TAU,spike=new THREE.CylinderGeometry(.003,.007,.23,4,1);
    spike.rotateZ(angle);
    spike.translate(Math.cos(angle)*.18,Math.sin(angle)*.18,(index%3-1)*.025);
    parts.push(spike);
  }
  return merged(parts);
}

function wormColonyGeometry() {
  const parts=[];
  for(let index=0;index<9;index++){
    const t=index/8;
    const segment=new THREE.SphereGeometry(.048-t*.018,8,6);
    segment.scale(1,1,.72);
    segment.translate(Math.sin(t*Math.PI*2.2)*.055,Math.sin(t*Math.PI)*.045,-.2+t*.42);
    parts.push(segment);
  }
  for(let index=0;index<18;index++){
    const side=index%2?1:-1,t=Math.floor(index/2)/8;
    const hair=new THREE.CylinderGeometry(.002,.003,.075,4,1);
    hair.rotateZ(side*Math.PI*.42);
    hair.translate(side*.045,Math.sin(t*Math.PI)*.025-.018,-.17+t*.42);
    parts.push(hair);
  }
  return merged(parts);
}

const LAYERS=[
  {id:'bacteria',geometry:bacteriumGeometry,count:140,color:[.45,.58,.54],roughness:.62,scale:[.72,1.18]},
  {id:'ciliate',geometry:ciliateGeometry,count:54,color:[.50,.62,.54],roughness:.55,scale:[1.05,1.72]},
  {id:'diatom',geometry:diatomGeometry,count:56,color:[.66,.55,.36],roughness:.5,scale:[.9,1.5]},
  {id:'colony',geometry:colonyGeometry,count:30,color:[.39,.52,.39],roughness:.72,scale:[1.02,1.72]},
  {id:'larva',geometry:larvaGeometry,count:22,color:[.48,.63,.68],roughness:.54,scale:[1.2,1.95]},
  {id:'copepod',geometry:copepodGeometry,count:32,color:[.64,.49,.31],roughness:.6,scale:[.88,1.45]},
  {id:'salp',geometry:salpChainGeometry,count:14,color:[.46,.66,.63],roughness:.47,scale:[1.3,1.9]},
  {id:'rotifer',geometry:rotiferGeometry,count:22,color:[.60,.66,.46],roughness:.6,scale:[1.15,1.86]},
  {id:'radiolaria',geometry:radiolariaGeometry,count:36,color:[.55,.42,.64],roughness:.4,scale:[1.0,1.62]},
  {id:'worm',geometry:wormColonyGeometry,count:16,color:[.58,.47,.32],roughness:.66,scale:[1.1,1.72]},
];

export function createMicrofauna(world) {
  const group=new THREE.Group();group.name='microplankton-and-multicellular-drift';
  const random=worldRandom((world.seed^0x2c9e41)>>>0),tint=new THREE.Color(),dummy=new THREE.Object3D();
  const meshes={},specimens=[];
  for(const layer of LAYERS){
    const material=new THREE.MeshStandardMaterial({
      color:0xffffff,emissive:new THREE.Color(layer.color[0]*.13,layer.color[1]*.18,layer.color[2]*.15),
      emissiveIntensity:.18,roughness:layer.roughness,metalness:0,
      transparent:true,opacity:['colony','worm'].includes(layer.id)?.72:.58,
      depthWrite:['colony','rotifer','worm'].includes(layer.id),
      side:THREE.DoubleSide,
    });
    const mesh=new THREE.InstancedMesh(layer.geometry(),material,layer.count);
    mesh.name=`microfauna-${layer.id}`;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled=false;
    const layerSpecimens=[];
    for(let index=0;index<layer.count;index++){
      const nearSpecies=['bacteria','ciliate','diatom','colony'].includes(layer.id);
      const angle=random()*TAU,radius=nearSpecies
        ?1.05+Math.sqrt(random())*13.5
        :1.8+Math.sqrt(random())*22;
      const specimen={
        x:Math.cos(angle)*radius,z:Math.sin(angle)*radius,
        y:40+(random()-.5)*(nearSpecies?11:16),
        vx:(random()-.5)*.14,vy:(random()-.5)*.04,vz:(random()-.5)*.14,
        phase:random()*TAU,spin:(random()-.5)*.85,
        herd:nextSpeciesTrait(layer.id,index,random),
        reaction:0.7+random()*1.8,
        recycles:0,
        scale:layer.scale[0]+random()*(layer.scale[1]-layer.scale[0]),
        index,
      };
      layerSpecimens.push(specimen);specimens.push({...specimen,layer:layer.id,mesh});
      tint.setHSL(
        layer.color[0]+(index%5)*.007,
        layer.color[1]+(index%4)*.022,
        layer.color[2]+(index%6)*.026,
      );
      mesh.setColorAt(index,tint);
    }
    mesh.instanceColor.needsUpdate=true;meshes[layer.id]=mesh;group.add(mesh);
  }
  group.userData={meshes,specimens,dummy,radius:26,version:4};
  animateMicrofauna(group,0,0,{x:0,y:38,z:0});
  return group;
}

function nextSpeciesTrait(layer,index,random) {
  const clustered=['colony','worm','larva','salp'].includes(layer);
  return {
    drift:0.42+random()*0.9,
    wander:0.45+random()*1.35,
    shy:layer==='bacteria'?0.7+random()*0.6:layer==='ciliate'?0.35+random()*0.7:0.06+random()*0.24,
    group:clustered?0.35+random()*0.7:0.05+random()*0.16,
    anchorAngle:(index%17)/17*TAU+(layer==='colony'?0:1.7),
  };
}

function hashAngle(specimen) {
  const value=Math.sin((specimen.phase+specimen.recycles*2.399+specimen.index*.731)*12.9898)*43758.5453;
  return (value-Math.floor(value))*TAU;
}

export function animateMicrofauna(group,time,dt,player) {
  if(!group)return;
  const data=group.userData,dummy=data.dummy;
  const safeDt=Math.max(0,Math.min(.1,Number(dt)||0));
  const px=Number(player.x)||0,py=Math.min(WATER_SURFACE_Y-1.2,Number(player.y)||38),pz=Number(player.z)||0;
  const playerSpeed=Math.hypot(Number(player.vx)||0,Number(player.vy)||0,Number(player.vz)||0);
  // Keep the instance group at the origin. Specimens retain absolute world
  // coordinates and are recycled one by one at the edge of the local biome.
  group.position.set(0,0,0);
  for(const specimen of data.specimens){
    if(specimen.index>=specimen.mesh.count)continue;
    const trait=specimen.herd;
    const dx=specimen.x-px,dy=specimen.y-py,dz=specimen.z-pz;
    const planar=Math.hypot(dx,dz),distance=Math.hypot(dx,dy,dz)||.001;
    const clusterAngle=trait.anchorAngle+time*(.055+trait.wander*.018);
    let targetVx=specimen.vx*trait.drift
      +Math.sin(time*(.08+trait.wander*.028)+specimen.phase)*.032*trait.wander
      +Math.cos(clusterAngle)*trait.group*.055;
    let targetVy=specimen.vy*.55
      +Math.cos(time*(.06+trait.wander*.022)+specimen.phase*1.3)*.014*trait.wander;
    let targetVz=specimen.vz*trait.drift
      +Math.cos(time*(.07+trait.wander*.026)+specimen.phase*.8)*.032*trait.wander
      +Math.sin(clusterAngle)*trait.group*.055;
    if(playerSpeed>.55&&distance<1.75){
      const fright=(1.75-distance)/1.75*trait.shy*(.1+Math.min(.45,playerSpeed/20));
      targetVx+=dx/distance*fright+Math.sin(specimen.phase+time*.7)*fright*.12;
      targetVy+=dy/distance*fright*.28;
      targetVz+=dz/distance*fright+Math.cos(specimen.phase+time*.6)*fright*.12;
    }
    const response=1-Math.exp(-safeDt*specimen.reaction*(playerSpeed>3?1.35:1));
    specimen.vx+=(targetVx-specimen.vx)*response;
    specimen.vy+=(targetVy-specimen.vy)*response;
    specimen.vz+=(targetVz-specimen.vz)*response;
    specimen.x+=specimen.vx*safeDt;
    specimen.y=Math.max(2.8,Math.min(WATER_SURFACE_Y-1.15,specimen.y+specimen.vy*safeDt));
    specimen.z+=specimen.vz*safeDt;
    if(planar>data.radius+4||Math.abs(dy)>13.5){
      const angle=hashAngle(specimen),nextRadius=data.radius*(.74+((specimen.index%13)/13)*.22);
      specimen.x=px+Math.cos(angle)*nextRadius;
      specimen.z=pz+Math.sin(angle)*nextRadius;
      specimen.y=Math.max(2.8,Math.min(WATER_SURFACE_Y-1.15,py+(specimen.vy/Math.max(.04,Math.abs(specimen.vy)+.09))*6));
      specimen.recycles=(specimen.recycles+1)%97;
    }
    const pulse=['colony','worm','salp'].includes(specimen.layer)
      ?1+Math.sin(time*1.35+specimen.phase)*.07
      :1;
    dummy.position.set(specimen.x,specimen.y,specimen.z);
    const speed=Math.hypot(specimen.vx,specimen.vy,specimen.vz);
    dummy.rotation.set(
      speed>.005?-Math.asin(Math.max(-.55,Math.min(.55,specimen.vy/speed))):Math.sin(time*.42+specimen.phase)*.12,
      speed>.005?Math.atan2(-specimen.vz,specimen.vx):time*specimen.spin*.18+specimen.phase,
      Math.sin(time*.51+specimen.phase)*.12,
    );
    dummy.scale.setScalar(specimen.scale*pulse);
    dummy.updateMatrix();
    specimen.mesh.setMatrixAt(specimen.index,dummy.matrix);
  }
  for(const mesh of Object.values(data.meshes))mesh.instanceMatrix.needsUpdate=true;
}

export function setMicrofaunaQuality(group,quality,lifeStage=0) {
  if(!group)return;
  const qualityRatio=quality==='high'?1:quality==='low'?.4:.86;
  const stageRatio=lifeStage<=0?1:lifeStage===1?.34:0;
  const ratio=qualityRatio*stageRatio;
  for(const mesh of Object.values(group.userData.meshes))mesh.count=Math.max(0,Math.round(mesh.instanceMatrix.count*ratio));
}
