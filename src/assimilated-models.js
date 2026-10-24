import * as THREE from '../node_modules/three/build/three.module.js';
import { continuousBody } from './marine-models.js';

const TAU=Math.PI*2;
const rank=(player,key)=>Math.max(0,Math.min(2,Number(player.assimilations?.[key])||0));

// Every component is authored here in local body coordinates. The renderer is
// responsible for applying the player's physical size and hiding first-person
// anatomy. No textures, downloaded models or external art licences are needed.
function colored(geometry,hex) {
  const color=new THREE.Color(hex),values=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<values.length;i+=3){values[i]=color.r;values[i+1]=color.g;values[i+2]=color.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(values,3));return geometry;
}

function blob(scale,position,color,segments=14) {
  const part=new THREE.Mesh(colored(new THREE.SphereGeometry(1,segments,10),color));
  part.scale.set(...scale);part.position.set(...position);return part;
}

function tissue(points,radius,color,segments=24,taper=.8) {
  const path=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)));
  const geometry=new THREE.TubeGeometry(path,segments,radius,7,false),position=geometry.attributes.position;
  for(let i=0;i<position.count;i++) {
    const t=Math.floor(i/8)/segments,center=path.getPointAt(t),width=1-t*taper;
    position.setXYZ(i,center.x+(position.getX(i)-center.x)*width,center.y+(position.getY(i)-center.y)*width,center.z+(position.getZ(i)-center.z)*width);
  }
  geometry.computeVertexNormals();return new THREE.Mesh(colored(geometry,color));
}

function fin(points,color,thickness=.05) {
  const shape=new THREE.Shape();shape.moveTo(points[0][0],points[0][2]);
  for(let i=1;i<points.length;i++)shape.lineTo(points[i][0],points[i][2]);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:true,bevelThickness:thickness*.35,bevelSize:thickness*.4,bevelSegments:2,steps:1});
  const position=geometry.attributes.position;
  for(let i=0;i<position.count;i++) {const x=position.getX(i),z=position.getY(i),y=position.getZ(i)-thickness*.5;position.setXYZ(i,x,y+points[0][1],z);}
  geometry.computeVertexNormals();return new THREE.Mesh(colored(geometry,color));
}

function merged(parts,material,name) {
  const positions=[],normals=[],colors=[];
  for(const part of parts) {
    part.updateMatrix();const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();geometry.applyMatrix4(part.matrix);
    const p=geometry.attributes.position,n=geometry.attributes.normal,c=geometry.attributes.color;
    for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(c?.getX(i)??1,c?.getY(i)??1,c?.getZ(i)??1);}
    geometry.dispose();part.geometry.dispose();part.material?.dispose();
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;return mesh;
}

function organicMaterial(color=0xffffff,{roughness=.7,emissive=0,emissiveIntensity=0}={}) {
  const material=new THREE.MeshStandardMaterial({color,vertexColors:true,roughness,metalness:.01,side:THREE.DoubleSide,emissive,emissiveIntensity});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 organSurface;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n organSurface=position;');
    shader.fragmentShader='varying vec3 organSurface;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float pores=sin(organSurface.x*139.+sin(organSurface.z*91.))*sin(organSurface.y*113.+organSurface.z*57.);
      diffuseColor.rgb*=.97+pores*.035;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=clamp(roughnessFactor+pores*.07,.4,.95);');
  };
  material.customProgramCacheKey=()=> 'assimilated-organ-skin-v1';return material;
}

function openSiphon(side,level) {
  const geometry=new THREE.CylinderGeometry(.11+level*.015,.2, .55,18,1,true);
  geometry.rotateX(Math.PI/2);geometry.translate(side*.67,-.18,.68);
  return new THREE.Mesh(colored(geometry,0x718c7f));
}

export function createAssimilatedOrgans(player,bodyPlan=4) {
  const group=new THREE.Group();group.name='assimilated-organs';
  group.userData.ranks=Object.fromEntries(['lureLamp','pressure','jet','carapace','electroreception'].map(key=>[key,rank(player,key)]));
  const levels=group.userData.ranks,skin=organicMaterial();
  // The original larval body has the same forward axis but a thinner shoulder.
  const bodyWidth=bodyPlan<=2?1.05:bodyPlan===3?.83:1;
  if(levels.lureLamp) {
    const level=levels.lureLamp,lamp=new THREE.Group();lamp.name='assimilated-lure-lamp';
    const parts=[tissue([[0,.49,-1.1],[.03,1.13,-1.23],[.04,1.6,-1.72],[.025,1.48,-2.14]],.062,0x799b8c,36,.65),blob([.12,.11,.17],[0,.5,-1.1],0x6d8979)];
    lamp.add(merged(parts,skin,'fleshy-lure-stalk'));
    const bulb=new THREE.Mesh(new THREE.SphereGeometry(.11+level*.024,20,14),new THREE.MeshStandardMaterial({color:0xb7ebce,emissive:0x83dccc,emissiveIntensity:2.1,roughness:.46}));
    bulb.name='lure-light-organ';bulb.position.set(.025,1.48,-2.14);bulb.scale.y=.83;lamp.add(bulb);
    group.add(lamp);group.userData.lamp=lamp;group.userData.bulb=bulb;
  }
  if(levels.pressure) {
    const parts=[],level=levels.pressure;
    for(const side of [-1,1])for(let i=0;i<4+level;i++) {
      const z=-.58+i*.22;
      parts.push(tissue([[side*.55,.16,z],[side*.75,.09,z+.035],[side*.78,-.17,z+.075],[side*.61,-.31,z+.12]],.047,0x677f73,18,.3));
      for(let n=0;n<3;n++)parts.push(tissue([[side*.7,.09-n*.1,z],[side*(.88+level*.04),.035-n*.1,z+.1],[side*.85,-.005-n*.1,z+.15]],.018,0x9eaa8b,12,.8));
    }
    const gills=merged(parts,organicMaterial(0xffffff,{roughness:.78}),'lamellar-pressure-gills');group.add(gills);group.userData.gills=gills;
  }
  if(levels.jet) {
    const parts=[];
    for(const side of [-1,1]) {
      parts.push(blob([.21,.2,.41],[side*.64,-.16,.36],0x69877d));parts.push(openSiphon(side,levels.jet));
      const rim=new THREE.Mesh(colored(new THREE.TorusGeometry(.125+levels.jet*.013,.027,7,18),0x9eafa0));rim.position.set(side*.67,-.18,.955);parts.push(rim);
    }
    const jets=merged(parts,skin,'paired-jet-siphons');group.add(jets);group.userData.jets=jets;
  }
  if(levels.carapace) {
    const parts=[];
    for(let i=0;i<5+levels.carapace;i++) {
      const z=-.95+i*.32,width=.48-Math.max(0,z)*.14,y=.55-Math.max(0,z)*.12;
      parts.push(fin([[-width,y,z-.12],[-width*.75,y,z+.19],[0,y+.04,z+.28],[width*.75,y,z+.19],[width,y,z-.12],[0,y,z-.25]],i%2?0x687f75:0x7c8b77,.065));
      if(i<4)parts.push(tissue([[0,y+.02,z],[0,y+.16,z+.08],[0,y+.28,z+.22]],.075,0xa6ad91,16,.92));
    }
    group.add(merged(parts,organicMaterial(0xffffff,{roughness:.84}),'overlapping-dorsal-carapace'));
  }
  if(levels.electroreception) {
    const channels=[],nodes=[];
    for(const side of [-1,1]) {
      channels.push(tissue([[side*.46,.1,-1.4],[side*.64,.09,-.8],[side*.64,.07,.1],[side*.48,.02,.99]],.012,0x889f8e,36,0));
      for(let i=0;i<13;i++) {
        const z=-1.35+i*.18,x=.64-Math.max(0,-z-.7)*.24-Math.max(0,z-.2)*.19;
        nodes.push(blob([.014,.022,.025],[side*x,.09-Math.max(0,z)*.07,z],0xb2cdb1,8));
      }
    }
    group.add(merged(channels,skin,'sensory-lateral-channels'));
    const sensors=merged(nodes,organicMaterial(0xffffff,{roughness:.5,emissive:0x3d7a71,emissiveIntensity:.7}),'electroreceptor-pores');group.add(sensors);group.userData.sensors=sensors;
  }
  group.scale.x=bodyWidth;
  if(!group.children.length)skin.dispose();
  return group;
}

export function animateAssimilatedOrgans(group,time,player) {
  const data=group.userData,speed=Math.hypot(player.vx||0,player.vy||0,player.vz||0);
  if(data.lamp){data.lamp.rotation.x=Math.sin(time*1.1)*.035;data.lamp.rotation.z=Math.sin(time*.8)*.055;data.bulb.material.emissiveIntensity=1.8+Math.sin(time*1.4)*.25;}
  if(data.gills)data.gills.scale.x=1+Math.sin(time*(2.2+speed*.06))*.025;
  if(data.jets){data.jets.scale.z=1+Math.sin(time*(3+speed*.12))*.025;data.jets.scale.y=1+Math.sin(time*(3+speed*.12)+1)*.035;}
  if(data.sensors)data.sensors.material.emissiveIntensity=.5+Math.sin(time*2.3)*.15;
}

export function createApexBody(player={}) {
  const group=new THREE.Group();group.name='apex-abyssal-body';group.userData.bodyPlan=5;group.userData.originalProceduralAsset=true;
  const profile=[[-2.03,0,0,-.05],[-1.91,.15,.17,-.05],[-1.72,.43,.36,.01],[-1.43,.57,.49,.025],[-1.06,.64,.53,.01],[-.55,.63,.51,.01],[0,.54,.43,0],[.6,.35,.29,-.025],[1.15,.19,.18,-.015],[1.65,.09,.1,0],[2.08,.035,.06,.015],[2.25,0,0,.02]];
  const body=new THREE.Mesh(continuousBody(profile,0x526d6d,0xa9b2a0,{rows:108,sides:36,pattern:2}));
  const details=[];
  for(const side of [-1,1]) {
    details.push(tissue([[side*.14,-.17,-1.95],[side*.4,-.29,-1.71],[side*.47,-.24,-1.37]],.031,0x253b3a,30,.1));
    details.push(tissue([[side*.17,.05,-1.89],[side*.41,.23,-1.62],[side*.48,.34,-1.28]],.044,0x748b7b,30,.4));
    // Skin ridges and gill incisions continue the body rather than floating.
    for(let i=0;i<5;i++)details.push(tissue([[side*(.57-i*.015),.22,-.75+i*.18],[side*(.64-i*.018),-.02,-.7+i*.18],[side*(.55-i*.017),-.27,-.66+i*.18]],.012,0x334e4b,18,.1));
    for(let i=0;i<7;i++)details.push(tissue([[side*(.51-i*.034),.29-i*.025,-.1+i*.23],[side*(.57-i*.034),.25-i*.026,.06+i*.23],[side*(.5-i*.034),.21-i*.026,.19+i*.23]],.026,0x7f9380,16,.5));
    details.push(blob([.035,.079,.095],[side*.505,.19,-1.47],0xc1d4ac));
    details.push(blob([.018,.058,.032],[side*.532,.19,-1.49],0x142c2c));
    for(let i=0;i<6;i++)details.push(tissue([[side*(.17+i*.035),-.19-i*.009,-1.92+i*.059],[side*(.165+i*.035),-.09-i*.009,-1.89+i*.059]],.018,0xc5c6a8,8,.92));
  }
  const material=organicMaterial(0xffffff,{roughness:.7}),timeUniform={value:0},speedUniform={value:0};
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    previous(shader);shader.uniforms.apexTime=timeUniform;shader.uniforms.apexSpeed=speedUniform;
    shader.vertexShader='uniform float apexTime; uniform float apexSpeed;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      float tailWeight=smoothstep(-.6,2.3,position.z);
      transformed.x+=sin(apexTime*(1.6+apexSpeed*.09)-position.z*2.2)*tailWeight*tailWeight*.22;
    `);
  };
  material.customProgramCacheKey=()=> 'apex-skin-v1';
  const main=merged([body,...details],material,'apex-continuous-body');main.geometry.userData.continuousSections=109;group.add(main);group.userData.bodyMesh=main;
  const fins=[];
  for(const side of [-1,1]) {
    fins.push(fin([[side*.42,-.11,-.85],[side*1.15,-.11,-.36],[side*1.85,-.11,.47],[side*1.37,-.11,.39],[side*.69,-.11,.21],[side*.44,-.11,-.13]],0x5e7e77,.055));
    fins.push(fin([[side*.29,-.12,.54],[side*.99,-.12,1.11],[side*.81,-.12,1.44],[side*.24,-.12,1.05]],0x657f74,.045));
    fins.push(fin([[0,.01,1.85],[side*.85,.01,2.22],[side*1.12,.01,2.69],[side*.52,.01,2.51],[0,.01,2.36]],0x5c7874,.05));
  }
  const finMesh=merged(fins,material,'apex-paired-hydrofoils');group.add(finMesh);group.userData.fins=finMesh;
  finMesh.userData.basePositions=finMesh.geometry.attributes.position.array.slice();finMesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  const ridge=[];
  for(let i=0;i<8;i++){const z=-.45+i*.29,y=.49-Math.max(0,z)*.21;ridge.push(tissue([[0,y,z],[0,y+.3-i*.016,z+.1],[0,y+.43-i*.029,z+.29]],.083-i*.006,0x849682,20,.95));}
  group.add(merged(ridge,material,'apex-flexible-dorsal-crest'));
  group.userData.timeUniform=timeUniform;group.userData.speedUniform=speedUniform;
  return group;
}

export function animateApexBody(group,time,player={}) {
  const data=group.userData,speed=Math.hypot(player.vx||0,player.vy||0,player.vz||0);
  data.timeUniform.value=time;data.speedUniform.value=speed;
  const mesh=data.fins,base=mesh.userData.basePositions,position=mesh.geometry.attributes.position;
  for(let i=0;i<position.count;i++) {
    const x=base[i*3],y=base[i*3+1],z=base[i*3+2];
    position.array[i*3+1]=y+Math.sin(time*(1.5+speed*.05)-Math.abs(x)*1.6-z*.8)*Math.max(0,Math.abs(x)-.4)*.12;
  }
  position.needsUpdate=true;
}
