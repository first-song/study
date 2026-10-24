import fs from 'node:fs';
const path='src/scene.js';let s=fs.readFileSync(path,'utf8');
s=s.replace("createSeabed, createHabitatDetails, createWaterSurface", "createSeabed, createHabitatDetails, createWaterSurface, animateHabitatDetails");
s=s.replace("const TAU =", `import { createWorld, biomeAt, worldRandom } from './world.js';
import { createOceanRendering, createIsland } from './ocean-rendering.js';
import { createAssimilatedOrgans, animateAssimilatedOrgans, createApexBody, animateApexBody } from './assimilated-models.js';

const TAU =`);
s=s.replace('constructor(container) {','constructor(container,world=createWorld(42)) {');
s=s.replace('this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .1, 240);','this.camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, .1, 800);');
s=s.replace('this.makeWorld();','this.world=world;\n    this.makeWorld();\n    this.post=createOceanRendering(this.renderer,this.scene,this.camera);');
s=s.replace('this.renderer.setSize(innerWidth, innerHeight);\n    };','this.renderer.setSize(innerWidth, innerHeight);\n      this.post.resize();\n    };');
const start=s.indexOf('  quality(value) {'),end=s.indexOf('  makePickupBatches() {');
s=s.slice(0,start)+`  quality(value) {
    this.qualitySetting=value;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,value==='high'?1.75:value==='low'?1:1.25));
    this.motes.visible=value!=='low';this.rays.visible=value!=='low';
    this.backgroundSchools.count=value==='low'?210:420;
    if(this.habitat.userData.grass)this.habitat.userData.grass.count=value==='low'?800:1800;
    this.post?.quality(value);this.post?.resize();
  }

  syncWorld(world) {
    if(!world||this.world.seed===world.seed&&this.world.radius===world.radius)return;
    disposeObject(this.worldRoot);this.world=world;this.makeEnvironment();this.quality(this.qualitySetting);
    this.finale=null;
  }

  makeEnvironment() {
    this.worldRoot=new THREE.Group();this.scene.add(this.worldRoot);
    this.seabed=createSeabed(this.world);this.habitat=createHabitatDetails(this.world);
    this.surface=createWaterSurface(this.world);this.waterSurface=this.surface;
    this.island=createIsland(this.world);
    this.worldRoot.add(this.seabed,this.habitat,this.surface,this.island);
    this.backgroundSchools=createBackgroundSchools();this.worldRoot.add(this.backgroundSchools);
    const schools=this.backgroundSchools.userData.schools;
    if(schools)for(let i=0;i<schools.length;i++){
      const biome=this.world.biomes[i%this.world.biomes.length];
      const school=schools[i];school.x=biome.x;school.z=biome.z;
    }
    this.rays=new THREE.Group();const rng=worldRandom(this.world.seed^0xa875);
    for(let i=0;i<26;i++){
      const ray=new THREE.Mesh(new THREE.CylinderGeometry(.25,2+rng()*4,23,10,1,true),glow(0xafdcd5,.014));
      const biome=this.world.biomes[i%3];ray.position.set(biome.x+(rng()-.5)*70,44,biome.z+(rng()-.5)*70);ray.rotation.z=-.28;this.rays.add(ray);
    }
    this.worldRoot.add(this.rays);this.chimneyLights=[];
  }

  makeWorld() {
    this.makeEnvironment();this.makePickupBatches();
    const positions=new Float32Array(1500*3);
    for(let i=0;i<1500;i++){positions[i*3]=rand(-85,85);positions[i*3+1]=rand(-35,35);positions[i*3+2]=rand(-85,85);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.motes=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xc4d9d7,size:.045,transparent:true,opacity:.25,depthWrite:false}));
    this.scene.add(this.motes);
  }

  beginFinale(state) {
    const p=state.player;
    this.finale={elapsed:0,done:false,start:new THREE.Vector3(p.x,p.y,p.z),scale:this.player.scale.clone()};
  }

`+s.slice(end);
// The island now lives at the seeded core site and is rebuilt with the world.
const oldFacilityStart=s.indexOf('  makeFacility() {'),oldFacilityEnd=s.indexOf('  makeCell(',oldFacilityStart);
s=s.slice(0,oldFacilityStart)+s.slice(oldFacilityEnd);
s=s.replace('this.clock += dt;','this.syncWorld(state.world);\n    this.clock += dt;');
s=s.replace('this.environmentColor.setHex(0x103e51).lerp(this.deepColor,darkness);',"const biome=biomeAt(this.world,p);\n    this.environmentColor.setHex(biome?.color||0x176575).lerp(this.deepColor,darkness*.92);");
s=s.replace('this.scene.fog.density=.0095+darkness*.009+this.localPollution*.009;','this.scene.fog.density=.0065+darkness*.008+this.localPollution*.008;');
s=s.replace('this.sun.intensity=depth>=1000?0:2.45*Math.exp(-depth/310);','this.sun.intensity=depth>=1000?0:3.5*Math.exp(-depth/420);');
s=s.replace('this.ambient.intensity=1.5*(1-darkness)+.24;','this.ambient.intensity=1.9*(1-darkness)+.34;\n    this.scene.environmentIntensity=.5*(1-darkness)+.12;');
s=s.replace('this.playerLight.intensity=19+darkness*25+photophore*(15+darkness*16);','const lamp=p.assimilations?.lureLamp||0;\n    this.playerLight.intensity=19+darkness*25+photophore*(15+darkness*16)+lamp*65;');
s=s.replace('this.playerLight.distance=22+darkness*12+photophore*7;','this.playerLight.distance=22+darkness*12+photophore*7+lamp*24;');
s=s.replace('    this.caustics.visible=depth<280;','');
s=s.replace("    this.causticsMaterial.uniforms.time.value=time;",'    animateHabitatDetails(this.habitat,time);');
const kstart=s.indexOf('    this.motes.rotation.y='),kend=s.indexOf('    this.updateMutations(',kstart);
s=s.slice(0,kstart)+`    this.motes.position.set(p.x,p.y,p.z);
`+s.slice(kend);
s=s.replace("this.bodyPlan=bodyPlanFor(p.level);this.lastBranches='';","this.bodyPlan=bodyPlanFor(p.level);this.lastBranches='';this.lastAssimilations='';this.assimilatedOrgans=null;this.apexBody=null;");
s=s.replace('    this.player.position.set(p.x,p.y,p.z);',`    const assimilationKey=JSON.stringify([p.apex,p.assimilations,this.bodyPlan]);
    if(this.lastAssimilations!==assimilationKey) {
      if(this.assimilatedOrgans)disposeObject(this.assimilatedOrgans);
      if(this.apexBody)disposeObject(this.apexBody);
      for(const child of this.player.children)child.visible=!p.apex;
      this.apexBody=p.apex?createApexBody(p):null;
      if(this.apexBody)this.player.add(this.apexBody);
      this.assimilatedOrgans=createAssimilatedOrgans(p,this.bodyPlan);this.player.add(this.assimilatedOrgans);
      this.lastAssimilations=assimilationKey;
    }
    animateAssimilatedOrgans(this.assimilatedOrgans,time,p);
    if(this.apexBody)animateApexBody(this.apexBody,time,p);
    this.player.position.set(p.x,p.y,p.z);`);
s=s.replace('    const cameraTurn=THREE.MathUtils.euclideanModulo(this.yaw-this.cameraYaw+Math.PI,TAU)-Math.PI;\n    this.cameraYaw+=cameraTurn*(1-Math.exp(-dt*22));\n    this.cameraPitch=THREE.MathUtils.lerp(this.cameraPitch,this.pitch,1-Math.exp(-dt*22));','    this.cameraYaw=this.yaw;this.cameraPitch=this.pitch;');
s=s.replace('const targetFov=this.reducedMotion?58:58+(p.dashTime>0?7:0);','const targetFov=this.reducedMotion?64:64+(p.dashTime>0?5:0);');
s=s.replace('const distance=10+size*2;','const distance=10+size*(p.apex?3.6:2);');
s=s.replace('if(changedCamera)this.camera.position.copy(this.tmp);\n      else this.camera.position.lerp(this.tmp,1-Math.exp(-dt*8));','this.camera.position.copy(this.tmp);');
s=s.replace('    this.renderer.render(this.scene,this.camera);',`    if(this.finale&&!this.finale.done) {
      const f=this.finale;f.elapsed+=dt;const t=Math.min(1,f.elapsed/5.5),core=this.world.core;
      this.player.visible=true;this.player.position.lerpVectors(f.start,new THREE.Vector3(core.x,core.y+4,core.z+15),Math.min(1,t*2));
      this.player.rotation.set(0,0,0);this.player.scale.copy(f.scale).multiplyScalar(1+Math.sin(t*Math.PI)*.8);
      this.island.position.y=this.island.userData.restY-Math.pow(Math.max(0,(t-.35)/.65),2)*65;
      this.island.rotation.z=Math.max(0,t-.35)*.65;
      this.camera.position.set(core.x+60,core.y+27,core.z+83);this.camera.lookAt(core.x,core.y+8,core.z);
      if(t>=1)f.done=true;
    }
    this.post.render();`);
fs.writeFileSync(path,s);
