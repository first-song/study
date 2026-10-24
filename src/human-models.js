import * as THREE from '../node_modules/three/build/three.module.js';
import { mergeGeometries } from '../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyWetness, createSurfaceMaps } from './visual-materials.js';
import { createHinomaruFlag, hinomaruTexture } from './japanese-marks.js';

const TAU=Math.PI*2;
const materials={
  skin:new THREE.MeshStandardMaterial({color:0xb98d72,roughness:.78}),
  darkSkin:new THREE.MeshStandardMaterial({color:0x765647,roughness:.82}),
  coat:new THREE.MeshStandardMaterial({color:0xd7ddd2,roughness:.86}),
  vest:new THREE.MeshStandardMaterial({color:0xd69035,roughness:.72}),
  resident:new THREE.MeshStandardMaterial({color:0xa9b4ae,roughness:.83}),
  raincoat:new THREE.MeshStandardMaterial({color:0x8b673d,roughness:.8}),
  helmet:new THREE.MeshStandardMaterial({color:0xe6b23f,roughness:.55}),
  trousers:new THREE.MeshStandardMaterial({color:0x24363d,roughness:.9}),
  suit:new THREE.MeshStandardMaterial({color:0x253d47,roughness:.7,metalness:.05}),
  rubber:new THREE.MeshStandardMaterial({color:0x111b20,roughness:.92}),
  steel:new THREE.MeshStandardMaterial({color:0x718084,metalness:.72,roughness:.46}),
  darkSteel:new THREE.MeshStandardMaterial({color:0x334449,metalness:.55,roughness:.62}),
  wood:new THREE.MeshStandardMaterial({color:0x6d5941,roughness:.92}),
  glass:new THREE.MeshPhysicalMaterial({color:0x93ced3,roughness:.12,metalness:0,transparent:true,opacity:.35,clearcoat:1,depthWrite:false}),
  warm:new THREE.MeshStandardMaterial({color:0x2a2113,emissive:0xffb65e,emissiveIntensity:2.4,roughness:.4}),
  cyan:new THREE.MeshStandardMaterial({color:0x10292c,emissive:0x58e7cd,emissiveIntensity:1.8,roughness:.38}),
  alarm:new THREE.MeshStandardMaterial({color:0x31140f,emissive:0xff603d,emissiveIntensity:2.2,roughness:.42}),
};
for(const material of Object.values(materials))material.userData.shared=true;

const shipPaintMaps=createSurfaceMaps('paint',{size:160,repeat:3.2,seed:0x7d31b9,normalStrength:.72});
const shipDeckMaps=createSurfaceMaps('concrete',{size:128,repeat:2.4,seed:0x519ce2,normalStrength:.55});
const shipPaintMaterial=new THREE.MeshPhysicalMaterial({
  color:0xb7c3c1,metalness:.34,roughness:.36,...shipPaintMaps,
  normalScale:new THREE.Vector2(.55,.55),clearcoat:.82,clearcoatRoughness:.18,envMapIntensity:1.15,
});
const shipDeckMaterial=new THREE.MeshPhysicalMaterial({
  color:0x67767a,metalness:.46,roughness:.42,...shipDeckMaps,
  normalScale:new THREE.Vector2(.65,.65),clearcoat:.34,clearcoatRoughness:.34,envMapIntensity:.9,
});
applyWetness(shipPaintMaterial,.22);applyWetness(shipDeckMaterial,.16);

function mesh(geometry,material,position=[0,0,0]) {
  const result=new THREE.Mesh(geometry,material);
  result.position.set(...position);return result;
}

function jointPivot(parent,name,position) {
  const pivot=new THREE.Group();pivot.name=name;pivot.position.set(...position);parent.add(pivot);return pivot;
}

function gabledRoofGeometry() {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([
    -.5,0,-.5, .5,0,-.5, 0,1,-.5,
    -.5,0,.5, .5,0,.5, 0,1,.5,
  ],3));
  geometry.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,1,2,5,1,5,4,0,1,4,0,4,3]);
  geometry.computeVertexNormals();
  return geometry;
}

function mergeStaticMeshes(root,protectedRoots=[]) {
  root.updateWorldMatrix(true,true);
  const protectedNodes=new Set();
  for(const protectedRoot of protectedRoots)protectedRoot?.traverse(node=>protectedNodes.add(node));
  const inverseRoot=root.matrixWorld.clone().invert(),batches=new Map();
  root.traverse(node=>{
    if(!node.isMesh||protectedNodes.has(node)||node.userData.keepSeparate)return;
    const geometry=node.geometry.clone();
    geometry.applyMatrix4(inverseRoot.clone().multiply(node.matrixWorld));
    if(geometry.index)geometry.setIndex(geometry.index.clone());
    const normalized=geometry.index?geometry.toNonIndexed():geometry;
    if(!normalized.attributes.uv){
      normalized.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(normalized.attributes.position.count*2),2));
    }
    for(const attribute of Object.keys(normalized.attributes))if(!['position','normal','uv'].includes(attribute))normalized.deleteAttribute(attribute);
    if(!normalized.attributes.normal)normalized.computeVertexNormals();
    const key=node.material.uuid;
    if(!batches.has(key))batches.set(key,{material:node.material,geometries:[],nodes:[]});
    batches.get(key).geometries.push(normalized);batches.get(key).nodes.push(node);
  });
  for(const {material,geometries,nodes} of batches.values()){
    if(geometries.length<2) {
      for(const geometry of geometries)geometry.dispose();
      continue;
    }
    const merged=mergeGeometries(geometries,false);
    for(const geometry of geometries)geometry.dispose();
    if(!merged)continue;
    const mesh=new THREE.Mesh(merged,material);mesh.name='merged-static-detail';
    for(const node of nodes)node.parent?.remove(node);
    root.add(mesh);
  }
}

function humanFigure(kind='worker') {
  const root=new THREE.Group();root.name=`human-${kind}`;
  const joints={};
  const body=jointPivot(root,'torso',[0,1.5,0]);
  const cloth=kind==='scientist'?materials.coat:kind==='diver'?materials.suit:kind==='civilian'?materials.resident:kind==='fisher'?materials.raincoat:materials.vest;
  body.add(mesh(new THREE.CapsuleGeometry(.27,.68,4,10),cloth,[0,.22,0]));
  body.add(mesh(new THREE.CylinderGeometry(.22,.24,.22,8),materials.trousers,[0,-.32,0]));
  body.add(mesh(new THREE.BoxGeometry(.43,.065,.28),materials.rubber,[0,-.11,0]));
  body.add(mesh(new THREE.CylinderGeometry(.11,.13,.17,9),materials.skin,[0,.61,0]));
  body.add(mesh(new THREE.BoxGeometry(.34,.12,.06),cloth,[0,.47,-.25]));
  const head=jointPivot(body,'head',[0,.75,0]);
  head.add(mesh(new THREE.SphereGeometry(.21,12,9),kind==='scientist'?materials.darkSkin:materials.skin));
  head.add(mesh(new THREE.SphereGeometry(.215,12,7,0,TAU,0,Math.PI*.4),materials.rubber,[0,.055,.025]));
  head.add(mesh(new THREE.SphereGeometry(.045,8,6),materials.skin,[0,-.01,-.205]));
  head.add(mesh(new THREE.BoxGeometry(.1,.025,.035),materials.darkSteel,[-.075,-.015,-.198]));
  head.add(mesh(new THREE.BoxGeometry(.1,.025,.035),materials.darkSteel,[.075,-.015,-.198]));
  if(kind==='worker') {
    head.add(mesh(new THREE.SphereGeometry(.245,12,7,0,TAU,0,Math.PI*.54),materials.helmet,[0,.08,0]));
    body.add(mesh(new THREE.BoxGeometry(.45,.14,.26),materials.warm,[0,.38,-.24]));
    for(const x of [-.12,.12])body.add(mesh(new THREE.BoxGeometry(.035,.48,.025),materials.coat,[x,.27,-.282]));
    body.add(mesh(new THREE.BoxGeometry(.48,.055,.03),materials.coat,[0,.12,-.276]));
    body.add(mesh(new THREE.BoxGeometry(.48,.035,.03),materials.coat,[0,.24,-.276]));
  } else if(kind==='scientist') {
    body.add(mesh(new THREE.BoxGeometry(.42,.5,.12),materials.glass,[0,.3,-.24]));
    head.add(mesh(new THREE.BoxGeometry(.33,.1,.14),materials.darkSteel,[0,.09,-.17]));
    body.add(mesh(new THREE.TorusGeometry(.18,.018,5,12,Math.PI),materials.darkSteel,[0,.53,-.2]));
  } else if(kind==='diver') {
    head.add(mesh(new THREE.BoxGeometry(.34,.19,.15),materials.glass,[0,.02,-.15]));
    head.add(mesh(new THREE.CylinderGeometry(.06,.06,.15,8),materials.darkSteel,[0,-.13,.2]));
    body.add(mesh(new THREE.CylinderGeometry(.12,.12,.67,12),materials.darkSteel,[0,.18,.3]));
    body.add(mesh(new THREE.TorusGeometry(.17,.035,6,16),materials.steel,[0,.02,-.2]));
  } else {
    const hatMaterial=kind==='fisher'?materials.raincoat:materials.trousers;
    head.add(mesh(new THREE.CylinderGeometry(.23,.27,.08,12),hatMaterial,[0,.2,0]));
    body.add(mesh(new THREE.BoxGeometry(.38,.08,.08),kind==='fisher'?materials.vest:materials.coat,[0,.02,-.24]));
    body.add(mesh(new THREE.BoxGeometry(.32,.035,.045),materials.rubber,[0,.21,-.235]));
  }
  for(const side of [-1,1]) {
    const shoulder=jointPivot(body,side<0?'armL':'armR',[side*.33,.42,0]);
    shoulder.rotation.z=side*(kind==='diver'?.12:.04);
    shoulder.add(mesh(new THREE.CapsuleGeometry(.075,.48,3,7),cloth,[0,-.25,0]));
    shoulder.add(mesh(new THREE.SphereGeometry(.085,8,6),materials.skin,[0,-.53,0]));
    const hip=jointPivot(root,side<0?'legL':'legR',[side*.14,1.06,0]);
    hip.add(mesh(new THREE.CapsuleGeometry(.095,.66,3,7),materials.trousers,[0,-.42,0]));
    hip.add(mesh(new THREE.BoxGeometry(.18,.14,.33),materials.rubber,[0,-1.01,-.06]));
    hip.add(mesh(new THREE.BoxGeometry(.185,.045,.34),materials.rubber,[0,-.91,-.06]));
    joints[side<0?'leftArm':'rightArm']=shoulder;
    joints[side<0?'leftLeg':'rightLeg']=hip;
  }
  root.userData={kind,joints,phase:0,baseY:0};
  return root;
}

function mergeArticulatedHuman(root) {
  const body=root.getObjectByName('torso');
  const head=body?.getObjectByName('head');
  const arms=[root.getObjectByName('armL'),root.getObjectByName('armR')];
  const legs=[root.getObjectByName('legL'),root.getObjectByName('legR')];
  if(!body)return;
  if(head)mergeStaticMeshes(head);
  mergeStaticMeshes(body,[head,...arms].filter(Boolean));
  for(const arm of arms)if(arm)mergeStaticMeshes(arm);
  for(const leg of legs)if(leg)mergeStaticMeshes(leg);
}

function boatHullGeometry() {
  // One continuous welded hull profile. The long tapering bow, flared waist
  // and squared stern read as a patrol ship instead of two stacked cylinders.
  const outline=[
    [0,-13.8],[-1.15,-13.05],[-2.4,-11.35],[-3.45,-8.2],
    [-4.15,-3.2],[-4.35,5.2],[-3.95,9.4],[-3.15,11.75],
    [0,12.8],[3.15,11.75],[3.95,9.4],[4.35,5.2],
    [4.15,-3.2],[3.45,-8.2],[2.4,-11.35],[1.15,-13.05],
  ];
  const deckY=.96,keelY=-1.72,positions=[],uvs=[],indices=[];
  for(const [x,z] of outline){positions.push(x,deckY,z);uvs.push(x/8.7+.5,z/27.6+.5);}
  for(const [x,z] of outline){positions.push(x*.72,keelY,z*.84);uvs.push(x/8.7+.5,z/27.6+.5);}
  const topCenter=positions.length/3;positions.push(0,deckY,0);
  const bottomCenter=positions.length/3;positions.push(0,keelY-.28,0);
  uvs.push(.5,.5,.5,.5);
  const n=outline.length;
  for(let i=0;i<n;i++) {
    const next=(i+1)%n;
    indices.push(i,next,n+i,next,n+next,n+i);
    indices.push(topCenter,next,i);
    indices.push(bottomCenter,n+i,n+next);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function createBoat({withCrew=true,variant='patrol',flagTexture=null}={}) {
  const launch=variant==='launch',capital=variant==='capital';
  const boat=new THREE.Group();boat.name=`gray-island-${capital?'capital-ship':launch?'harbor-launch':'patrol-ship'}`;
  const hullMaterial=shipPaintMaterial.clone();
  hullMaterial.color.setHex(capital?0x35515c:0x46636c);hullMaterial.side=THREE.DoubleSide;
  const underbodyMaterial=new THREE.MeshPhysicalMaterial({color:0x512b28,metalness:.16,roughness:.58,clearcoat:.22,side:THREE.DoubleSide});
  const stripeMaterial=new THREE.MeshStandardMaterial({color:0xb2613d,roughness:.46,metalness:.18});
  const hull=new THREE.Mesh(boatHullGeometry(),hullMaterial);boat.add(hull);
  const lowerHull=new THREE.Mesh(boatHullGeometry(),underbodyMaterial);
  lowerHull.scale.set(.985,.28,.98);lowerHull.position.y=-1.18;boat.add(lowerHull);
  boat.add(mesh(new THREE.BoxGeometry(7.8,.18,22.6),shipDeckMaterial,[0,1.08,.65]));
  for(const side of [-1,1]) {
    const stripe=mesh(new THREE.BoxGeometry(.09,.24,21.5),stripeMaterial,[side*4.18,.54,.45]);
    stripe.rotation.z=side*.006;boat.add(stripe);
    for(let i=0;i<7;i++)boat.add(mesh(new THREE.BoxGeometry(.03,.11,.42),materials.darkSteel,[side*4.38,.88,-7.7+i*2.55]));
  }
  const anchorRing=new THREE.Mesh(new THREE.TorusGeometry(.34,.075,7,18),materials.darkSteel);
  anchorRing.position.set(0,.2,-11.9);anchorRing.rotation.y=Math.PI/2;boat.add(anchorRing);
  const anchorStem=mesh(new THREE.CylinderGeometry(.06,.08,1.25,7),materials.darkSteel,[0,.64,-11.96]);
  boat.add(anchorStem);
  for(const [x,z,length] of [[-1.65,-7.7,1.8],[1.65,-7.7,1.8],[-1.55,5.9,1.55],[1.55,5.9,1.55]]){
    const hatch=mesh(new THREE.BoxGeometry(1.7,.16,length),shipDeckMaterial,[x,1.19,z]);
    hatch.name='deck-service-hatch';boat.add(hatch);
  }
  const vlsMaterial=new THREE.MeshStandardMaterial({color:0x344347,metalness:.48,roughness:.55});
  const vlsCells=new THREE.InstancedMesh(new THREE.BoxGeometry(.64,.09,.82),vlsMaterial,8);
  const vlsDummy=new THREE.Object3D();
  for(let i=0;i<8;i++){
    vlsDummy.position.set((i%4-1.5)*.78,1.23,-3.25+Math.floor(i/4)*.98);
    vlsDummy.updateMatrix();vlsCells.setMatrixAt(i,vlsDummy.matrix);
  }
  vlsCells.instanceMatrix.needsUpdate=true;boat.add(vlsCells);
  const helipadMaterial=new THREE.MeshBasicMaterial({color:0xd9dfd7,transparent:true,opacity:.64,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
  const helipad=new THREE.Mesh(new THREE.RingGeometry(1.34,1.68,32),helipadMaterial);
  helipad.rotation.x=-Math.PI/2;helipad.position.set(0,1.215,8.2);boat.add(helipad);
  const helipadCross=new THREE.Group();helipadCross.position.set(0,1.22,8.2);
  for(const rotation of [0,Math.PI/2]){
    const bar=new THREE.Mesh(new THREE.BoxGeometry(.22,.025,2.15),helipadMaterial);
    bar.rotation.y=rotation;helipadCross.add(bar);
  }
  boat.add(helipadCross);

  const bridge=new THREE.Group();bridge.name='ship-bridge';bridge.position.set(0,1.17,3.4);
  bridge.add(mesh(new THREE.BoxGeometry(5.8,2.8,6.6),shipPaintMaterial,[0,1.4,0]));
  bridge.add(mesh(new THREE.BoxGeometry(4.6,1.8,4.35),shipPaintMaterial,[0,3.55,-.6]));
  bridge.add(mesh(new THREE.BoxGeometry(5.1,.2,4.75),materials.darkSteel,[0,4.55,-.6]));
  bridge.add(mesh(new THREE.BoxGeometry(4.2,.68,.08),materials.glass,[0,3.8,-2.92]));
  bridge.add(mesh(new THREE.BoxGeometry(7.2,.16,1.35),shipDeckMaterial,[0,2.52,1.35]));
  bridge.add(mesh(new THREE.BoxGeometry(7.45,.13,.13),materials.steel,[0,3.25,2.02]));
  for(const side of [-1,1]) {
    for(let row=0;row<2;row++)for(let i=0;i<4;i++)bridge.add(mesh(new THREE.BoxGeometry(.045,.58,1.05),materials.glass,[side*2.92,2.05+row*1.55,-1.75+i*1.35]));
    bridge.add(mesh(new THREE.BoxGeometry(.38,.24,1.1),materials.darkSteel,[side*3.06,3.15,-.6]));
    bridge.add(mesh(new THREE.BoxGeometry(.42,1.55,.055),materials.darkSteel,[side*.78,.88,-3.33]));
    bridge.add(mesh(new THREE.BoxGeometry(.75,.035,.26),materials.steel,[side*2.55,3.24,2.02]));
  }
  bridge.add(mesh(new THREE.BoxGeometry(1.8,.62,1.4),materials.darkSteel,[0,5.05,1.5]));
  bridge.add(mesh(new THREE.CylinderGeometry(.07,.07,1.7,7),materials.steel,[1.85,5.45,1.5]));
  bridge.add(mesh(new THREE.SphereGeometry(.14,9,7),materials.cyan,[1.85,6.3,1.5]));
  boat.add(bridge);

  const funnel=new THREE.Group();funnel.position.set(-1.45,5.15,4.2);
  funnel.add(mesh(new THREE.CylinderGeometry(.62,.82,2.8,18),materials.darkSteel,[0,1.4,0]));
  funnel.add(mesh(new THREE.CylinderGeometry(.69,.69,.22,14),stripeMaterial,[0,2.62,0]));
  funnel.add(mesh(new THREE.CylinderGeometry(.52,.55,.28,14),materials.rubber,[0,2.85,0]));
  funnel.add(mesh(new THREE.BoxGeometry(1.25,.08,.1),materials.rubber,[0,1.55,-.79]));
  funnel.add(mesh(new THREE.BoxGeometry(1.08,.08,.1),materials.darkSteel,[0,1.15,-.75]));
  boat.add(funnel);

  const turret=new THREE.Group();turret.name='water-cannon-turret';turret.position.set(0,1.42,-7.6);
  turret.add(mesh(new THREE.CylinderGeometry(.92,1.15,.42,16),materials.darkSteel,[0,.2,0]));
  turret.add(mesh(new THREE.BoxGeometry(1.55,.75,1.35),shipPaintMaterial,[0,.72,.15]));
  const barrel=mesh(new THREE.CylinderGeometry(.12,.17,3.1,10),materials.steel,[0,.82,-1.9]);barrel.rotation.x=Math.PI/2;turret.add(barrel);
  for(const side of [-1,1]){
    const nozzle=mesh(new THREE.CylinderGeometry(.075,.11,2.45,9),materials.steel,[side*.31,.86,-1.63]);nozzle.rotation.x=Math.PI/2;turret.add(nozzle);
  }
  turret.add(mesh(new THREE.SphereGeometry(.13,9,7),materials.alarm,[.49,.96,.5]));
  boat.add(turret);

  const mast=new THREE.Group();mast.position.set(1.65,5.2,3.2);
  mast.add(mesh(new THREE.CylinderGeometry(.07,.13,7.2,8),materials.steel,[0,3.6,0]));
  mast.add(mesh(new THREE.BoxGeometry(4.2,.15,.15),materials.steel,[0,5.65,0]));
  const radar=new THREE.Group();radar.position.set(0,7.3,0);
  radar.add(mesh(new THREE.BoxGeometry(3.8,.16,.65),materials.steel));
  radar.add(mesh(new THREE.CylinderGeometry(.08,.08,.9,6),materials.darkSteel,[0,-.45,0]));
  mast.add(radar);
  const searchlight=new THREE.Group();searchlight.position.set(0,3.1,0);
  searchlight.add(mesh(new THREE.CylinderGeometry(.28,.38,.7,12),materials.darkSteel,[0,0,-.15]));
  const lens=mesh(new THREE.SphereGeometry(.28,12,8,0,TAU,0,Math.PI*.6),materials.warm,[0,0,-.53]);searchlight.add(lens);
  const beamMaterial=new THREE.MeshBasicMaterial({color:0xffd38c,transparent:true,opacity:.055,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.FrontSide});
  const beam=mesh(new THREE.ConeGeometry(4.2,28,20,1,true),beamMaterial,[0,0,-14.2]);
  beam.rotation.x=-Math.PI/2;beam.rotation.z=Math.PI;searchlight.add(beam);
  mast.add(searchlight);boat.add(mast);
  const antenna=mesh(new THREE.CylinderGeometry(.025,.035,5.5,6),materials.steel,[-1.45,8.1,3.9]);boat.add(antenna);
  const lamp=mesh(new THREE.SphereGeometry(.2,10,7),materials.alarm,[-1.45,10.9,3.9]);boat.add(lamp);

  const lifeboats=new THREE.Group();lifeboats.name='lifeboats';
  for(const side of [-1,1]) {
    const davit=new THREE.Group();davit.position.set(side*2.8,3.15,1.35);
    davit.add(mesh(new THREE.BoxGeometry(.2,.2,5.1),materials.steel,[0,0,0]));
    const capsule=mesh(new THREE.CapsuleGeometry(.42,2.7,5,10),materials.vest,[0,-.35,.7]);capsule.rotation.x=Math.PI/2;davit.add(capsule);
    lifeboats.add(davit);
  }
  boat.add(lifeboats);

  const rails=new THREE.Group();rails.name='deck-railings';
  for(const side of [-1,1]) {
    rails.add(mesh(new THREE.CylinderGeometry(.022,.028,17.7,5),materials.steel,[side*3.72,1.85,-1.2]));
    for(let i=0;i<8;i++)rails.add(mesh(new THREE.CylinderGeometry(.018,.024,.72,5),materials.steel,[side*3.72,1.49,-9.5+i*2.35]));
  }
  rails.add(mesh(new THREE.CylinderGeometry(.022,.028,7.1,5),materials.steel,[0,1.85,8.15]));
  boat.add(rails);

  const flag=new THREE.Group();flag.position.set(0,1.3,12.55);
  flag.add(mesh(new THREE.CylinderGeometry(.035,.05,4.6,6),materials.steel,[0,2.2,0]));
  const flagMaterial=flagTexture
    ? new THREE.MeshStandardMaterial({map:flagTexture,color:0xffffff,roughness:.86,metalness:0,side:THREE.DoubleSide})
    : materials.vest;
  const cloth=mesh(new THREE.PlaneGeometry(2.4,.85,8,2),flagMaterial,[1.2,3.65,0]);cloth.rotation.y=Math.PI/2;flag.add(cloth);
  boat.add(flag);

  const wakeMaterial=new THREE.MeshBasicMaterial({color:0x9bd7d0,transparent:true,opacity:.19,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
  const wake=new THREE.Group();wake.name='boat-wake';
  for(const side of [-1,1]) {
    const foam=mesh(new THREE.PlaneGeometry(2.7,30),wakeMaterial,[side*2.1,-1.05,25]);
    foam.rotation.x=-Math.PI/2;foam.rotation.z=side*.12;wake.add(foam);
    const crest=mesh(new THREE.PlaneGeometry(.62,18),wakeMaterial,[side*4.7,-1.04,17]);
    crest.rotation.x=-Math.PI/2;crest.rotation.z=side*.2;wake.add(crest);
  }
  boat.add(wake);
  const contactMaterial=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uAlert:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float uTime;uniform float uAlert;varying vec2 vUv;
      void main(){
        vec2 p=(vUv-.5)*2.;
        float hull=smoothstep(1.05,.42,length(p*vec2(1.75,1.0)));
        float rim=smoothstep(.95,.62,length(p*vec2(1.58,.9)))-smoothstep(.9,.55,length(p*vec2(1.58,.9)));
        float ripple=.5+.5*sin(length(p*vec2(9.,5.))-uTime*2.2);
        float alpha=hull*.2+rim*ripple*(.08+uAlert*.08);
        gl_FragColor=vec4(vec3(.015,.075,.085),alpha);
      }`,
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
  });
  const contactWater=mesh(new THREE.PlaneGeometry(12.5,34),contactMaterial,[0,-.08,.4]);
  contactWater.rotation.x=-Math.PI/2;contactWater.renderOrder=5;contactWater.name='ship-water-contact';
  boat.add(contactWater);

  let crew=null;
  const crews=[];
  let crewGroup=null;
  if(withCrew) {
    crewGroup=new THREE.Group();crewGroup.name='ship-crew';
    for(const [kind,x,y,z,scale,facing] of [
      ['worker',-.9,1.18,-5.1,.74,0],['scientist',1.85,1.18,7.4,.7,Math.PI],
      ['worker',-1.35,1.18,8.7,.72,Math.PI],
    ]) {
      const person=humanFigure(kind);person.scale.setScalar(scale);person.position.set(x,y,z);person.rotation.y=facing;
      person.userData.phase=crews.length*1.37;crewGroup.add(person);crews.push(person);
    }
    crew=crews[0];boat.add(crewGroup);
  }
  mergeStaticMeshes(bridge);
  mergeStaticMeshes(turret);
  mergeStaticMeshes(radar);
  mergeStaticMeshes(boat,[crewGroup,bridge,turret,wake,searchlight,radar,lamp,rails,lifeboats]);
  const detail=new THREE.Group();detail.name='boat-near-detail';detail.add(rails,lifeboats);
  mergeStaticMeshes(detail);boat.add(detail);
  if(launch)boat.scale.setScalar(.42);
  else if(!capital)boat.scale.setScalar(.88);
  boat.traverse(node=>{
    if(!node.isMesh||node.material?.transparent)return;
    node.castShadow=true;
    node.receiveShadow=true;
  });
  boat.userData={lamp,cabin:bridge,crew,crews,phase:1.7,searchlight,beam,wake,detail,lens,beamMaterial,wakeMaterial,contactMaterial,radar,turret,capital,length:capital?31:24,variant};return boat;
}

export function createSurfaceFleet() {
  const fleet=new THREE.Group();fleet.name='gray-island-patrol-fleet';
  const boats=[];
  for(let i=0;i<3;i++){
    const boat=createBoat({withCrew:i===0,variant:i===0?'capital':'patrol',flagTexture:hinomaruTexture()});
    if(i>0)boat.scale.multiplyScalar(.92+i*.025);
    boat.userData.index=i;
    fleet.add(boat);boats.push(boat);
  }
  fleet.userData.boats=boats;return fleet;
}

export function animateSurfaceFleet(fleet,time,states,viewer=null) {
  for(const boat of fleet.userData.boats||[]) {
    const state=states[boat.userData.index];if(!state)continue;
    boat.position.set(state.x,state.y+Math.sin(time*.9+state.offset)*.09,state.z);
    boat.rotation.y=state.heading;
    boat.rotation.z=Math.sin(time*.72+state.offset)*.026;
    boat.rotation.x=Math.sin(time*.51+state.offset)*.014;
    boat.userData.searchlight.rotation.y=state.beamAngle;
    boat.userData.beamMaterial.opacity=state.active?.048:state.warning?.022:.008;
    boat.userData.lens.material=state.warning?materials.warm:materials.cyan;
    boat.userData.lamp.material=state.warning?materials.alarm:materials.warm;
    boat.userData.wakeMaterial.opacity=.09+(state.active?.08:.02);
    boat.userData.wake.scale.z=.7+Math.sin(time*1.2+state.offset)*.12;
    boat.userData.contactMaterial.uniforms.uTime.value=time;
    boat.userData.contactMaterial.uniforms.uAlert.value=state.active?1:state.warning?.45:0;
    if(viewer){const distance=Math.hypot(viewer.x-state.x,viewer.z-state.z);boat.userData.detail.visible=distance<180;}
    boat.userData.radar.rotation.y=time*.8+state.offset;
    boat.userData.turret.rotation.y=state.beamAngle*.34;
    for(const person of boat.userData.crews||[]) {
      const joints=person.userData.joints,phase=time*.82+state.offset+person.userData.phase;
      joints.leftArm.rotation.x=Math.sin(phase)*.08;joints.rightArm.rotation.x=-Math.sin(phase)*.08;
      joints.leftLeg.rotation.x=Math.sin(phase*.55)*.025;joints.rightLeg.rotation.x=-Math.sin(phase*.55)*.025;
    }
  }
}

export function createResearchWreck(point={x:-24,z:-18,y:0}) {
  const root=new THREE.Group();root.name='sunken-gray-island-research-boat';
  const boat=createBoat({withCrew:false});boat.name='gray-island-workboat';boat.scale.multiplyScalar(1.1);boat.rotation.set(.16,1.05,.3);
  boat.position.y=.5;root.add(boat);
  const broken=new THREE.Group();broken.rotation.z=.45;broken.position.set(2.4,.7,1.8);
  broken.add(mesh(new THREE.BoxGeometry(2.2,.5,1.4),materials.darkSteel));
  broken.add(mesh(new THREE.CylinderGeometry(.1,.14,2.6,7),materials.steel,[.7,.9,.2]));
  root.add(broken);
  const beacon=mesh(new THREE.SphereGeometry(.18,10,7),materials.alarm,[-1.8,2.45,1.2]);root.add(beacon);
  const bubblePositions=new Float32Array(140*3);
  for(let i=0;i<140;i++){bubblePositions[i*3]=(i*37%100)/100*7-3.5;bubblePositions[i*3+1]=(i*53%100)/100*9;bubblePositions[i*3+2]=(i*71%100)/100*9-4;}
  const bubbleGeometry=new THREE.BufferGeometry();bubbleGeometry.setAttribute('position',new THREE.BufferAttribute(bubblePositions,3));
  const bubbles=new THREE.Points(bubbleGeometry,new THREE.PointsMaterial({color:0x9edbd4,size:.12,transparent:true,opacity:.35,depthWrite:false}));root.add(bubbles);
  root.position.set(point.x,point.y,point.z);root.userData={beacon,bubbles,time:0,detail:boat.userData.detail};return root;
}

export function animateResearchWreck(group,time) {
  group.rotation.z=Math.sin(time*.17)*.012;
  group.userData.beacon.material.emissiveIntensity=1.3+Math.sin(time*2.1)*.7;
  const position=group.userData.bubbles.geometry.attributes.position;
  for(let i=0;i<position.count;i++)position.setY(i,(position.getY(i)+.22+Math.sin(time+i)*.04)%9);
  position.needsUpdate=true;
}

export function createHumanSettlement() {
  const group=new THREE.Group();group.name='gray-island-human-settlement';
  const animatables={humans:[],boats:[],lights:[],searchlight:null};
  const pier=new THREE.Group();pier.name='south-human-pier';
  for(let i=0;i<8;i++)pier.add(mesh(new THREE.BoxGeometry(5.4,.2,2.1),materials.wood,[0,1.1,4+i*2.1]));
  for(const side of [-1,1])for(let i=0;i<5;i++)pier.add(mesh(new THREE.CylinderGeometry(.16,.2,5.5,8),materials.darkSteel,[side*2.2,-1.4,4+i*4.0]));
  for(let i=0;i<8;i+=2)pier.add(mesh(new THREE.BoxGeometry(.08,.07,.08),materials.warm,[0,1.6,5+i*2]));
  mergeStaticMeshes(pier);
  group.add(pier);
  const shack=new THREE.Group();shack.position.set(-5,1.1,1.5);
  shack.add(mesh(new THREE.BoxGeometry(4.6,3.4,3.8),materials.coat,[0,1.7,0]));
  shack.add(mesh(new THREE.BoxGeometry(2.1,.9,.06),materials.glass,[.4,2.1,1.93]));
  shack.add(mesh(new THREE.BoxGeometry(1.9,.6,1.8),materials.steel,[0,3.75,0]));
  mergeStaticMeshes(shack);
  group.add(shack);
  const crane=new THREE.Group();crane.position.set(5,1.1,-1);
  crane.add(mesh(new THREE.CylinderGeometry(.34,.48,8,10),materials.steel,[0,4,0]));
  crane.add(mesh(new THREE.BoxGeometry(9,.28,.36),materials.steel,[3.8,8,0]));
  crane.add(mesh(new THREE.CylinderGeometry(.035,.035,4.4,6),materials.darkSteel,[7.2,5.9,0]));
  mergeStaticMeshes(crane);
  group.add(crane);
  const warehouse=new THREE.Group();warehouse.name='harbor-warehouse';warehouse.position.set(-6.4,1.1,8.4);
  warehouse.add(mesh(new THREE.BoxGeometry(7.2,4.2,5.4),materials.coat,[0,2.1,0]));
  warehouse.add(mesh(gabledRoofGeometry(),materials.darkSteel,[0,4.18,0]));
  warehouse.children.at(-1).scale.set(7.7,1.15,5.8);
  warehouse.add(mesh(new THREE.BoxGeometry(3.7,2.5,.08),materials.darkSteel,[0,1.45,2.74]));
  for(const x of [-2.2,2.2])warehouse.add(mesh(new THREE.BoxGeometry(1.2,.9,.06),materials.glass,[x,2.75,2.72]));
  mergeStaticMeshes(warehouse);
  group.add(warehouse);
  const containerMaterial=new THREE.MeshPhysicalMaterial({color:0xffffff,vertexColors:false,roughness:.52,metalness:.28,clearcoat:.35,clearcoatRoughness:.3});
  const containers=new THREE.InstancedMesh(new THREE.BoxGeometry(2.7,1.15,1.2),containerMaterial,9);
  const containerDummy=new THREE.Object3D(),containerColors=[0x9f4f3e,0x4f7070,0x8f7643,0x41586b];
  for(let i=0;i<9;i++){
    const stack=Math.floor(i/3),lane=i%3;
    containerDummy.position.set(4.8+lane*2.95,1.76+stack*1.18,10.2+(lane%2)*.2);
    containerDummy.rotation.set(0,(lane%2?-.035:.025),0);containerDummy.scale.set(1,1,1);containerDummy.updateMatrix();
    containers.setMatrixAt(i,containerDummy.matrix);
    containers.setColorAt(i,new THREE.Color(containerColors[i%containerColors.length]));
  }
  containers.instanceMatrix.needsUpdate=containers.instanceColor.needsUpdate=true;
  group.add(containers);
  const bollards=new THREE.InstancedMesh(new THREE.CylinderGeometry(.1,.14,.5,9),materials.darkSteel,8);
  for(let i=0;i<8;i++){
    containerDummy.position.set(i%2?2.48:-2.48,1.37,5.6+Math.floor(i/2)*3);
    containerDummy.rotation.set(0,0,0);containerDummy.scale.setScalar(1);containerDummy.updateMatrix();bollards.setMatrixAt(i,containerDummy.matrix);
  }
  bollards.instanceMatrix.needsUpdate=true;group.add(bollards);
  const harborPeople=[
    ['worker',[-1.5,0,7],1.16],['worker',[1.4,0,10],1.1],['worker',[2.3,0,15],1.2],
    ['scientist',[-2.15,0,4.6],1.03],['scientist',[-1.1,0,5.8],.93],['diver',[2.1,0,17.2],.98],
    ['scientist',[-1.85,0,12.2],1.08],['worker',[2.05,0,13.5],1.12],
    ['worker',[1.55,0,16.5],1.28],['scientist',[-1.65,0,18.1],1.18],
  ];
  const detailedPeople=new Set([5]);
  for(const [index,[kind,position,scale]] of harborPeople.entries()) {
    if(detailedPeople.has(index)){
      const human=humanFigure(kind);const humanY=position[1]+1.15;human.position.set(position[0],humanY,position[2]);human.scale.setScalar(scale);
      mergeArticulatedHuman(human);
      human.userData.phase=animatables.humans.length*1.83+(kind==='scientist'?2.1:0);
      human.userData.pathOffset=position[2];
      human.userData.baseY=humanY;
      human.userData.faceCamera=position[2]>5;
      group.add(human);animatables.humans.push(human);
    }else{
      const y=position[1]+1.15;
      animatables.humans.push({
        crowd:true,kind,scale,phase:index*1.83,walkSpeed:.024+index*.001,
        userData:{kind},
        path:[{x:position[0]-.75,y,z:position[2]},{x:position[0]+.75,y,z:position[2]}],
      });
    }
  }
  const boat=createBoat({variant:'launch',withCrew:false,flagTexture:hinomaruTexture()});boat.position.set(8.8,.15,15.5);group.add(boat);animatables.boats.push(boat);
  const mast=new THREE.Group();mast.position.set(-5,1.1,8);
  mast.add(mesh(new THREE.CylinderGeometry(.1,.15,9,8),materials.steel,[0,4.5,0]));
  const searchlight=new THREE.Group();searchlight.position.set(0,9,0);
  const housing=mesh(new THREE.CylinderGeometry(.25,.38,.65,12),materials.darkSteel);housing.rotation.x=Math.PI/2;searchlight.add(housing);
  const lens=mesh(new THREE.SphereGeometry(.25,10,7),materials.warm,[0,0,-.34]);searchlight.add(lens);
  mast.add(searchlight);mergeStaticMeshes(mast,[searchlight]);group.add(mast);animatables.searchlight=searchlight;animatables.lights.push(lens);
  // 港湾旗杆上的日之丸旗——全作唯一一处明确的"这是日本"的符号。
  const harborFlag=createHinomaruFlag(hinomaruTexture(),{width:1.7,height:1.13,poleHeight:1.9});
  harborFlag.position.set(-5,8.1,8);
  harborFlag.traverse(node=>{node.userData.keepSeparate=true;});
  group.add(harborFlag);
  const lampPosts=[];
  for(const [x,z] of [[-2.5,6],[-2.5,13],[-2.5,20]]) {
    const post=new THREE.Group();post.position.set(x,1.1,z);
    post.add(mesh(new THREE.CylinderGeometry(.05,.07,3.6,7),materials.steel,[0,1.8,0]));
    const bulb=mesh(new THREE.SphereGeometry(.17,9,7),materials.warm,[0,3.6,0]);post.add(bulb);lampPosts.push(bulb);group.add(post);
  }
  animatables.lights.push(...lampPosts);
  animatables.crowd=createCrowdInstances(animatables.humans.filter(human=>human.crowd),group,'harbor-crowd');
  const protectedDynamic=[
    boat,searchlight,
    ...animatables.humans.filter(human=>!human.crowd),
    ...Object.values(animatables.crowd).filter(value=>value?.isObject3D),
  ];
  mergeStaticMeshes(group,protectedDynamic);
  group.userData.animatables=animatables;return group;
}

export function animateHumanSettlement(group,time,alert=0) {
  const data=group.userData.animatables;if(!data)return;
  for(const human of data.humans){
    if(human.crowd)continue;
    if(human.devoured){human.visible=false;continue;}
    const joints=human.userData.joints,phase=time*(human.userData.kind==='diver'?.7:1.25)+human.userData.phase;
    const stride=human.userData.kind==='scientist'?.34:.48;
    joints.leftLeg.rotation.x=Math.sin(phase)*stride;joints.rightLeg.rotation.x=-Math.sin(phase)*stride;
    joints.leftArm.rotation.x=-Math.sin(phase)*stride*.7;joints.rightArm.rotation.x=Math.sin(phase)*stride*.7;
    const path=human.userData.walkPath;
    if(path?.length>1){
      const progress=(time*(human.userData.walkSpeed||.055)+human.userData.phase*.037)%1,layer=progress*(path.length-1),index=Math.min(path.length-2,Math.floor(layer)),fraction=layer-index;
      const from=path[index],to=path[index+1];
      human.position.set(
        THREE.MathUtils.lerp(from.x,to.x,fraction),
        THREE.MathUtils.lerp(from.y,to.y,fraction)+(human.userData.kind==='diver'?Math.sin(time*.8+phase)*.11:Math.abs(Math.sin(phase))*.035),
        THREE.MathUtils.lerp(from.z,to.z,fraction),
      );
      const dx=to.x-from.x,dz=to.z-from.z;
      if(Math.hypot(dx,dz)>.001)human.rotation.y=Math.atan2(-dx,-dz);
    }else{
      human.position.y=(human.userData.baseY||0)+(human.userData.kind==='diver'?Math.sin(time*.8+phase)*.11:Math.abs(Math.sin(phase))*.035);
      human.rotation.y=human.userData.faceCamera?Math.PI+Math.sin(time*.15+phase)*.12:human.userData.kind==='worker'?Math.sin(time*.15+phase)*.18:human.userData.kind==='diver'?Math.PI*.7:0;
    }
  }
  if(data.crowd)animateCrowdLayer(data.crowd,data.crowd.people,time);
  for(const boat of data.boats){boat.rotation.z=Math.sin(time*.55+boat.userData.phase)*.025;boat.position.y=.15+Math.sin(time*.72)*.08;boat.userData.cabin.rotation.z=Math.sin(time*.9)*.035;}
  if(data.searchlight){data.searchlight.rotation.y=Math.sin(time*.24)*(.65+alert*.38);data.searchlight.rotation.x=-.18+Math.sin(time*.17)*.08;}
  for(let i=0;i<data.lights.length;i++)data.lights[i].material.emissiveIntensity=1.5+(i%3)*.35+Math.sin(time*1.5+i)*.2+alert*1.8;
}

function crowdTorsoGeometry() {
  const geometry=new THREE.CapsuleGeometry(.27,.68,4,10),position=geometry.attributes.position;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    const shoulder=THREE.MathUtils.smoothstep(y,-.05,.5);
    position.setXYZ(i,x*(.88+shoulder*.23),y,z*(.92+shoulder*.12));
  }
  geometry.computeVertexNormals();
  // 领口：脖子收进去，衣服不至于像根胶囊。
  const collar=new THREE.CylinderGeometry(.115,.155,.14,9);
  collar.translate(0,.44,0);
  return mergeGeometries([geometry.toNonIndexed(),collar.toNonIndexed()],false);
}

// 反光背心：只给现场作业的人穿，橘底两道银灰条。
function crowdVestGeometry() {
  const shell=new THREE.CylinderGeometry(.295,.305,.56,12,1,true);
  shell.translate(0,-.02,0);
  const bandA=new THREE.CylinderGeometry(.302,.302,.07,12,1,true);
  bandA.translate(0,.13,0);
  const bandB=new THREE.CylinderGeometry(.302,.302,.07,12,1,true);
  bandB.translate(0,-.1,0);
  return mergeGeometries([shell.toNonIndexed(),bandA.toNonIndexed(),bandB.toNonIndexed()],false);
}

// 随身包：肩上的小包，研究员和渔民随身带。
function crowdBagGeometry() {
  const body=new THREE.BoxGeometry(.26,.3,.13);
  const flap=new THREE.BoxGeometry(.27,.09,.15);
  flap.translate(0,.12,.005);
  const strap=new THREE.TorusGeometry(.19,.022,4,12,Math.PI);
  strap.rotateY(Math.PI/2);strap.rotateZ(.5);strap.translate(.02,.12,0);
  return mergeGeometries([body.toNonIndexed(),flap.toNonIndexed(),strap.toNonIndexed()],false);
}

function crowdHairGeometry() {
  const crown=new THREE.SphereGeometry(.218,10,7,0,TAU,0,Math.PI*.52);
  crown.scale(1,.7,1.04);crown.translate(0,.055,.015);
  const fringe=new THREE.BoxGeometry(.2,.06,.045);
  fringe.rotateX(.22);fringe.translate(0,.105,-.19);
  return mergeGeometries([crown.toNonIndexed(),fringe.toNonIndexed()],false);
}

function createCrowdInstances(people,group,prefix='crowd') {
  const count=people.length;
  const bodyMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.76});
  const headMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82});
  const hatMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.7});
  const clothMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8});
  const trouserMaterial=new THREE.MeshStandardMaterial({color:0x26363d,roughness:.9});
  const vestMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.66,side:THREE.DoubleSide});
  const bagMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.82});
  const instance=(geometry,material,name)=>{
    const mesh=new THREE.InstancedMesh(geometry,material,count);
    mesh.name=`${prefix}-${name}`;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;group.add(mesh);return mesh;
  };
  const armGeometry=new THREE.CapsuleGeometry(.072,.46,3,6);armGeometry.translate(0,-.27,0);
  const legGeometry=new THREE.CapsuleGeometry(.09,.64,3,6);legGeometry.translate(0,-.42,0);
  const crowd={
    body:instance(crowdTorsoGeometry(),bodyMaterial,'body'),
    head:instance(new THREE.SphereGeometry(.21,10,7),headMaterial,'head'),
    hat:instance(crowdHairGeometry(),hatMaterial,'hat'),
    vest:instance(crowdVestGeometry(),vestMaterial,'vest'),
    bag:instance(crowdBagGeometry(),bagMaterial,'bag'),
    leftArm:instance(armGeometry,clothMaterial,'left-arm'),
    rightArm:instance(armGeometry.clone(),clothMaterial,'right-arm'),
    leftLeg:instance(legGeometry,trouserMaterial,'left-leg'),
    rightLeg:instance(legGeometry.clone(),trouserMaterial,'right-leg'),
    dummy:new THREE.Object3D(),
  };
  crowd.people=people;
  const bodyColor=new THREE.Color(),skinColor=new THREE.Color(),hatColor=new THREE.Color();
  const vestColor=new THREE.Color(),bagColor=new THREE.Color();
  // 每个身份有自己的外形：工人的安全帽加反光背心，渔民戴宽檐帽，
  // 研究员背文件包，居民就是普通衣服。
  const LOOK={
    worker:{hat:[1.12,1.02,1.12],hatColor:0xe6b23f,vest:0xe8a021,bag:0},
    fisher:{hat:[1.85,.5,1.85],hatColor:0x3f4a44,vest:0,bag:0x6d7a55},
    scientist:{hat:[.9,.62,.9],hatColor:0x3b3a38,vest:0,bag:0x2f3b46},
    civilian:{hat:[1,1,1],hatColor:0x536a70,vest:0,bag:0},
  };
  for(let index=0;index<count;index++){
    const {kind}=people[index];
    const look=LOOK[kind]||LOOK.civilian;
    bodyColor.setHex(kind==='scientist'?0xe4e8e0:kind==='fisher'?0xb7653d:kind==='worker'?0xd69035:[0x7e9ca1,0x8a7f9c,0x6f8b84,0x9c8f74][index%4]);
    skinColor.setHex(index%4===0?0x765647:0xb98d72);
    hatColor.setHex(look.hatColor);
    vestColor.setHex(look.vest||0x000000);
    bagColor.setHex(look.bag||0x000000);
    crowd.body.setColorAt(index,bodyColor);crowd.head.setColorAt(index,skinColor);crowd.hat.setColorAt(index,hatColor);
    crowd.leftArm.setColorAt(index,bodyColor);crowd.rightArm.setColorAt(index,bodyColor);
    crowd.vest.setColorAt(index,vestColor);crowd.bag.setColorAt(index,bagColor);
    people[index].look=look;
  }
  for(const key of ['body','head','hat','leftArm','rightArm','vest','bag'])crowd[key].instanceColor.needsUpdate=true;
  return crowd;
}

export function createIslandPopulation(groundAt) {
  // Distant residents share seven instanced meshes while retaining separate
  // gait phases and routes, keeping the street alive without hundreds of draws.
  const group=new THREE.Group();group.name='gray-island-street-population';
  const animatables={humans:[],boats:[],lights:[],searchlight:null};
  const sites=[
    ['civilian',5,101,'z',8,.88],['fisher',-4.5,108,'x',5,1],
    ['worker',12,91,'z',7,.94],['civilian',19,87,'x',7,.9],
    ['scientist',26,75,'z',6,.9],['worker',-13,83,'x',8,.95],
    ['civilian',32,64,'z',8,.82],['fisher',39,58,'x',5,.9],
    ['worker',-27,67,'z',7,.95],['civilian',-36,53,'x',6,.86],
    ['scientist',22,39,'z',6,.88],['worker',29,32,'x',5,.92],
    ['civilian',36,19,'z',9,.8],['fisher',18,105,'z',6,.92],
    ['worker',-8,94,'x',7,.9],['civilian',45,49,'z',6,.84],
    ['scientist',-18,35,'x',7,.9],['worker',-39,29,'z',6,.9],
    ['civilian',-48,42,'x',5,.82],['fisher',8,115,'x',5,.9],
  ];
  for(const [kind,x,z,axis,span,scale] of sites) {
    const start=groundAt(x,z);if(start===null)continue;
    const path=[];
    for(let index=-2;index<=2;index++) {
      const offset=index/2*span*.5,px=axis==='x'?x+offset:x,pz=axis==='z'?z+offset:z,ground=groundAt(px,pz);
      if(ground!==null)path.push({x:px,y:ground,z:pz});
    }
    if(path.length<2)continue;
    animatables.humans.push({
      crowd:true,kind,scale,path,
      userData:{kind},
      phase:animatables.humans.length*1.73,
      walkSpeed:.036+animatables.humans.length*.0021,
    });
  }
  animatables.crowd=createCrowdInstances(animatables.humans,group,'street-crowd');
  group.userData.animatables=animatables;
  return group;
}

const LOOK_FALLBACK=Object.freeze({hat:[1,1,1],hatColor:0x536a70,vest:0,bag:0});

function animateCrowdLayer(crowd,people,time){
  const {dummy}=crowd;
  for(let index=0;index<people.length;index++){
    const person=people[index],path=person.path,progress=(time*person.walkSpeed+person.phase*.037)%1;
    if(person.devoured){
      dummy.position.set(0,-999,0);dummy.rotation.set(0,0,0);dummy.scale.setScalar(0);dummy.updateMatrix();
      for(const mesh of [crowd.body,crowd.head,crowd.hat,crowd.vest,crowd.bag,crowd.leftArm,crowd.rightArm,crowd.leftLeg,crowd.rightLeg])mesh.setMatrixAt(index,dummy.matrix);
      continue;
    }
    const layer=progress*(path.length-1),pathIndex=Math.min(path.length-2,Math.floor(layer)),fraction=layer-pathIndex;
    const from=path[pathIndex],to=path[pathIndex+1],stridePhase=time*2.7+person.phase;
    const x=THREE.MathUtils.lerp(from.x,to.x,fraction),z=THREE.MathUtils.lerp(from.z,to.z,fraction),ground=THREE.MathUtils.lerp(from.y,to.y,fraction);
    const yaw=Math.hypot(to.x-from.x,to.z-from.z)>.001?Math.atan2(-(to.x-from.x),-(to.z-from.z)):0;
    const scale=person.scale,swing=Math.sin(stridePhase)*.44;
    const put=(mesh,y,offsetX=0,offsetY=0,offsetZ=0,rotationX=0,scaleX=scale,scaleY=scale,scaleZ=scale)=>{
      dummy.position.set(x+Math.cos(yaw)*offsetX-Math.sin(yaw)*offsetZ,y+offsetY,z-Math.sin(yaw)*offsetX-Math.cos(yaw)*offsetZ);
      dummy.rotation.set(rotationX,yaw,0,'YXZ');dummy.scale.set(scaleX,scaleY,scaleZ);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
    };
    const look=person.look||LOOK_FALLBACK;
    put(crowd.body,ground+1.42*scale);
    put(crowd.head,ground+2.24*scale);
    put(crowd.hat,ground+2.43*scale,0,0,0,0,scale*look.hat[0],scale*look.hat[1],scale*look.hat[2]);
    // 背心与包：不该有的人直接缩成零，不占画面。
    put(crowd.vest,ground+1.42*scale,0,0,0,0,look.vest?scale:0,look.vest?scale:0,look.vest?scale:0);
    put(crowd.bag,ground+1.62*scale,-.26*scale,0,-.16*scale,0,look.bag?scale:0,look.bag?scale:0,look.bag?scale:0);
    put(crowd.leftArm,ground+1.84*scale,-.27*scale,0,0,swing*.7,.95,.92,.95);
    put(crowd.rightArm,ground+1.84*scale,.27*scale,0,0,-swing*.7,.95,.92,.95);
    put(crowd.leftLeg,ground+.84*scale,-.12*scale,0,0,-swing,.9,1,.9);
    put(crowd.rightLeg,ground+.84*scale,.12*scale,0,0,swing,.9,1,.9);
  }
  for(const mesh of [crowd.body,crowd.head,crowd.hat,crowd.vest,crowd.bag,crowd.leftArm,crowd.rightArm,crowd.leftLeg,crowd.rightLeg])mesh.instanceMatrix.needsUpdate=true;
}

function nearestHumanEntry(group,point) {
  const data=group?.userData?.animatables;
  if(!data)return null;
  group.updateWorldMatrix(true,true);
  const local=group.worldToLocal(new THREE.Vector3(point.x,point.y,point.z));
  let best=null;
  for(const human of data.humans) {
    if(human.devoured)continue;
    if(human.crowd) {
      const path=human.path;
      if(!Array.isArray(path)||!path.length)continue;
      const midpoint=path[Math.floor(path.length*.5)];
      const distance=Math.hypot(local.x-midpoint.x,local.y-midpoint.y,local.z-midpoint.z);
      if(!best||distance<best.distance)best={distance,human};
    } else {
      const distance=human.position.distanceTo(local);
      if(!best||distance<best.distance)best={distance,human};
    }
  }
  return best;
}

export function nearestHumanDistance(group,point) {
  return nearestHumanEntry(group,point)?.distance??Infinity;
}

export function consumeNearestHuman(group,point) {
  const nearest=nearestHumanEntry(group,point);
  if(!nearest)return false;
  nearest.human.devoured=true;
  if(!nearest.human.crowd)nearest.human.visible=false;
  return true;
}

export function createDiverEntityModel(entity={}) {
  const root=new THREE.Group();root.name='human-research-diver';
  const diver=humanFigure('diver');diver.scale.setScalar(1.35);diver.rotation.order='YXZ';
  mergeArticulatedHuman(diver);
  diver.rotation.x=-Math.PI*.5;diver.position.y=.18;root.add(diver);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.74,.025,6,24),materials.cyan);
  halo.rotation.x=Math.PI/2;halo.rotation.z=.08;halo.position.set(0,.55,-.9);root.add(halo);
  const lamp=mesh(new THREE.SphereGeometry(.11,9,7),materials.warm,[.47,.58,-2.25]);root.add(lamp);
  const surfaceHalo=new THREE.Mesh(new THREE.RingGeometry(.9,1.25,24),new THREE.MeshBasicMaterial({color:0x83d9c4,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));
  surfaceHalo.rotation.x=-Math.PI/2;surfaceHalo.position.y=-.62;root.add(surfaceHalo);
  root.userData={humanDiver:true,diver,lamp,halo,surfaceHalo,seed:entity.seed||0};return root;
}

export function animateDiverEntityModel(group,time,speed=0) {
  const data=group.userData,diver=data.diver,joints=diver.userData.joints,phase=time*(1.1+speed*.12)+data.seed;
  joints.leftLeg.rotation.x=Math.sin(phase)*.38;joints.rightLeg.rotation.x=-Math.sin(phase)*.38;
  joints.leftArm.rotation.x=-Math.sin(phase)*.2;joints.rightArm.rotation.x=Math.sin(phase)*.2;
  diver.rotation.x=-Math.PI*.5+Math.sin(time*.7+data.seed)*.055;
  diver.position.y=.18+Math.sin(time*.9+data.seed)*.08;
  data.halo.rotation.z=time*.4;data.halo.material.emissiveIntensity=1.6+Math.sin(time*1.5)*.35;
  data.surfaceHalo.scale.setScalar(1+Math.sin(time*.8)*.1);data.surfaceHalo.material.opacity=.12+Math.sin(time*.8)*.035;
}

function parasiteNodeParts(siteId) {
  const root=new THREE.Group(),pulse=[],base=materials.darkSteel,accent=siteId==='relay'?materials.alarm:materials.cyan;
  root.add(mesh(new THREE.CylinderGeometry(1.25,1.65,.6,10),base,[0,-.5,0]));
  if(siteId==='harbor') {
    root.add(mesh(new THREE.CylinderGeometry(1.05,.85,2.15,12),materials.steel,[0,.55,0]));
    for(const side of [-1,1]){const ring=mesh(new THREE.TorusGeometry(.62,.09,7,18),accent,[side*.48,.45,0]);root.add(ring);pulse.push(ring);}
  } else if(siteId==='laboratory') {
    root.add(mesh(new THREE.CylinderGeometry(1.45,1.15,1.2,12),base,[0,.4,0]));
    const dome=new THREE.Mesh(new THREE.SphereGeometry(1.12,18,10,0,TAU,0,Math.PI*.62),materials.glass);dome.position.y=1.3;root.add(dome);
    const core=mesh(new THREE.SphereGeometry(.3,12,8),accent,[0,1.05,0]);root.add(core);pulse.push(core);
  } else {
    root.add(mesh(new THREE.CylinderGeometry(.18,.32,4.4,8),base,[0,1.65,0]));
    for(let i=0;i<3;i++){const ring=mesh(new THREE.TorusGeometry(.65+i*.23,.06,6,22),accent,[0,1.35+i*.75,0]);ring.rotation.x=Math.PI/2;root.add(ring);pulse.push(ring);}
  }
  for(let i=0;i<4;i++) {
    const a=i/4*TAU+Math.PI/4;
    const cable=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a)*.8,-.55,Math.sin(a)*.8),
      new THREE.Vector3(Math.cos(a)*1.3,-1.5,Math.sin(a)*1.3),
      new THREE.Vector3(Math.cos(a)*1.8,-1.7,Math.sin(a)*1.8),
    ]),8,.035,5,false),materials.rubber);root.add(cable);
  }
  root.userData={pulseMaterials:pulse.map(part=>part.material),siteId};return root;
}

export function createParasiteNodeModel(entity={}) {
  const siteId=entity.siteId||'harbor',root=parasiteNodeParts(siteId);
  root.name=`parasite-node-${siteId}`;root.userData.siteId=siteId;
  const disabled=Boolean(entity.disabled);
  root.traverse(child=>{
    if(!child.isMesh||!child.material?.emissive)return;
    child.material=child.material.clone();
    if(disabled){child.material.emissive.setHex(0x3bcfbd);child.material.emissiveIntensity=.45;}
  });
  root.userData.disabled=disabled;return root;
}

export function animateParasiteNodeModel(group,time,entity={}) {
  const disabled=Boolean(entity.disabled),pulse=disabled?.35:.8+Math.sin(time*1.9)*.22;
  if(group.userData.disabled!==disabled){
    group.userData.disabled=disabled;
    group.traverse(child=>{if(child.isMesh&&child.material?.emissive&&child.material.emissive.getHex()>0){child.material.emissive.setHex(disabled?0x3bcfbd:0x58e7cd);child.material.emissiveIntensity=pulse;}});
  }
  group.traverse(child=>{if(child.isMesh&&child.material?.emissive&&child.material.emissive.getHex()>0)child.material.emissiveIntensity=pulse;});
  group.rotation.y=Math.sin(time*.22+(entity.seed||0))*.055;
}

