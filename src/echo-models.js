import * as THREE from '../node_modules/three/build/three.module.js';

const TAU=Math.PI*2;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

const materials={
  armor:new THREE.MeshStandardMaterial({color:0x849b95,emissive:0x10211f,emissiveIntensity:.28,roughness:.54,metalness:.16}),
  chitin:new THREE.MeshPhysicalMaterial({color:0xb48970,emissive:0x291b13,emissiveIntensity:.16,roughness:.46,metalness:.08,clearcoat:.42,clearcoatRoughness:.38}),
  membrane:new THREE.MeshPhysicalMaterial({color:0x779b91,roughness:.35,metalness:0,transmission:.1,transparent:true,opacity:.72,side:THREE.DoubleSide,depthWrite:false}),
  dark:new THREE.MeshStandardMaterial({color:0x25312f,roughness:.78,metalness:.14}),
  eye:new THREE.MeshStandardMaterial({color:0x23120e,emissive:0xe45e3f,emissiveIntensity:1.2,roughness:.28}),
  lure:new THREE.MeshStandardMaterial({color:0x181713,emissive:0xe8b76b,emissiveIntensity:2.1,roughness:.3}),
  pulse:new THREE.MeshBasicMaterial({color:0xe8b76b,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}),
};

function mesh(geometry,material,position=[0,0,0]){
  const result=new THREE.Mesh(geometry,material);
  result.position.set(...position);
  return result;
}

function customGeometry(vertices,indices){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flat(),3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function wormBodyGeometry(){
  const rings=[],sides=18;
  for(let ring=0;ring<=20;ring++){
    const t=ring/20;
    const radius=.16+Math.sin(t*Math.PI)*.54;
    const centerZ=-2.2+t*4.8;
    const centerY=Math.sin(t*Math.PI*2.1)*.32;
    for(let side=0;side<sides;side++){
      const angle=side/sides*TAU;
      rings.push([
        Math.cos(angle)*radius*1.08,
        centerY+Math.sin(angle)*radius*.82,
        centerZ,
      ]);
    }
  }
  const indices=[];
  for(let ring=0;ring<20;ring++)for(let side=0;side<sides;side++){
    const next=(side+1)%sides,a=ring*sides+side,b=ring*sides+next,c=(ring+1)*sides+side,d=(ring+1)*sides+next;
    indices.push(a,c,b,b,c,d);
  }
  return customGeometry(rings,indices);
}

function hullGeometry(){
  const profile=[
    [0,.82,0,.12],
    [-.34,.58,.03,.23],
    [-1.05,.4,.12,.42],
    [-1.7,.27,.08,.3],
    [-2.15,.13,0,.1],
    [-2.5,0,0,0],
  ];
  const sides=14,vertices=[],indices=[];
  for(const [z,rx,y,ry] of profile){
    for(let side=0;side<sides;side++){
      const angle=side/sides*TAU;
      vertices.push(Math.cos(angle)*rx,y+Math.sin(angle)*ry,z);
    }
  }
  for(let ring=0;ring<profile.length-1;ring++){
    for(let side=0;side<sides;side++){
      const next=(side+1)%sides,a=ring*sides+side,b=ring*sides+next,c=(ring+1)*sides+side,d=(ring+1)*sides+next;
      indices.push(a,c,b,b,c,d);
    }
  }
  return customGeometry(vertices,indices);
}

function finGeometry(span,length,angle=0){
  const geometry=customGeometry([
    [0,0,.25],[0,0,-.1],[span,0,length],[0,.055,length*.42],
  ],[0,1,2,0,2,3,0,3,1,1,3,2]);
  geometry.rotateY(angle);
  return geometry;
}

function createShardHunter(){
  const root=new THREE.Group();root.name='echo-shard-hunter';
  const body=mesh(hullGeometry(),materials.armor);root.add(body);
  const belly=mesh(new THREE.SphereGeometry(1,18,12),materials.membrane,[0,-.18,-.78]);
  belly.scale.set(.55,.34,1.35);root.add(belly);
  const jaw=mesh(new THREE.ConeGeometry(.48,.9,8,1,true),materials.dark,[0,-.14,-2.08]);
  jaw.rotation.x=-Math.PI*.5;jaw.scale.z=.56;root.add(jaw);
  const eyeL=mesh(new THREE.SphereGeometry(.08,9,6),materials.eye,[-.34,.08,-1.58]);
  const eyeR=eyeL.clone();eyeR.position.x=.34;root.add(eyeL,eyeR);
  const fins=[];
  for(const side of [-1,1]){
    const pectoral=mesh(finGeometry(1.25,1.15,side*2.35),materials.membrane,[side*.36,-.05,-.74]);
    pectoral.rotation.z=side*.2;root.add(pectoral);fins.push(pectoral);
    for(let index=0;index<4;index++){
      const plate=mesh(new THREE.BoxGeometry(.13,.18,.72),materials.chitin,[side*(.36+index*.02),.35-index*.08,-.25-index*.42]);
      plate.rotation.z=side*(.12+index*.04);plate.rotation.x=-.1-index*.035;root.add(plate);
    }
  }
  const dorsal=mesh(finGeometry(.82,1.3,Math.PI),materials.chitin,[0,.52,-.45]);dorsal.rotation.z=-.12;root.add(dorsal);
  const tail=mesh(finGeometry(1.1,1.7,Math.PI),materials.membrane,[0,0,-2.28]);tail.rotation.z=.18;root.add(tail);
  const aura=mesh(new THREE.TorusGeometry(1.55,.035,6,40),materials.pulse,[0,0,.2]);
  aura.rotation.x=Math.PI/2;root.add(aura);
  root.userData={echo:true,echoKind:'shardHunter',body,fins,tail,jaw,aura,pulseMaterials:[materials.pulse,materials.eye]};
  return root;
}

function createLureColony(){
  const root=new THREE.Group();root.name='echo-lure-colony';
  const bell=mesh(new THREE.SphereGeometry(1.35,24,14,0,TAU,0,Math.PI*.62),materials.membrane);
  bell.scale.set(1,.72,1);root.add(bell);
  const mantle=mesh(new THREE.ConeGeometry(1.05,1.65,18,4,true),materials.chitin,[0,-.38,0]);
  mantle.rotation.x=Math.PI;root.add(mantle);
  const tendrils=[];
  for(let index=0;index<9;index++){
    const angle=index/9*TAU;
    const curve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(angle)*.9,-.35,Math.sin(angle)*.9),
      new THREE.Vector3(Math.cos(angle)*1.18,-1.25,Math.sin(angle)*1.18),
      new THREE.Vector3(Math.cos(angle)*.78,-2.45,Math.sin(angle)*.78),
      new THREE.Vector3(Math.cos(angle)*1.35,-3.2,Math.sin(angle)*1.35),
    ]);
    const tendril=mesh(new THREE.TubeGeometry(curve,14,.055,5,false),index%3===0?materials.chitin:materials.membrane);
    root.add(tendril);tendrils.push(tendril);
  }
  const core=mesh(new THREE.SphereGeometry(.34,16,10),materials.eye,[0,-.28,0]);root.add(core);
  const lures=[];
  for(let index=0;index<3;index++){
    const stalk=mesh(new THREE.CylinderGeometry(.018,.035,1.55,5),materials.dark);
    stalk.position.set(Math.cos(index/3*TAU)*.38,.72,Math.sin(index/3*TAU)*.38);
    stalk.rotation.z=Math.cos(index/3*TAU)*.2;root.add(stalk);
    const bulb=mesh(new THREE.SphereGeometry(.13,12,8),materials.lure,[0,1.48,0]);stalk.add(bulb);lures.push(bulb);
  }
  const aura=mesh(new THREE.RingGeometry(1.55,1.64,48),materials.pulse,[0,-2.2,0]);
  aura.rotation.x=-Math.PI/2;root.add(aura);
  root.userData={echo:true,echoKind:'lureColony',body:bell,tendrils,lures,core,aura,pulseMaterials:[materials.lure,materials.eye]};
  return root;
}

function createPressureWorm(){
  const root=new THREE.Group();root.name='echo-pressure-worm';
  const body=mesh(wormBodyGeometry(),materials.membrane);root.add(body);
  const rings=[];
  for(let index=0;index<8;index++){
    const t=index/7,centerZ=-1.95+t*4.3;
    const ring=mesh(new THREE.TorusGeometry(.24+Math.sin(t*Math.PI)*.48,.045,6,24),materials.chitin,[0,Math.sin(t*Math.PI*2.1)*.32,centerZ]);
    ring.scale.set(1.08,.82,1);root.add(ring);rings.push(ring);
  }
  const head=mesh(new THREE.DodecahedronGeometry(.9,1),materials.armor,[0,.08,2.65]);root.add(head);
  const maw=mesh(new THREE.ConeGeometry(.55,1.15,9,1,true),materials.dark,[0,.03,3.28]);
  maw.rotation.x=Math.PI*.5;root.add(maw);
  for(const side of [-1,1]){
    const eye=mesh(new THREE.SphereGeometry(.11,10,7),materials.eye,[side*.35,.2,2.88]);root.add(eye);
    for(let index=0;index<4;index++){
      const crest=mesh(finGeometry(.38,.66,side*1.85),materials.chitin,[side*.22,.48+index*.03,-.55+index*1.15]);
      crest.rotation.z=side*.12;root.add(crest);
    }
  }
  const aura=mesh(new THREE.TorusGeometry(1.15,.04,6,36),materials.pulse,[0,0,2.55]);aura.rotation.x=Math.PI/2;root.add(aura);
  root.userData={echo:true,echoKind:'pressureWorm',body,rings,maw,head,aura,pulseMaterials:[materials.pulse,materials.eye]};
  return root;
}

export function createAberrantEchoModel(entity={}){
  const kind=entity.echoKind||entity.kind||'shardHunter';
  const group=kind==='lureColony'?createLureColony():kind==='pressureWorm'?createPressureWorm():createShardHunter();
  group.userData.seed=entity.seed||0;
  group.userData.phase=entity.phase||'stalk';
  group.scale.setScalar(entity.radius?clamp(entity.radius*.62,.75,2):1);
  group.traverse(node=>{
    if(node.isMesh&&!node.material?.transparent)node.receiveShadow=true;
  });
  const body=group.userData.body;
  for(const part of Array.isArray(body)?body:[body])if(part)part.castShadow=true;
  if(group.userData.head)group.userData.head.castShadow=true;
  return group;
}

export function animateAberrantEchoModel(group,time,speed=0,state={}){
  if(!group)return;
  const data=group.userData,phase=state.phase||data.phase||'stalk';
  data.phase=phase;
  const movement=clamp(speed/7,0,1),clock=time+data.seed;
  const accent=phase==='charge'?2.8:phase==='exposed'?.65:1.25;
  for(const material of data.pulseMaterials||[])if(material?.emissive)material.emissiveIntensity=accent+Math.sin(clock*3.1)*.22;
  if(data.aura){
    const scale=phase==='charge'?1+Math.sin(clock*8)*.22+.55:phase==='exposed'?1.35:1;
    data.aura.scale.setScalar(scale);
    data.aura.material.opacity=phase==='charge'?.34:phase==='exposed'?.25:.1;
  }
  if(data.echoKind==='shardHunter'){
    data.tail.rotation.y=Math.sin(clock*(2.4+movement*3.2))*.42;
    data.jaw.rotation.x=-Math.PI*.5+(phase==='charge'?.28:phase==='exposed'?-0.22:0);
    for(const [index,fin] of data.fins.entries())fin.rotation.y=Math.sin(clock*1.8+index*Math.PI)*.12;
  } else if(data.echoKind==='lureColony'){
    const pulse=1+Math.sin(clock*(1.7+movement))* .08;
    data.body.scale.set(pulse,2-pulse,pulse);
    for(const [index,tendril] of data.tendrils.entries()){
      tendril.rotation.x=Math.sin(clock*.77+index*.63)*.08;
      tendril.rotation.z=Math.cos(clock*.68+index*.51)*.07;
    }
    for(const [index,lure] of data.lures.entries())lure.position.x=Math.sin(clock*.8+index*TAU/3)*.18;
  } else if(data.echoKind==='pressureWorm'){
    data.body.rotation.y=Math.sin(clock*(.75+movement*.55))*.025;
    for(const [index,ring] of data.rings.entries())ring.rotation.z=Math.sin(clock*.8-index*.2)*.04;
    data.head.rotation.z=Math.sin(clock*.7)*.08;
    data.maw.rotation.z=Math.sin(clock*1.4)*.12;
  }
  group.rotation.z=Math.sin(clock*.56)*.025;
}
