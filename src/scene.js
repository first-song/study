import * as THREE from '../node_modules/three/build/three.module.js';
import { depthFor, PLAYER_MAX_Y, WATER_SURFACE_Y, seabedHeight } from './biology.js';
import { MARINE_SPECIES, createMarineAnimal, animateMarineAnimal, createBackgroundSchools, animateBackgroundSchools } from './marine-models.js';
import { createSeabed, createHabitatDetails, createWaterSurface, animateHabitatDetails } from './ocean-habitat.js';
import { createReactor, animateReactor, createBiofilm, animateBiofilm } from './reactor-models.js';
import { exposureAt, HOST_TYPES, reactorEntranceYaw } from './ecosystem.js';

import { createWorld, biomeAt, worldRandom } from './world.js';
import { createOceanRendering, createIsland, createSkyDome, createHorizonHaze } from './ocean-rendering.js';
import { createMicrofauna, animateMicrofauna, setMicrofaunaQuality } from './microfauna.js';
import { createSubseaOutfall, animateSubseaOutfall } from './outfall-model.js';
import { createPlanktonBloom, animatePlanktonBloom } from './bloom-model.js';
import { createAberrantEchoModel, animateAberrantEchoModel } from './echo-models.js';
import { createEmissionsMother, animateEmissionsMother, createTendrilModel, animateTendril, createPollutionCloud, animatePollutionCloud } from './mother-models.js';
import { createAssimilatedOrgans, animateAssimilatedOrgans, createApexBody, animateApexBody } from './assimilated-models.js';
import { animateHumanSettlement, createDiverEntityModel, animateDiverEntityModel, createParasiteNodeModel, animateParasiteNodeModel, createSurfaceFleet, animateSurfaceFleet, createResearchWreck, animateResearchWreck, nearestHumanDistance, consumeNearestHuman as consumeClosestHuman } from './human-models.js';
import { humanBoatStates } from './human-navigation.js';
import { islandCenter, islandSurfaceAt, islandDeepPassageAt } from './island.js';
import { instinctTier } from './instincts.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const phong = (color, extra = {}) => new THREE.MeshPhongMaterial({ color, shininess: 65, ...extra });
const glow = (color, opacity = .22) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const ANIMALS = MARINE_SPECIES;
const HOST_TYPES_FOR_CAMERA = new Set(HOST_TYPES);
const bodyPlanFor = level => level >= 7 ? 4 : level >= 5 ? 3 : level >= 3 ? 2 : 1;
export const playerVisualScale = player => {
  if (player.apex) return Math.max(.9, player.size / 1.5);
  const stage = Math.max(0, Math.min(3, player.lifeStage ?? Math.floor((player.level || 1) / 2)));
  const membraneScale = [.036, .078, .14, .21][stage];
  return membraneScale * (1 + Math.max(0, (player.level || 1) - 1) * .012);
};

export const playerFollowDistance = player => {
  if (player.apex) return 10 + player.size * 3.6;
  const stage = Math.max(0, Math.min(3, player.lifeStage ?? Math.floor((player.level || 1) / 2)));
  return [3, 4.4, 6.8, 9.2][stage];
};

function createMotionTrail() {
  const count=72;
  const positions=new Float32Array(count*3),life=new Float32Array(count),size=new Float32Array(count),colors=new Float32Array(count*3);
  const tones=[new THREE.Color(0x8bd7c5),new THREE.Color(0xb8ebd4),new THREE.Color(0x69aeb8)];
  for(let i=0;i<count;i++){
    positions[i*3+1]=-999;
    size[i]=.18+(i%7)*.022;
    tones[i%tones.length].toArray(colors,i*3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('aLife',new THREE.BufferAttribute(life,1));
  geometry.setAttribute('aSize',new THREE.BufferAttribute(size,1));
  geometry.setAttribute('aColor',new THREE.BufferAttribute(colors,3));
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{uPixelRatio:{value:Math.min(devicePixelRatio,1.75)}},
    vertexShader:`attribute float aLife;attribute float aSize;attribute vec3 aColor;varying float vLife;varying vec3 vColor;
      uniform float uPixelRatio;
      void main(){vLife=aLife;vColor=aColor;vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_PointSize=clamp(aSize*uPixelRatio*(84./max(1.,-mv.z))*(.65+aLife*.9),0.,16.);
        gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying float vLife;varying vec3 vColor;
      void main(){float d=distance(gl_PointCoord,vec2(.5));if(d>.5)discard;
        float core=smoothstep(.5,.08,d);gl_FragColor=vec4(vColor*(.7+vLife*.8),core*vLife*.52);}`,
  });
  const points=new THREE.Points(geometry,material);
  points.name='cell-motion-trail';points.frustumCulled=false;
  points.userData={particles:Array.from({length:count},(_,index)=>({index,age:1,life:1,vx:0,vy:0,vz:0})),cursor:0,accumulator:0};
  return points;
}

function ellipsoid(radius, scale, position = [0, 0, 0], material, segments = 14) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(8, Math.floor(segments * .65))), material);
  mesh.scale.set(...scale); mesh.position.set(...position);
  return mesh;
}

function fin(points, material) {
  const positions = [];
  for (let i = 1; i < points.length - 1; i++) positions.push(...points[0], ...points[i], ...points[i + 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function tube(points, radius, material, segments = 14, sides = 5) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, sides, false), material);
}

function batchParts(parts, material) {
  return new THREE.Mesh(mergeSolidMeshes(parts), material);
}

function disposeObject(object) {
  const geometries = new Set(), materials = new Set();
  object.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) for (const material of (Array.isArray(node.material) ? node.material : [node.material])) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) if(!material.userData?.shared)material.dispose();
  object.removeFromParent();
}

function mergeSolidMeshes(meshes) {
  const positions=[],normals=[];
  for(const mesh of meshes) {
    mesh.updateMatrix();
    const geometry=mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    positions.push(...geometry.attributes.position.array);
    normals.push(...geometry.attributes.normal.array);
    geometry.dispose();mesh.geometry.dispose();
  }
  const merged=new THREE.BufferGeometry();
  merged.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  merged.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  return merged;
}

export class OceanScene {
  constructor(container,world=createWorld(42)) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '三维海洋游戏场景，移动鼠标环视，点击锁定鼠标');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x061924);
    this.scene.fog = new THREE.FogExp2(0x061924, .0115);
    this.environmentColor = new THREE.Color(0x061924);
    this.surfaceColor = new THREE.Color(0x2e8491);
    this.deepColor = new THREE.Color(0x020914);
    this.pollutionColor = new THREE.Color(0x432b24);
    this.localPollution = 0;
    this.shakeAmount = 0;
    this.biteFlash = 0;
    this.camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, .1, 2400);
    this.cameraRay = new THREE.Raycaster();
    this.cameraRayDirection = new THREE.Vector3();
    this.cameraObstructed = false;
    this.cameraOcclusionTime = 0;
    this.cameraSmoothDistance = 0;
    this.humanPanic = 0;
    this.camera.position.set(1, 23, 20);
    this.yaw = 0;
    this.pitch = .18;
    this.firstPerson = false;
    this.reducedMotion = false;
    this.cameraYaw = 0;
    this.cameraPitch = .18;
    this.cameraMode = 'menu';
    this.objects = new Map();
    this.echoTethers = new Map();
    this.kelps = [];
    this.effects = [];
    // 感电扫描的轮廓标记：一个实例化环网格，标记范围内的生命。
    const scanRing=new THREE.RingGeometry(.62,.86,18);
    this.scanMarkers=new THREE.InstancedMesh(
      scanRing,
      new THREE.MeshBasicMaterial({color:0xc6f584,transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending}),
      72,
    );
    this.scanMarkers.frustumCulled=false;
    this.scanMarkers.count=0;
    this.scanMarkers.renderOrder=4;
    this.scene.add(this.scanMarkers);
    // 排放母体的污染云：固定四个对象循环复用。
    this.motherClouds=[];
    for(let i=0;i<4;i++){
      const cloud=createPollutionCloud();
      cloud.visible=false;
      this.scene.add(cloud);
      this.motherClouds.push(cloud);
    }
    this.lastBranches = '';
    this.mutationFlagella = [];
    this.mutationVisuals = {};
    this.ambient = new THREE.HemisphereLight(0xb2d9d6, 0x07141c, .86);
    this.scene.add(this.ambient);
    this.fillLight = new THREE.AmbientLight(0x4f8396, .26);
    this.scene.add(this.fillLight);
    this.ambientTarget = new THREE.Color(0xb2d9d6);
    this.ambientGroundTarget = new THREE.Color(0x07141c);
    this.sun = new THREE.DirectionalLight(0xffe0b1, 2.8);
    this.sun.position.set(78, 122, -54);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -128;
    this.sun.shadow.camera.right = 128;
    this.sun.shadow.camera.top = 128;
    this.sun.shadow.camera.bottom = -128;
    this.sun.shadow.camera.near = 8;
    this.sun.shadow.camera.far = 310;
    this.sun.shadow.bias = -.00018;
    this.sun.shadow.normalBias = .055;
    this.scene.add(this.sun, this.sun.target);
    this.rimLight = new THREE.DirectionalLight(0x78b9d0, .58);
    this.rimTarget = new THREE.Color(0x78b9d0);
    this.rimLight.position.set(-65, 48, 88);
    this.rimLight.castShadow = false;
    this.scene.add(this.rimLight, this.rimLight.target);
    this.playerLight = new THREE.PointLight(0xa8d9ce, 19, 24, 1.6);
    this.scene.add(this.playerLight);
    this.qualitySetting = 'medium';
    this.bodyPlan = 1;
    this.islandBirdDummy = new THREE.Object3D();
    this.world=world;
    this.makeWorld();
    this.post=createOceanRendering(this.renderer,this.scene,this.camera);
    this.player = this.makeCell();
    this.scene.add(this.player);
    this.motionTrail=createMotionTrail();
    this.scene.add(this.motionTrail);
    this.target = new THREE.Vector3();
    this.tmp = new THREE.Vector3();
    this.animalTarget = new THREE.Vector3();
    this.clock = 0;
    this.resize = () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.post.resize();
      if(this.motionTrail)this.motionTrail.material.uniforms.uPixelRatio.value=this.renderer.getPixelRatio();
    };
    window.addEventListener('resize', this.resize);
  }

  quality(value) {
    this.qualitySetting=value;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,value==='high'?1.75:value==='low'?1:1.25));
    this.renderer.shadowMap.enabled=value!=='low';
    this.sun.castShadow=value!=='low';
    const shadowSize=value==='high'?2048:1024;
    if(this.sun.shadow.mapSize.x!==shadowSize){
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map=null;
      this.sun.shadow.mapSize.set(shadowSize,shadowSize);
    }
    this.motes.visible=value!=='low';this.rays.visible=value!=='low';
    this.backgroundSchools.count=value==='low'?110:value==='medium'?220:300;
    const countFor=(mesh,low,medium)=>{if(mesh)mesh.count=value==='high'?mesh.instanceMatrix.count:value==='low'?low:medium;};
    countFor(this.habitat.userData.rocks,150,270);
    countFor(this.habitat.userData.pebbles,420,820);
    countFor(this.habitat.userData.grass,800,1250);
    countFor(this.habitat.userData.kelp,52,84);
    countFor(this.habitat.userData.nurseryGrass,360,620);
    countFor(this.habitat.userData.nurseryRibbonGrass,220,390);
    countFor(this.habitat.userData.nurseryKelp,28,50);
    countFor(this.habitat.userData.corals,110,160);
    countFor(this.habitat.userData.plates,130,195);
    countFor(this.habitat.userData.anemones,100,220);
    countFor(this.habitat.userData.sponges,65,145);
    countFor(this.habitat.userData.fans,45,105);
    countFor(this.habitat.userData.urchins,42,54);
    countFor(this.habitat.userData.brittleStars,34,42);
    countFor(this.island?.userData.grassCover,420,720);
    countFor(this.island?.userData.wildflowers,140,240);
    setMicrofaunaQuality(this.microfauna,value);
    this.post?.quality(value);this.post?.resize();
  }

  syncWorld(world) {
    if(!world||this.world.seed===world.seed&&this.world.radius===world.radius)return;
    for(const line of this.echoTethers.values()) {
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    }
    this.echoTethers.clear();
    for(const object of this.objects.values())disposeObject(object);
    this.objects.clear();
    disposeObject(this.worldRoot);this.world=world;this.makeEnvironment();this.quality(this.qualitySetting);
    this.resetFinale();
  }

  resetFinale() {
    this.finale=null;
    if(this.island) {
      this.island.position.y=this.island.userData.restY;
      this.island.rotation.set(0,0,0);
    }
  }

  makeEnvironment() {
    this.worldRoot=new THREE.Group();this.scene.add(this.worldRoot);
    this.seabed=createSeabed(this.world);this.habitat=createHabitatDetails(this.world);
    this.microfauna=createMicrofauna(this.world);
    this.outfall=createSubseaOutfall(this.world);
    this.surface=createWaterSurface(this.world);this.waterSurface=this.surface;
    this.island=createIsland(this.world);
    this.patrolFleet=createSurfaceFleet();
    const wreckX=-25,wreckZ=-18;
    this.researchWreck=createResearchWreck({x:wreckX,y:seabedHeight(wreckX,wreckZ)+1.9,z:wreckZ});
    this.sky=createSkyDome();
    this.horizonHaze=createHorizonHaze();
    this.worldRoot.add(this.seabed,this.habitat,this.microfauna,this.outfall,this.surface,this.island,this.patrolFleet,this.researchWreck,this.horizonHaze,this.sky);
    this.backgroundSchools=createBackgroundSchools();this.worldRoot.add(this.backgroundSchools);
    const schools=this.backgroundSchools.userData.schools;
    if(schools)for(let i=0;i<schools.length;i++){
      const biome=this.world.biomes[i%this.world.biomes.length];
      const school=schools[i];school.x=biome.x;school.z=biome.z;
    }
    this.lightShaftMaterial=new THREE.ShaderMaterial({
      uniforms:{time:{value:0},color:{value:new THREE.Color(0xb9eee6)}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform float time;uniform vec3 color;varying vec2 vUv;
        void main(){
          float edge=pow(sin(vUv.x*3.14159265),1.35);
          float top=smoothstep(0.,.14,vUv.y);
          float base=1.-smoothstep(.6,1.,vUv.y);
          float bands=.68+.32*sin(vUv.y*31.-time*.22+vUv.x*8.);
          float alpha=edge*top*base*bands*.088;
          gl_FragColor=vec4(color,alpha);
        }`,
      transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
    });
    const rng=worldRandom(this.world.seed^0xa875);
    const shaftGeometry=new THREE.CylinderGeometry(.18,3.4,26,10,1,true);
    this.rays=new THREE.InstancedMesh(shaftGeometry,this.lightShaftMaterial,38);
    this.rays.name='layered-sun-shafts';
    this.rays.frustumCulled=false;
    const rayDummy=new THREE.Object3D();
    for(let i=0;i<this.rays.count;i++){
      const biome=this.world.biomes[i%Math.min(5,this.world.biomes.length)];
      rayDummy.position.set(biome.x+(rng()-.5)*92,43,biome.z+(rng()-.5)*92);
      rayDummy.rotation.set(0,rng()*TAU,-.34+(rng()-.5)*.17);
      rayDummy.scale.set(.7+rng()*1.15,.85+rng()*.5,.7+rng()*.95);
      rayDummy.updateMatrix();this.rays.setMatrixAt(i,rayDummy.matrix);
    }
    this.rays.instanceMatrix.needsUpdate=true;
    this.worldRoot.add(this.rays);this.chimneyLights=[];
  }

  makeWorld() {
    this.makeEnvironment();this.makePickupBatches();
    const positions=new Float32Array(1200*3);
    for(let i=0;i<1200;i++){positions[i*3]=rand(-85,85);positions[i*3+1]=rand(-35,35);positions[i*3+2]=rand(-85,85);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.motes=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xb7d3d0,size:.026,transparent:true,opacity:.16,depthWrite:false,sizeAttenuation:true}));
    this.scene.add(this.motes);
  }

  beginFinale(state) {
    const p=state.player;
    const size=playerVisualScale(p);
    this.finale={
      type:'devour',elapsed:0,startedAt:performance.now(),done:false,
      start:new THREE.Vector3(p.x,p.y,p.z),
      scale:new THREE.Vector3(size,size,size),
    };
  }

  beginParasiteFinale(state) {
    const p=state.player;
    this.finale={
      type:'parasite',elapsed:0,startedAt:performance.now(),done:false,
      start:new THREE.Vector3(p.x,p.y,p.z),
      scale:new THREE.Vector3(playerVisualScale(p),playerVisualScale(p),playerVisualScale(p)),
    };
  }

  makePickupBatches() {
    const batch=(geometry,material)=>{
      const mesh=new THREE.InstancedMesh(geometry,material,512);
      mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(mesh);return mesh;
    };
    // Suspended detritus and contaminated sediment replace collectible gems.
    const foodParts=[],sedimentParts=[];
    for(let i=0;i<5;i++) {
      const a=i*2.399;
      const flake=ellipsoid(.13+(i%2)*.055,[1,.22,1.45],[Math.sin(a)*.22,Math.cos(a)*.08,Math.cos(a)*.2],undefined,8);
      flake.rotation.set(i*.7,i*.9,i*.45);foodParts.push(flake);
      const sediment=new THREE.Mesh(new THREE.IcosahedronGeometry(.105+(i%3)*.035,1));
      sediment.scale.set(1,.62,.82);sediment.position.set(Math.sin(a)*.14,Math.cos(a)*.12,(i-2)*.075);
      sediment.rotation.set(i*.4,i*.8,i*.3);sedimentParts.push(sediment);
    }
    foodParts.push(tube([[-.18,0,-.15],[0,.05,.06],[.12,-.04,.27],[.23,0,.38]],.012,undefined,8,4));
    const snowParts=[];
    for(let i=0;i<4;i++)snowParts.push(ellipsoid(.05+(i%2)*.025,[1,.65,1],[Math.sin(i*2.1)*.16,Math.cos(i*1.4)*.16,(i-1.5)*.065],undefined,5));
    this.pickupBatches={
      food:[batch(mergeSolidMeshes(foodParts),new THREE.MeshStandardMaterial({color:0x9ea789,roughness:.92,side:THREE.DoubleSide}))],
      isotope:[batch(mergeSolidMeshes(sedimentParts),new THREE.MeshStandardMaterial({color:0xaaa17a,roughness:.83,metalness:.08}))],
      marineSnow:[batch(mergeSolidMeshes(snowParts),phong(0xb6bfbd,{transparent:true,opacity:.72,shininess:3}))],
    };
    this.pickupCounts={food:0,isotope:0,marineSnow:0};this.pickupDummy=new THREE.Object3D();
  }

  makeCell(level = 1) {
    if(bodyPlanFor(level)>1) return this.makeEvolvedPlayer(bodyPlanFor(level));
    const group = new THREE.Group();
    group.userData.bodyPlan=1;
    const membraneGeo = new THREE.SphereGeometry(1.5, 40, 28);
    const p = membraneGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const f = 1 + .07 * Math.sin(x * 3 + y) * Math.cos(z * 3) + .035 * Math.sin(y * 5);
      p.setXYZ(i, x*f, y*f*.87, z*f*1.08);
    }
    membraneGeo.computeVertexNormals();
    const membrane = new THREE.Mesh(membraneGeo, new THREE.MeshPhysicalMaterial({
      color:0x64c8a6,emissive:0x0d493b,emissiveIntensity:.34,
      roughness:.14,metalness:0,clearcoat:1,clearcoatRoughness:.08,
      envMapIntensity:1.25,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false,
    }));
    membrane.renderOrder = 3;
    group.add(membrane);
    this.membrane = membrane;
    const cytoplasm=new THREE.Mesh(
      new THREE.SphereGeometry(1.3,28,20),
      new THREE.MeshPhysicalMaterial({
        color:0x6ed9b5,emissive:0x0c2d27,emissiveIntensity:.34,
        roughness:.22,transparent:true,opacity:.105,depthWrite:false,
        clearcoat:.5,side:THREE.BackSide,
      }),
    );
    cytoplasm.scale.set(1,.82,1.08);group.add(cytoplasm);this.cytoplasm=cytoplasm;
    const shellMaterial = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0xb5f3a2) } },
      vertexShader: `varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}`,
      fragmentShader: `uniform vec3 color; varying vec3 n; varying vec3 v; void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),3.); gl_FragColor=vec4(color,rim*.65);}`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    group.add(new THREE.Mesh(membraneGeo, shellMaterial));
    this.shellMaterial = shellMaterial;
    const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(.63, 3), new THREE.MeshPhysicalMaterial({
      color:0xd9aa43,emissive:0x593b0b,emissiveIntensity:.72,
      roughness:.24,metalness:.04,clearcoat:.72,clearcoatRoughness:.14,
    }));
    nucleus.scale.set(1, .9, 1.1);
    nucleus.userData.pulseScale=nucleus.scale.clone();
    group.add(nucleus); this.nucleus = nucleus;
    const nucleusHalo = new THREE.Mesh(new THREE.SphereGeometry(.82, 20, 16), glow(0xffd978, .15));
    group.add(nucleusHalo);
    const cellInner=new THREE.Group();cellInner.name='living-cytoplasm-ultrastructure';group.add(cellInner);
    const mitochondria=[],chromatin=[],vacuoles=[];
    for(let i=0;i<6;i++){
      const angle=i/6*TAU+.3,radius=.72+(i%2)*.17,x=Math.cos(angle)*radius,y=Math.sin(i*1.9)*.42,z=Math.sin(angle)*radius;
      mitochondria.push(ellipsoid(.12+(i%2)*.025,[1.9,.72,.72],[x,y,z],undefined,10));
      const fold=tube([[x-.15,y,z],[x-.03,y+.055,z+.02],[x+.06,y-.04,z-.01],[x+.14,y+.025,z]],.018,undefined,8,4);
      fold.rotation.y=-angle;mitochondria.push(fold);
    }
    for(let i=0;i<5;i++){
      const points=[];
      for(let j=0;j<10;j++){
        const a=j*.72+i*1.7,r=.2+Math.sin(j*1.4+i)*.12;
        points.push([Math.cos(a)*r,Math.sin(j*.91+i)*.18,Math.sin(a)*r]);
      }
      chromatin.push(tube(points,.012,undefined,20,4));
    }
    for(const [position,scale] of [
      [[-.54,.45,.35],[.22,.26,.22]],[[.5,-.38,.48],[.28,.2,.24]],
      [[-.32,-.42,-.45],[.18,.15,.27]],[[.6,.34,-.36],[.16,.2,.2]],
    ])vacuoles.push(ellipsoid(1,scale,position,undefined,14));
    cellInner.add(
      batchParts(mitochondria,new THREE.MeshPhysicalMaterial({color:0xc68068,emissive:0x4b211b,emissiveIntensity:.26,roughness:.46,clearcoat:.28})),
      batchParts(chromatin,new THREE.MeshStandardMaterial({color:0xf1c26e,emissive:0x8d5c20,emissiveIntensity:.82,roughness:.48})),
      batchParts(vacuoles,new THREE.MeshPhysicalMaterial({color:0x9ae2ce,emissive:0x143b36,emissiveIntensity:.18,roughness:.12,transmission:0,transparent:true,opacity:.13,clearcoat:.8,depthWrite:false,side:THREE.DoubleSide})),
    );
    this.cellInner=cellInner;
    const organelleGeometry=new THREE.SphereGeometry(.13,9,7);
    this.organelles = new THREE.InstancedMesh(
      organelleGeometry,
      new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x153c2b,emissiveIntensity:.36,roughness:.62,vertexColors:true}),
      17,
    );
    const organelleDummy=new THREE.Object3D(),organelleColor=new THREE.Color();
    for (let i = 0; i < 17; i++) {
      const a = i / 17 * TAU, y = Math.sin(i * 2.3) * .7;
      const radius=.76+((i*37)%23)/100;
      organelleDummy.position.set(Math.cos(a)*radius,y,Math.sin(a)*(radius+.08));
      organelleDummy.rotation.set(a*.4,a,1.2);
      organelleDummy.scale.set(.7+(i%3)*.14,1.25+(i%2)*.32,.82);
      organelleDummy.updateMatrix();this.organelles.setMatrixAt(i,organelleDummy.matrix);
      organelleColor.setHex(i%3?0x7fbf76:i%2?0xd2b25a:0x7fcbb2);
      this.organelles.setColorAt(i,organelleColor);
    }
    this.organelles.instanceColor.needsUpdate=true;
    group.add(this.organelles);
    const dustPositions=new Float32Array(72*3);
    for(let i=0;i<72;i++){
      const a=i*2.399,radius=.32+((i*29)%71)/100,y=Math.sin(i*1.7)*.62;
      dustPositions[i*3]=Math.cos(a)*radius;
      dustPositions[i*3+1]=y;
      dustPositions[i*3+2]=Math.sin(a)*radius;
    }
    const dustGeometry=new THREE.BufferGeometry();
    dustGeometry.setAttribute('position',new THREE.BufferAttribute(dustPositions,3));
    this.cellDust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({
      color:0xb9f0cb,size:.035,transparent:true,opacity:.48,depthWrite:false,
    }));
    group.add(this.cellDust);
    this.cilia = new THREE.Group();
    const hairMat = new THREE.LineBasicMaterial({ color: 0xa8ead0, transparent: true, opacity: .52 });
    const hairPoints=[];
    for (let i = 0; i < 42; i++) {
      const phi = Math.acos(1 - 2 * (i + .5) / 42), theta = i * 2.399;
      const dir = new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi)*.87,Math.sin(phi)*Math.sin(theta)*1.08);
      const points = [dir.clone().multiplyScalar(1.45),dir.clone().multiplyScalar(1.85),dir.clone().multiplyScalar(2.05).add(new THREE.Vector3(.1, .12, .08))];
      hairPoints.push(points[0],points[1],points[1],points[2]);
    }
    this.cilia.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(hairPoints),hairMat));
    group.add(this.cilia);
    this.mutations = new THREE.Group(); group.add(this.mutations);
    // Long flagella make the organism read as a cell, even in silhouette.
    this.flagella = [];
    const flagellumMaterial=new THREE.MeshPhysicalMaterial({
      color:0x8ed4ad,emissive:0x173e31,emissiveIntensity:.62,
      roughness:.28,clearcoat:.55,transparent:true,opacity:.72,
    });
    for (let i = 0; i < 5; i++) {
      const points = [];
      for (let j = 0; j < 18; j++) points.push(new THREE.Vector3(Math.sin(j*.38+i)*.25+(i-2)*.22, Math.cos(j*.3+i)*.2,1+j*.23));
      const tail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, .026, 5, false), flagellumMaterial);
      group.add(tail); this.flagella.push(tail);
    }
    this.membrane.userData.restScaleY=this.membrane.scale.y;
    return group;
  }

  makeEvolvedPlayer(plan) {
    const group = new THREE.Group();
    group.userData.bodyPlan=plan;
    const skin = new THREE.MeshPhysicalMaterial({
      color:plan===2?0x93c6a3:plan===3?0x77c8bd:0x719da7,
      emissive:0x102e2c,emissiveIntensity:.56,roughness:.2,metalness:.015,
      clearcoat:.78,clearcoatRoughness:.18,sheen:.36,sheenColor:new THREE.Color(0xb5eadb),
      transparent:true,opacity:plan===4?.62:.34,depthWrite:false,side:THREE.DoubleSide,
    });
    const rim = new THREE.ShaderMaterial({
      uniforms:{color:{value:new THREE.Color(0xb5f3a2)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
      vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.); n=normalize(normalMatrix*normal); v=normalize(-p.xyz); gl_Position=projectionMatrix*p;}',
      fragmentShader:'uniform vec3 color; varying vec3 n; varying vec3 v; void main(){float r=pow(1.-abs(dot(normalize(n),normalize(v))),3.); gl_FragColor=vec4(color,r*.47);}'
    });
    this.shellMaterial=rim;
    this.organelles=new THREE.Group();this.cilia=new THREE.Group();this.mutations=new THREE.Group();this.flagella=[];
    group.add(this.organelles,this.cilia,this.mutations);
    const nucleusMat=new THREE.MeshPhysicalMaterial({color:0xc7a369,emissive:0x5c5424,emissiveIntensity:.7,roughness:.28,clearcoat:.68,clearcoatRoughness:.2});
    const tissueMat=new THREE.MeshPhysicalMaterial({color:0x70bca8,emissive:0x113b31,emissiveIntensity:.5,roughness:.28,clearcoat:.6,transparent:true,opacity:.44,depthWrite:false,side:THREE.DoubleSide});
    const addTissue=(scale,position)=>{
      const body=ellipsoid(1,scale,position,skin,24);body.renderOrder=2;group.add(body);
      const outline=new THREE.Mesh(body.geometry,rim);outline.scale.copy(body.scale);outline.position.copy(body.position);group.add(outline);
      return body;
    };
    const ciliaPoints=[];
    if(plan===2) {
      // Three attached cells retain individual membranes and nuclei; no organs yet.
      const lobes=[[-.72,.05,-.52],[.68,.12,-.22],[.02,-.15,.91]];
      for(let index=0;index<lobes.length;index++) {
        const position=lobes[index],cell=addTissue([.95,.82,1.03],position);
        if(index===0)this.membrane=cell;
        const nucleus=ellipsoid(.34,[1,.86,1.15],position,nucleusMat,16);
        this.organelles.add(nucleus);if(index===0)this.nucleus=nucleus;
        for(let i=0;i<12;i++) {
          const a=i/12*TAU;
          ciliaPoints.push(new THREE.Vector3(position[0]+Math.cos(a)*.93,position[1],position[2]+Math.sin(a)),new THREE.Vector3(position[0]+Math.cos(a)*1.2,position[1]+.08,position[2]+Math.sin(a)*1.28));
        }
        const tail=tube([[position[0],position[1],position[2]+.75],[position[0]+.3,position[1]-.1,position[2]+1.6],[position[0]+.15,position[1]+.12,position[2]+2.35]],.035,tissueMat,16);
        group.add(tail);this.flagella.push(tail);
      }
      const junctions=[tube([lobes[0],[0,0,-.35],lobes[1]],.22,tissueMat),tube([lobes[1],[.3,0,.4],lobes[2]],.2,tissueMat),tube([lobes[2],[-.3,0,.3],lobes[0]],.2,tissueMat)];
      group.add(batchParts(junctions,tissueMat));
    } else {
      this.membrane=addTissue([plan===4?.83:.72,plan===4?.67:.59,1.85],[0,0,.15]);
      // A continuous alimentary canal is visible through the transparent larval tissue.
      const gut=tube([[0,-.05,-1.68],[.1,-.12,-1.05],[-.15,-.12,-.25],[.18,-.12,.45],[0,-.08,1.55]],plan===4?.16:.12,nucleusMat,24,7);
      this.organelles.add(gut);this.nucleus=gut;
      const partitions=[];
      for(let i=0;i<6;i++) {
        const z=-1.2+i*.5,r=.5+Math.sin((i+.5)/6*Math.PI)*.15;
        const ring=new THREE.Mesh(new THREE.TorusGeometry(r,.035,4,18));ring.position.z=z;ring.scale.y=.82;partitions.push(ring);
      }
      this.organelles.add(batchParts(partitions,tissueMat));
      for(let side=-1;side<=1;side+=2) for(let i=0;i<21;i++) {
        const z=-1.55+i*.15,r=Math.sqrt(Math.max(.05,1-(z/1.95)**2));
        ciliaPoints.push(new THREE.Vector3(side*.7*r,0,z),new THREE.Vector3(side*(.7*r+.24),.07,z+.12));
      }
      if(plan===3) {
        const corona=new THREE.Mesh(new THREE.TorusGeometry(.47,.038,5,24),tissueMat);corona.position.set(0,0,-1.5);this.cilia.add(corona);
        for(let i=0;i<24;i++){const a=i/24*TAU;ciliaPoints.push(new THREE.Vector3(Math.cos(a)*.49,Math.sin(a)*.44,-1.5),new THREE.Vector3(Math.cos(a)*.7,Math.sin(a)*.62,-1.74));}
        const tail=tube([[0,0,1.6],[.18,0,2.2],[0,.08,2.7]],.07,tissueMat,14);group.add(tail);this.flagella.push(tail);
      } else {
        addTissue([.67,.53,.65],[0,.04,-1.35]);
        const oral=phong(0xc3a277,{emissive:0x302a1b,shininess:65,side:THREE.DoubleSide});
        const mouth=new THREE.Mesh(new THREE.TorusGeometry(.34,.085,7,26),oral);mouth.position.set(0,-.11,-1.93);group.add(mouth);
        const mouthInside=ellipsoid(1,[.29,.25,.08],[0,-.11,-1.95],phong(0x172730));group.add(mouthInside);
        const fins=[];
        for(const side of [-1,1]) {
          fins.push(fin([[side*.54,-.07,-.55],[side*1.75,-.18,.24],[side*1.2,-.2,.72],[side*.68,-.06,.7]]));
          fins.push(fin([[0,.05,1.45],[side*1.02,.05,2.37],[side*.23,.06,2.11],[0,.05,2.25]]));
          const eye=ellipsoid(.12,[.65,1,1.05],[side*.58,.17,-1.55],phong(0xd8edbc,{emissive:0x7aaf65}));group.add(eye);
        }
        const finMat=phong(0x7eb9b6,{emissive:0x143d38,side:THREE.DoubleSide,transparent:true,opacity:.72});
        group.add(batchParts(fins,finMat));
        const frills=[];
        for(const side of [-1,1]) for(let i=0;i<4;i++) {
          const z=-.63+i*.26;
          frills.push(tube([[side*.6,.18,z],[side*(.92+i*.04),.48,z+.12],[side*1.08,.73,z+.23]],.036));
          frills.push(tube([[side*.86,.4,z+.08],[side*1.22,.48,z+.02]],.022));
        }
        group.add(batchParts(frills,phong(0x99d9bd,{emissive:0x27534a,shininess:70})));
      }
    }
    this.cilia.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ciliaPoints),new THREE.LineBasicMaterial({color:0x99d8c0,transparent:true,opacity:.5})));
    this.membrane.userData.restScaleY=this.membrane.scale.y;
    return group;
  }

  updateMutations(branches, level = 1, mutations = {}) {
    const plan=bodyPlanFor(level),key = `${plan}:${JSON.stringify(branches)}:${JSON.stringify(mutations)}`;
    if (key === this.lastBranches) return;
    this.lastBranches = key;
    for (const child of [...this.mutations.children]) disposeObject(child);
    const { devour, radiation, symbiosis } = branches;
    const feedingParts=[];
    for (let i = 0; i < devour * (plan===4?3:2); i++) {
      const a = i / Math.max(1,devour*(plan===4?3:2)) * TAU;
      if(plan===4) {
        // Hardened feeding papillae belong to the differentiated animal, not a cell.
        const papilla=new THREE.Mesh(new THREE.ConeGeometry(.065,.25+devour*.035,6));
        papilla.position.set(Math.cos(a)*.33,Math.sin(a)*.29-.11,-1.98);
        papilla.rotation.x=-Math.PI/2;feedingParts.push(papilla);
      } else {
        const radius=plan===1?1.1:plan===2?1.25:.52,z=plan>=3?-1.55:-.65;
        const pseudopod=ellipsoid(1,[.12+.02*devour,.11,.4+devour*.06],[Math.cos(a)*radius,Math.sin(a)*radius*.75,z-.2]);
        pseudopod.rotation.y=Math.cos(a)*.3;feedingParts.push(pseudopod);
      }
    }
    if(feedingParts.length)this.mutations.add(batchParts(feedingParts,phong(plan===4?0xd1b58b:0xbcd99a,{emissive:0x263c24,transparent:plan!==4,opacity:.7})));
    for (let i = 0; i < radiation * 3; i++) {
      const a = i / (radiation * 3) * TAU;
      const node = ellipsoid(.12+ radiation*.022,[1,.75,1.3],[Math.cos(a)*(plan<3?1.1:.65),Math.sin(a)*(plan<3?.85:.52),plan<3?.1:(i%3-1)*1.1],phong(0xd9e99a,{emissive:0x6e8b34,shininess:110}));
      this.mutations.add(node);
    }
    for (let i = 0; i < symbiosis * 2; i++) {
      const a = i / (symbiosis*2) * TAU;
      const points = [];
      for(let j=0;j<12;j++) points.push(new THREE.Vector3(Math.cos(a)*((plan<3?1.1:.65)+j*.035),Math.sin(a)*((plan<3?.8:.45)+j*.035),.3+j*.15+Math.sin(j*.7)*.12));
      const tentacle=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,.05,5,false),phong(0x71e9dc,{emissive:0x176d67}));
      this.mutations.add(tentacle);
    }
    const color = radiation > devour && radiation > symbiosis ? 0xd7ed70 : symbiosis > devour ? 0x80e7d4 : devour > 0 ? 0xf1b68b : 0xb5f3a2;
    this.shellMaterial.uniforms.color.value.setHex(color);
    this.player.userData.phenotypeScale={x:1+symbiosis*.025,y:1-radiation*.012,z:1+devour*.055};
    if(plan>=3) {
      const adaptations=[];
      for(const side of [-1,1]) {
        if(symbiosis>0)adaptations.push(fin([[side*.52,0,-.65],[side*(1.15+symbiosis*.18),-.07,-.16],[side*(1.25+symbiosis*.17),-.1,.7],[side*.6,0,1.25]]));
        if(devour>0&&plan===4)adaptations.push(tube([[side*.26,-.18,-1.65],[side*(.43+devour*.025),-.32,-2.03],[side*.17,-.2,-2.23-devour*.055]],.035+devour*.012));
      }
      if(radiation>0)for(let i=0;i<radiation+2;i++) {
        const z=-.95+i*.43;
        adaptations.push(fin([[0,.4,z-.17],[0,.82+radiation*.09,z+.07],[0,.64+radiation*.055,z+.24],[0,.4,z+.3]]));
      }
      if(adaptations.length) {
        const shape=batchParts(adaptations,phong(color,{side:THREE.DoubleSide,transparent:true,opacity:.57,emissive:0x172b29,shininess:65}));
        shape.name='branch-body-adaptations';this.mutations.add(shape);
      }
    }
    this.addRadiationOrgans(mutations,plan);
  }

  addRadiationOrgans(mutations,plan) {
    // Permanent mutations change the current body plan; geometry is rebuilt only
    // when a mutation rank or body plan changes, never during the render loop.
    this.mutationFlagella=[];
    this.mutationVisuals={};
    const ranks=Object.fromEntries(['membrane','flagella','photophore','radiotrophy','spines','repair'].map(id=>[id,Math.max(0,Math.min(2,mutations[id]||0))]));
    const surfaces=plan===1?[{center:[0,0,0],radii:[1.5,1.305,1.62]}]:plan===2?
      [[-.72,.05,-.52],[.68,.12,-.22],[.02,-.15,.91]].map(center=>({center,radii:[.95,.82,1.03]})):
      [{center:[0,0,.15],radii:plan===4?[.83,.67,1.85]:[.72,.59,1.85]}];
    const organ=(id)=>{
      const group=new THREE.Group();group.name=`mutation-${id}`;
      group.userData.mutationId=id;group.userData.rank=ranks[id];
      this.mutations.add(group);return group;
    };
    const samples=(count,offset=0)=>Array.from({length:count},(_,i)=>{
      const surface=surfaces[i%surfaces.length],n=Math.ceil(count/surfaces.length),j=Math.floor(i/surfaces.length);
      const phi=Math.acos(1-2*(j+.5)/n),theta=j*2.399+offset;
      const direction=new THREE.Vector3(Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
      const position=direction.clone().multiply(new THREE.Vector3(...surface.radii)).add(new THREE.Vector3(...surface.center));
      const normal=direction.clone().divide(new THREE.Vector3(...surface.radii)).normalize();
      return {position,normal};
    });
    const up=new THREE.Vector3(0,1,0);
    if(ranks.membrane) {
      const group=organ('membrane'),shells=[],rims=[];
      const expansion=1.035+ranks.membrane*.018;
      for(const {center,radii} of surfaces) {
        shells.push(ellipsoid(1,radii.map(v=>v*expansion),center,undefined,22));
        const points=[];
        for(let i=0;i<=40;i++) {
          const a=i/40*TAU;
          points.push([center[0]+Math.cos(a)*radii[0]*expansion,center[1]+Math.sin(a*2)*.09,center[2]+Math.sin(a)*radii[2]*expansion]);
        }
        rims.push(tube(points,.018+ranks.membrane*.009,undefined,40,4));
      }
      group.add(batchParts(shells,phong(0xc4a9df,{emissive:0x28263f,transparent:true,opacity:.08+ranks.membrane*.035,depthWrite:false,side:THREE.DoubleSide,shininess:150})));
      group.add(batchParts(rims,phong(0xdfccef,{emissive:0x48415c,transparent:true,opacity:.6})));
    }
    if(ranks.flagella) {
      const group=organ('flagella'),material=phong(0xa8ecbd,{emissive:0x275b43,transparent:true,opacity:.76,side:THREE.DoubleSide});
      for(let i=0;i<2+ranks.flagella*2;i++) {
        const side=i%2?1:-1,offset=Math.floor(i/2),tail=new THREE.Group();
        if(plan<3) {
          // Cells grow additional flexible flagella, without muscles or fins.
          const surface=surfaces[i%surfaces.length];
          tail.position.set(surface.center[0]+side*surface.radii[0]*.55,surface.center[1]+(offset-1)*.18,surface.center[2]+surface.radii[2]*.75);
          tail.add(tube([[0,0,0],[side*.3,.12,.65],[side*.42,-.13,1.35],[side*.2,.08,2.3+ranks.flagella*.35]],.035+ranks.flagella*.009,material,22,5));
        } else {
          // In multicellular bodies the same propulsion trait becomes paired
          // contractile fin folds, retaining the animal's existing body shape.
          tail.position.set(side*.55,0,.15+offset*.45);
          tail.add(fin([[0,0,-.2],[side*(.65+ranks.flagella*.14),-.08,.36],[side*.62,-.1,.95],[0,0,.68]],material));
        }
        tail.userData.phase=i*.85;group.add(tail);this.mutationFlagella.push(tail);
      }
    }
    if(ranks.photophore) {
      const group=organ('photophore'),cores=[],halos=[];
      for(const {position} of samples(6+ranks.photophore*5,.8)) {
        cores.push(ellipsoid(.075+ranks.photophore*.018,[1,1,1],position.toArray(),undefined,10));
        halos.push(ellipsoid(.19+ranks.photophore*.035,[1,1,1],position.toArray(),undefined,8));
      }
      const lights=batchParts(cores,phong(0xc6ffff,{emissive:0x64dbf2,emissiveIntensity:1.6,shininess:90}));
      const halo=batchParts(halos,glow(0x6be3ff,.2));
      group.add(lights,halo);this.mutationVisuals.photophore=lights;this.mutationVisuals.halo=halo;
    }
    if(ranks.radiotrophy) {
      const group=organ('radiotrophy'),patches=[],pigment=[];
      for(const {position,normal} of samples(9+ranks.radiotrophy*9,1.7)) {
        const patch=ellipsoid(1,[.13+ranks.radiotrophy*.035,.035,.2],position.toArray(),undefined,10);
        patch.quaternion.setFromUnitVectors(up,normal);patches.push(patch);
        pigment.push(ellipsoid(.038,[1,.7,1],position.clone().addScaledVector(normal,.045).toArray(),undefined,8));
      }
      // Dark pigment represents the fictional radiation-harvesting tissue;
      // its amber flecks differ from the blue chemical bioluminescence.
      group.add(batchParts(patches,phong(0x422c50,{emissive:0x201326,shininess:65})));
      const flecks=batchParts(pigment,phong(0xd9b46d,{emissive:0x937039,emissiveIntensity:.5}));
      group.add(flecks);this.mutationVisuals.radiotrophy=flecks;
    }
    if(ranks.spines) {
      const group=organ('spines'),spines=[];
      for(const {position,normal} of samples(7+ranks.spines*7,.2)) {
        const length=.24+ranks.spines*.2;
        const spine=new THREE.Mesh(new THREE.ConeGeometry(.055+ranks.spines*.014,length,5));
        spine.position.copy(position).addScaledVector(normal,length*.42);
        spine.quaternion.setFromUnitVectors(up,normal);spines.push(spine);
      }
      // These are membrane protrusions in cells, dermal spines in later forms.
      group.add(batchParts(spines,phong(0xd4c596,{emissive:0x45392a,shininess:90})));
    }
    if(ranks.repair) {
      const group=organ('repair'),colonies=[];
      for(const {position,normal} of samples(5+ranks.repair*4,2.6)) {
        const tangent=new THREE.Vector3(normal.z,.2,-normal.x).normalize();
        for(let i=0;i<3;i++) {
          const bead=ellipsoid(.052+ranks.repair*.008,[1,1.5,1],position.clone().addScaledVector(tangent,(i-1)*.095).addScaledVector(normal,.03).toArray(),undefined,8);
          bead.quaternion.setFromUnitVectors(up,normal);colonies.push(bead);
        }
      }
      const repair=batchParts(colonies,phong(0x81e7ba,{emissive:0x226e51,shininess:100}));
      group.add(repair);this.mutationVisuals.repair=repair;
    }
  }

  makeAnimal(entity) {
    return createMarineAnimal(entity);
  }

  makeEchoTether(entity) {
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(25*3),3));
    const material=new THREE.LineBasicMaterial({
      color:0xe1a26b,transparent:true,opacity:.5,depthWrite:false,
    });
    const line=new THREE.Line(geometry,material);
    line.name=`echo-reactor-link-${entity.reactorSiteId}`;
    line.frustumCulled=false;
    this.scene.add(line);
    this.echoTethers.set(entity.id,line);
    return line;
  }

  updateEchoTether(entity,time,state) {
    const line=this.echoTethers.get(entity.id);
    if(!line)return;
    const reactor=state.entities.find(candidate=>candidate.type==='reactor'&&candidate.siteId===entity.reactorSiteId);
    line.visible=Boolean(reactor)&&!entity.pacified&&this.objects.get(entity.id)?.visible!==false;
    if(!line.visible)return;
    const positions=line.geometry.attributes.position;
    const dx=reactor.x-entity.x,dy=reactor.y-entity.y,dz=reactor.z-entity.z;
    const perpendicularX=-dz,perpendicularZ=dx;
    const planar=Math.hypot(perpendicularX,perpendicularZ)||1;
    for(let index=0;index<positions.count;index++) {
      const t=index/(positions.count-1);
      const wave=Math.sin(t*Math.PI)*(1-Math.abs(t-.5)*1.15);
      positions.setXYZ(
        index,
        entity.x+dx*t+(perpendicularX/planar)*Math.sin(time*1.1+t*7)*wave*.55,
        entity.y+dy*t+Math.sin(time*1.7+t*9)*wave*.34,
        entity.z+dz*t+(perpendicularZ/planar)*Math.sin(time*1.1+t*7)*wave*.55,
      );
    }
    positions.needsUpdate=true;
    const accent=entity.phase==='charge'?0xff7c57:entity.phase==='exposed'?0xd8f1a3:0xe1a26b;
    line.material.color.setHex(accent);
    line.material.opacity=entity.phase==='charge'?.78:entity.phase==='exposed'?.62:.34;
  }

  makeEntity(entity) {
    const type = entity.type;
    const group = ANIMALS.has(type) ? this.makeAnimal(entity) : type==='reactor' ? createReactor(entity) : type==='biofilm' ? createBiofilm(entity) : type==='bloom' ? createPlanktonBloom(entity) : type==='diver' ? createDiverEntityModel(entity) : type==='islandNode' ? createParasiteNodeModel(entity) : type==='echo' ? createAberrantEchoModel(entity) : new THREE.Group();
    if(type==='echo')this.makeEchoTether(entity);
    if (type === 'marineSnow') {
      const flakes=[];
      for(let i=0;i<4;i++)flakes.push(ellipsoid(.055+(i%2)*.025,[1,.65,1],[Math.sin(i*2.1)*.16,Math.cos(i*1.4)*.16,(i-1.5)*.065],undefined,5));
      group.add(batchParts(flakes,phong(0xb8c4bd,{emissive:0x263b39,transparent:true,opacity:.72,shininess:4})));
    } else if (type === 'food') {
      const body = new THREE.Mesh(new THREE.SphereGeometry(.5, 10, 8), phong(0x79d7ac, { emissive:0x287950,transparent:true,opacity:.75 }));
      body.scale.set(1,.75,1.2); group.add(body);
      group.add(new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:0xd1ffd0})));
      group.add(new THREE.Mesh(new THREE.SphereGeometry(.8,8,6),glow(0x6df7b2,.07)));
      const strands=[];
      for(let i=0;i<3;i++) strands.push(new THREE.Vector3((i-1)*.18,0,.3),new THREE.Vector3((i-1)*.25,.15,1));
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(strands),new THREE.LineBasicMaterial({color:0x8be8c8,transparent:true,opacity:.5})));
    } else if (type === 'isotope') {
      group.add(new THREE.Mesh(new THREE.OctahedronGeometry(.65),phong(0xe4ed76,{emissive:0x879c24,shininess:130})));
      group.add(new THREE.Mesh(new THREE.SphereGeometry(1.15,10,8),glow(0xcfff60,.09)));
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.95,.018,4,20),glow(0xe9ff93,.5));
      ring.rotation.x=.8; group.add(ring);
    } else if (type === 'predator') {
      group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(entity.radius || 1.7,1),phong(0x986a91,{emissive:0x3d1436,flatShading:true})));
      const spikes = 8,spineParts=[];
      for(let i=0;i<spikes;i++) {
        const a=i/spikes*TAU;
        const spike=new THREE.Mesh(new THREE.ConeGeometry(.25,1.5,5));
        spike.position.set(Math.cos(a)*1.5,Math.sin(a)*1.5,0);
        spike.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),spike.position.clone().normalize());
        spineParts.push(spike);
      }
      group.add(batchParts(spineParts,phong(0xd6a2bf,{emissive:0x4f1d38})));
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.36,10,8),new THREE.MeshBasicMaterial({color:0xff898d}));
      eye.position.z=-(entity.radius || 1.7);group.add(eye);
    } else if (type === 'drone') {
      const body = new THREE.Mesh(new THREE.OctahedronGeometry(1.5),phong(0x65868d,{emissive:0x11222b}));
      body.scale.set(1,.5,1);group.add(body);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.8,.12,6,20),phong(0x7c8f93));
      ring.rotation.x=Math.PI/2;group.add(ring);
      group.add(new THREE.Mesh(new THREE.SphereGeometry(.45,12,8),new THREE.MeshBasicMaterial({color:0xff785b})));
    } else if (type === 'vent') {
      group.add(new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.4,3,12),phong(0x69734b,{emissive:0x273716})));
      const ring=new THREE.Mesh(new THREE.TorusGeometry(1.25,.08,5,18),phong(0xe2c265));
      ring.rotation.x=Math.PI/2;group.add(ring);
      const plume=new THREE.Mesh(new THREE.ConeGeometry(entity.radius || 5,12,16,1,true),glow(0x9ccf49,.07));
      plume.rotation.z=Math.PI;plume.position.y=6;group.add(plume);
    } else if (type === 'boss') {
      const mother = createEmissionsMother(entity);
      group.add(mother);
      group.userData.mother = mother;
    } else if (type === 'tendril') {
      const tendril = createTendrilModel(entity);
      group.add(tendril);
      group.userData.tendril = tendril;
    }
    group.userData.type=type;
    group.userData.visualVariant=entity.variant||'normal';
    group.userData.radius=entity.radius;
    group.userData.seed=entity.seed || Math.random()*20;
    this.scene.add(group);
    this.objects.set(entity.id,group);
    return group;
  }

  // 屏幕震动：受击、重击、Boss 阶段切换时给一点冲击，但不干扰瞄准。
  shake(amount = 0.4) {
    if (this.reducedMotion) return;
    this.shakeAmount = Math.min(1.1, (this.shakeAmount || 0) + amount);
  }

  // 本能的表现层：撕咬的前冲、拟态的融入、扫描的轮廓标记。
  // 这些反馈不是装饰 —— 没有它们，玩家读不出自己的动作发生了什么。
  updateInstinctVisuals(dt, state) {
    const p = state.player;
    const facing = p.facing || { x: 0, y: 0, z: -1 };
    const size = playerVisualScale(p);

    const biteTier = instinctTier(p, 'bite');
    const windupTotal = biteTier?.windup || 0;
    const progress = windupTotal > 0 && p.biteWindup > 0 ? 1 - p.biteWindup / windupTotal : 0;
    const strike = progress > 0 ? Math.sin(Math.min(1, progress / .8) * Math.PI) : 0;
    if (strike > .01) {
      const lunge = strike * size * .75;
      this.player.position.x += facing.x * lunge;
      this.player.position.y += facing.y * lunge;
      this.player.position.z += facing.z * lunge;
      this.player.scale.multiplyScalar(1 + strike * .24);
    }

    if (this.membrane) {
      if (this.membrane !== this._lastMembrane) {
        this._lastMembrane = this.membrane;
        this._membraneBaseColor = this.membrane.material.color.clone();
        this._membraneBaseOpacity = this.membrane.material.opacity;
      }
      const targetOpacity = p.mimicActive ? .07 : this._membraneBaseOpacity;
      this.membrane.material.opacity = THREE.MathUtils.lerp(this.membrane.material.opacity, targetOpacity, 1 - Math.exp(-dt * 7));
      if (p.mimicActive) this.membrane.material.color.lerp(this.ambient.color, 1 - Math.exp(-dt * 2.6));
      else this.membrane.material.color.copy(this._membraneBaseColor);
    }

    this.updateScanMarkers(state);
  }

  updateMotherClouds(state, time = 0, dt = .016) {
    const boss = state.entities.find(entity => entity.type === 'boss');
    const clouds = boss?.clouds || [];
    for (let i = 0; i < this.motherClouds.length; i++) {
      const object = this.motherClouds[i];
      const cloud = clouds[i];
      if (!cloud || !cloud.active) { object.visible = false; continue; }
      object.visible = true;
      object.position.set(cloud.x, cloud.y, cloud.z);
      animatePollutionCloud(object, time, cloud.radius);
    }
  }

  updateScanMarkers(state) {
    if (!this.scanMarkers) return;
    const p = state.player;
    const tier = p.scanActive ? instinctTier(p, 'sense') : null;
    if (!tier) { this.scanMarkers.count = 0; return; }
    const dummy = this._scanDummy || (this._scanDummy = new THREE.Object3D());
    let count = 0;
    const capacity = this.scanMarkers.instanceMatrix.count;
    for (const entity of state.entities) {
      if (count >= capacity) break;
      if (entity.dead) continue;
      if (!(ANIMALS.has(entity.type) || entity.type === 'echo' || entity.type === 'reactor' || entity.type === 'biofilm' || entity.type === 'boss')) continue;
      if (Math.hypot(entity.x - p.x, entity.y - p.y, entity.z - p.z) > tier.radius) continue;
      dummy.position.set(entity.x, entity.y, entity.z);
      dummy.lookAt(this.camera.position);
      const size = Math.max(1.3, entity.radius * 1.7);
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      this.scanMarkers.setMatrixAt(count, dummy.matrix);
      count++;
    }
    this.scanMarkers.count = count;
    this.scanMarkers.instanceMatrix.needsUpdate = true;
  }

  effect(type, position, color = 0xb9ef98, direction = null) {
    if (this.effects.length > 24) return;
    const material=glow(color,.5);
    const reach=Number.isFinite(position?.radius)?position.radius:0;
    // 带方向的爆发用锥体表现：尖端在发射点，开口朝向 dir，明确告诉玩家"打向哪边"。
    if(direction&&reach>0&&(type==='pulse'||type==='bite'||type==='jet')){
      const geometry=new THREE.ConeGeometry(.3,1,24,1,true);
      geometry.translate(0,-.5,0);
      geometry.rotateX(-Math.PI/2);
      const mesh=new THREE.Mesh(geometry,material);
      // 第一人称时玩家身体就是相机，锥体必须往前挪一点才看得见。
      const origin=direction?3.4:0;
      mesh.position.set(position.x+direction.x*origin,position.y+direction.y*origin,position.z+direction.z*origin);
      mesh.lookAt(position.x+direction.x*(origin+1),position.y+direction.y*(origin+1),position.z+direction.z*(origin+1));
      mesh.frustumCulled=false;
      this.scene.add(mesh);
      this.effects.push({mesh,life:0,duration:.5,reach,conical:true});
      return;
    }
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1,20,12),material);
    mesh.position.set(position.x,position.y,position.z);
    this.scene.add(mesh);
    this.effects.push({mesh,life:0,duration:type==='pulse'? .7:.4,max:type==='pulse'? 18:type==='dash'?5:2.4});
  }

  update(dt, state, menu = false) {
    this.syncWorld(state.world);
    this.clock += dt;
    const time=this.clock,p=state.player;
    const depth=depthFor(p.y),darkness=THREE.MathUtils.smoothstep(depth,150,1150);
    const exposure=Math.min(1,exposureAt(state.entities,p)/3);
    // 生态崩坏也把水弄浑：不用新写任何着色器，分级 Pass 已经在那里。
    const decay=Math.max(0,Math.min(1,-(state.oceanBalance||0)/100));
    this.localPollution=THREE.MathUtils.lerp(this.localPollution,Math.min(1,exposure+decay*.55),1-Math.exp(-dt*1.2));
    const biome=biomeAt(this.world,p);
    const biomeTint={
      nursery:0xb4ddd4,kelp:0xa7c79b,coral:0xffc9a2,
      abyss:0x7188e1,vents:0xbf876f,ruins:0x87b9c3,
    }[biome?.id]||0xa9cfda;
    const biomeGround={
      nursery:0x143339,kelp:0x243927,coral:0x4b3028,
      abyss:0x050c25,vents:0x301c17,ruins:0x152932,
    }[biome?.id]||0x07141c;
    this.ambientTarget.setHex(biomeTint);
    this.ambientGroundTarget.setHex(biomeGround);
    this.ambient.color.lerp(this.ambientTarget,1-Math.exp(-dt*.65));
    this.ambient.groundColor.lerp(this.ambientGroundTarget,1-Math.exp(-dt*.65));
    this.rimTarget.setHex(biome?.id==='coral'?0xffc59b:biome?.id==='vents'?0xe08f73:biome?.id==='abyss'?0x7899ff:0x78b9d0);
    this.rimLight.color.lerp(this.rimTarget,1-Math.exp(-dt*.55));
    this.environmentColor.setHex(biome?.color||0x0b5365).lerp(this.surfaceColor,.34+(1-darkness)*.38);
    this.environmentColor.lerp(this.deepColor,darkness*.94);
    this.environmentColor.lerp(this.pollutionColor,this.localPollution*.3);
    this.scene.background.lerp(this.environmentColor,1-Math.exp(-dt*.4));
    this.scene.fog.color.copy(this.scene.background);
    this.scene.fog.density=.00225+darkness*.0076+this.localPollution*.0052;
    this.sun.intensity=depth>=1000?0:3.9*Math.exp(-depth/430);
    this.ambient.intensity=1.55*(1-darkness)+.28+.34*darkness;
    this.fillLight.intensity=.34*(1-darkness)+.08+.14*darkness;
    this.fillLight.color.lerp(this.ambient.color,1-Math.exp(-dt*.5));
    this.scene.environmentIntensity=.9*(1-darkness)+.2+.28*darkness;
    this.rimLight.intensity=depth>=1000?0:.72*Math.exp(-depth/460);
    this.sun.position.set(p.x+78,p.y+122,p.z-54);
    this.sun.target.position.set(p.x,p.y-18,p.z);
    this.rimLight.position.set(p.x-65,p.y+48,p.z+88);
    this.rimLight.target.position.set(p.x,p.y-12,p.z);
    const photophore=Math.max(0,Math.min(2,p.mutations?.photophore||0));
    const lamp=p.assimilations?.lureLamp||0;
    const lightStage=Math.max(0,Math.min(3,p.lifeStage||0));
    const ambientBioluminescence=[6,9,13,17][lightStage];
    this.playerLight.intensity=ambientBioluminescence+darkness*(12+lightStage*5)+photophore*(15+darkness*16)+lamp*60;
    this.playerLight.distance=16+lightStage*6+darkness*(15+lightStage*4)+photophore*9+lamp*24;
    this.playerLight.color.setHex(photophore?0x9ed4d9:0xa9c6c7);
    this.rays.visible=this.qualitySetting!=='low'&&depth>2&&depth<390&&p.y<WATER_SURFACE_Y-1.2;
    if(this.lightShaftMaterial)this.lightShaftMaterial.uniforms.time.value=time;

    this.motes.visible=this.qualitySetting!=='low'&&p.y<WATER_SURFACE_Y-.5;
    this.motes.material.opacity=.13+(1-darkness)*.105;
    this.surface.material.uniforms.time.value=time;
    this.surface.visible=depth<700;
    this.sky.material.uniforms.time.value=time;
    this.sky.position.set(this.camera.position.x,this.camera.position.y,this.camera.position.z);
    if(this.horizonHaze){
      this.horizonHaze.position.x=this.camera.position.x;
      this.horizonHaze.position.z=this.camera.position.z;
      this.horizonHaze.visible=depth<35;
    }
    for(const material of this.island?.userData.breezeMaterials||[]) {
      if(material.userData.shader)material.userData.shader.uniforms.uTime.value=time;
    }
    for(const [index,texture] of (this.island?.userData.shoreFoamTextures||[]).entries()) {
      texture.offset.x=time*(.014+index*.007);
      texture.offset.y=Math.sin(time*.12+index)*.04;
    }
    const seaBirds=this.island?.userData.seaBirds;
    if(seaBirds){
      for(const [index,bird] of seaBirds.userData.birds.entries()){
        const angle=time*bird.speed+bird.phase;
        this.islandBirdDummy.position.set(
          Math.cos(angle)*bird.radius,
          bird.height+Math.sin(time*.9+bird.phase*2)*1.2,
          Math.sin(angle)*bird.radius,
        );
        this.islandBirdDummy.rotation.set(Math.sin(angle)*.08,-angle+Math.PI*.5,Math.sin(time*2.4+bird.phase)*.16);
        this.islandBirdDummy.scale.setScalar(bird.scale);
        this.islandBirdDummy.updateMatrix();
        seaBirds.setMatrixAt(index,this.islandBirdDummy.matrix);
      }
      seaBirds.instanceMatrix.needsUpdate=true;
    }
    const industrialSmoke=this.island?.userData.industrialSmoke,smokeSeeds=this.island?.userData.industrialSmokeSeeds;
    if(industrialSmoke&&smokeSeeds){
      const positions=industrialSmoke.geometry.attributes.position;
      for(let index=0;index<smokeSeeds.length;index++){
        const seed=smokeSeeds[index],age=(seed.phase+time*.018)%1;
        positions.setXYZ(
          index,
          -11+age*(6.5+seed.lift*2.2)+Math.sin(time*.16+index)*age*2.4+seed.drift*age*3.5,
          seed.baseY+age*(17+seed.lift*8),
          -8+seed.drift*age*8+Math.cos(time*.12+index*.7)*age*2.2,
        );
      }
      positions.needsUpdate=true;
      industrialSmoke.material.opacity=.07+(1-Math.min(1,depth/900))*.09;
    }
    if(this.island.userData.radar)this.island.userData.radar.rotation.y=time*.72;
    if(this.island.userData.beacon)this.island.userData.beacon.material.emissiveIntensity=1.35+Math.sin(time*2.2)*.65;
    animateBackgroundSchools(this.backgroundSchools,time,this.qualitySetting==='low');
    animateSubseaOutfall(this.outfall,time);
    animateSurfaceFleet(this.patrolFleet,time,humanBoatStates(this.world,state.time),p);
    animateResearchWreck(this.researchWreck,time);
    this.humanPanic=Math.max(0,this.humanPanic-dt*.11);
    const humanAlert=Math.min(1,(state.expedition?.parasiteNodes?.length||0)/3+(state.mode==='won'&&state.ending==='parasite'?.35:0)+this.humanPanic);
    const islandFocus=islandCenter(this.world),islandDistance=Math.hypot(p.x-islandFocus.x,p.z-islandFocus.z);
    const nearSurfaceVisible=depth<72;
    if(this.patrolFleet)this.patrolFleet.visible=nearSurfaceVisible;
    if(this.island.userData.humanSettlement)this.island.userData.humanSettlement.visible=(islandDistance<170&&depth<120)||this.finale?.type==='parasite';
    if(this.island.userData.humanSettlement?.visible)animateHumanSettlement(this.island.userData.humanSettlement,time,humanAlert);
    if(this.island.userData.streetPopulation)this.island.userData.streetPopulation.visible=(islandDistance<145&&depth<125)||this.finale?.type==='parasite';
    if(this.island.userData.streetPopulation?.visible)animateHumanSettlement(this.island.userData.streetPopulation,time,humanAlert);
    if(bodyPlanFor(p.level)!==this.bodyPlan) {
      disposeObject(this.player);
      this.bodyPlan=bodyPlanFor(p.level);this.lastBranches='';this.lastAssimilations='';this.assimilatedOrgans=null;this.apexBody=null;
      this.player=this.makeCell(p.level);this.scene.add(this.player);
    }
    this.nucleus.material.emissiveIntensity=.4+p.radiation*.013;
    animateHabitatDetails(this.habitat,time);
    if(this.microfauna){
      // This is a microscopy layer for the single-cell opening, not a second
      // screen of confetti visible from the body of a multi-metre predator.
      setMicrofaunaQuality(this.microfauna,this.qualitySetting,p.lifeStage??0);
      this.microfauna.visible=!menu&&(p.lifeStage??0)<=1&&p.y<WATER_SURFACE_Y-.25;
      if(this.microfauna.visible)animateMicrofauna(this.microfauna,time,dt,p);
    }
    this.motes.position.set(p.x,p.y,p.z);
    this.motes.visible=!menu&&p.y<WATER_SURFACE_Y-.5&&(p.lifeStage??0)<=1;
    this.motes.material.opacity=.1+(1-darkness)*.08;
    this.updateMutations(p.branches,p.level,p.mutations);
    const assimilationKey=JSON.stringify([p.apex,p.assimilations,this.bodyPlan]);
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
    this.player.position.set(p.x,p.y,p.z);
    const size = playerVisualScale(p);
    const phenotype=this.bodyPlan>=3?this.player.userData.phenotypeScale:null;
    const breathing=this.reducedMotion?1:1+Math.sin(time*2.1)*.013;
    this.player.scale.set(size*breathing*(phenotype?.x||1),size*breathing*(phenotype?.y||1),size*breathing*(phenotype?.z||1));
    this.membrane.scale.y=this.membrane.userData.restScaleY*(1+Math.sin(time*2.1)*.035);
    this.organelles.rotation.y=this.bodyPlan===1?time*.05:0;
    if(this.cellInner)this.cellInner.rotation.y=this.bodyPlan===1?time*.026:0;
    if(this.cytoplasm)this.cytoplasm.rotation.y=-time*.025;
    if(this.cellDust)this.cellDust.rotation.y=time*.055;
    if(this.bodyPlan===1&&this.nucleus?.userData.pulseScale){
      const pulse=1+Math.sin(time*1.65)*.018,base=this.nucleus.userData.pulseScale;
      this.nucleus.scale.set(base.x*pulse,base.y*pulse,base.z*pulse);
    }
    this.cilia.rotation.y=Math.sin(time*.7)*.035;
    for(let i=0;i<this.flagella.length;i++) {
      this.flagella[i].rotation.y=Math.sin(time*2.4+i)*.12;
      this.flagella[i].rotation.x=Math.cos(time*1.9+i)*.07;
    }
    for(const tail of this.mutationFlagella) {
      tail.rotation.y=Math.sin(time*3.4+tail.userData.phase)*.14;
      tail.rotation.x=Math.cos(time*2.6+tail.userData.phase)*.08;
    }
    const visual=this.mutationVisuals;
    if(visual.photophore)visual.photophore.material.emissiveIntensity=1.4+Math.sin(time*2.4)*.25;
    if(visual.halo)visual.halo.material.opacity=.19+Math.sin(time*2.4)*.045;
    if(visual.radiotrophy)visual.radiotrophy.material.emissiveIntensity=.45+Math.min(1.8,p.radiation*.022);
    if(visual.repair)visual.repair.material.emissiveIntensity=.8+Math.sin(time*1.6)*.25;
    this.player.rotation.order='YXZ';
    const desiredYaw=menu?-.35+Math.sin(time*.18)*.2:this.yaw;
    const yawDelta=THREE.MathUtils.euclideanModulo(desiredYaw-this.player.rotation.y+Math.PI,TAU)-Math.PI;
    this.player.rotation.y+=yawDelta*(1-Math.exp(-dt*8));
    this.player.rotation.x=THREE.MathUtils.lerp(this.player.rotation.x,menu?0:-this.pitch,1-Math.exp(-dt*7));
    const lateral=(p.vx||0)*Math.cos(this.yaw)-(p.vz||0)*Math.sin(this.yaw);
    this.player.rotation.z=THREE.MathUtils.lerp(this.player.rotation.z,this.reducedMotion?0:THREE.MathUtils.clamp(-lateral*.018,-.12,.12),1-Math.exp(-dt*4));
    this.updateInstinctVisuals(dt,state);
    this.updateMotherClouds(state,time,dt);
    this.playerLight.position.copy(this.player.position);
    const trailData=this.motionTrail.userData,trailPositions=this.motionTrail.geometry.attributes.position,trailLife=this.motionTrail.geometry.attributes.aLife;
    const playerSpeed=Math.hypot(p.vx||0,p.vy||0,p.vz||0);
    if(!menu&&playerSpeed>.55&&this.qualitySetting!=='low'){
      trailData.accumulator+=dt*(4+playerSpeed*.75);
      const inverse=1/playerSpeed;
      while(trailData.accumulator>=1){
        trailData.accumulator-=1;
        const particle=trailData.particles[trailData.cursor],index=trailData.cursor;
        trailData.cursor=(trailData.cursor+1)%trailData.particles.length;
        particle.age=0;particle.life=.55+Math.random()*.65;
        particle.vx=-(p.vx||0)*inverse*.42+(Math.random()-.5)*.22;
        particle.vy=-(p.vy||0)*inverse*.42+(Math.random()-.5)*.12+.035;
        particle.vz=-(p.vz||0)*inverse*.42+(Math.random()-.5)*.22;
        trailPositions.setXYZ(
          index,
          p.x-(p.vx||0)*inverse*.85+(Math.random()-.5)*.72,
          p.y-(p.vy||0)*inverse*.85+(Math.random()-.5)*.42,
          p.z-(p.vz||0)*inverse*.85+(Math.random()-.5)*.72,
        );
      }
    }
    for(const particle of trailData.particles){
      particle.age+=dt;
      const strength=Math.max(0,1-particle.age/particle.life);
      trailLife.setX(particle.index,strength);
      if(strength>0){
        trailPositions.setXYZ(
          particle.index,
          trailPositions.getX(particle.index)+particle.vx*dt,
          trailPositions.getY(particle.index)+(particle.vy+.055*particle.age)*dt,
          trailPositions.getZ(particle.index)+particle.vz*dt,
        );
      }
    }
    trailPositions.needsUpdate=true;trailLife.needsUpdate=true;
    this.motionTrail.visible=!menu&&this.qualitySetting!=='low';
    this.player.visible=!this.firstPerson || menu;
    const active=new Set();
    this.pickupCounts.food=this.pickupCounts.isotope=this.pickupCounts.marineSnow=0;
    for(const entity of state.entities) {
      const pickupMeshes=this.pickupBatches[entity.type];
      if(pickupMeshes) {
        const index=this.pickupCounts[entity.type]++;
        const drift=entity.type==='marineSnow'?0:Math.sin(time*.65+entity.seed)*.045;
        this.pickupDummy.position.set(entity.x,entity.y+drift,entity.z);
        this.pickupDummy.rotation.set(Math.sin(time*.16+entity.seed)*.3,time*.12+entity.seed,Math.cos(time*.13+entity.seed)*.2);
        this.pickupDummy.scale.setScalar(.8+Math.sin(entity.seed*3)*.2);this.pickupDummy.updateMatrix();
        for(const mesh of pickupMeshes)mesh.setMatrixAt(index,this.pickupDummy.matrix);
        continue;
      }
      active.add(entity.id);
      let object=this.objects.get(entity.id);
      if(object&&(object.userData.type!==entity.type||object.userData.radius!==entity.radius||(ANIMALS.has(entity.type)&&object.userData.visualVariant!==(entity.variant||'normal')))) {
        disposeObject(object);this.objects.delete(entity.id);object=null;
      }
      object=object||this.makeEntity(entity);
      this.animalTarget.set(entity.x,entity.y,entity.z);
      if((ANIMALS.has(entity.type)||entity.type==='echo')&&!menu&&object.userData.renderInitialized){
        const snapDistance=Math.max(3,entity.radius*2.2);
        if(object.position.distanceToSquared(this.animalTarget)>snapDistance*snapDistance){
          object.position.copy(this.animalTarget);
        }else{
          object.position.lerp(this.animalTarget,1-Math.exp(-dt*32));
        }
      }else{
        object.position.copy(this.animalTarget);
      }
      object.userData.renderInitialized=true;
      if(entity.type==='reactor')object.rotation.y=reactorEntranceYaw(entity);
      const entityDistance=Math.hypot(entity.x-p.x,(entity.y-p.y)*.55,entity.z-p.z);
      const animalVisibility=(!ANIMALS.has(entity.type)&&entity.type!=='echo')||menu||entityDistance<(
        ['whale','oarfish'].includes(entity.type)?145:
          ['shark','squid','cuttlefish'].includes(entity.type)?110:
            ['jelly','ray','turtle'].includes(entity.type)?92:
              entity.type==='echo'?112:74
      );
      object.visible=(!['diver','islandNode'].includes(entity.type)||islandDistance<155)&&animalVisibility;
      if(ANIMALS.has(entity.type)) {
        const speed=Math.hypot(entity.vx||0,entity.vy||0,entity.vz||0),phase=time+(object.userData.seed||0);
        let heading=speed>.03?Math.atan2(-(entity.vx||0),-(entity.vz||0)):(entity.heading||0);
        let pitch=speed>.03?Math.asin(THREE.MathUtils.clamp((entity.vy||0)/speed,-.7,.7)):0;
        if(menu&&entity.type==='whale') {
          object.position.set(p.x+4+Math.sin(time*.06)*12,p.y-4.5+Math.sin(time*.17)*.3,p.z-25);
          heading=-Math.PI/2+.12*Math.sin(time*.1);pitch=.015;
        } else if(menu&&entity.type==='shark') {
          object.position.x=p.x-18+Math.sin(time*.075+object.userData.seed)*12;
          object.position.y=p.y-8;object.position.z=p.z-29;
          heading=Math.PI/2+.15*Math.cos(time*.1);pitch=0;
        } else if(menu) {
          object.position.x+=Math.sin(time*.21+object.userData.seed)*.8;
          object.position.y+=Math.sin(time*.3+object.userData.seed)*.25;
        }
        let turn=0;
        if(entity.type==='jelly') {
          object.rotation.set(Math.sin(phase*.4)*.025,time*.025+object.userData.seed,0);
        } else {
          object.rotation.order='YXZ';
          if(!object.userData.motionInitialized){object.rotation.y=heading;object.rotation.x=pitch;object.userData.motionInitialized=true;}
          turn=THREE.MathUtils.euclideanModulo(heading-object.rotation.y+Math.PI,TAU)-Math.PI;
          object.rotation.y+=turn*(1-Math.exp(-dt*3));
          object.rotation.x=THREE.MathUtils.lerp(object.rotation.x,entity.type==='crab'?0:pitch,1-Math.exp(-dt*3));
        }
        animateMarineAnimal(object,time,speed,dt,turn);
      } else if(entity.type==='reactor') {
        animateReactor(object,entity,time,dt);
      } else if(entity.type==='biofilm') {
        animateBiofilm(object,entity,time,dt);
      } else if(entity.type==='bloom') {
        animatePlanktonBloom(object,entity,time+entity.seed);
      } else if(entity.type==='diver') {
        const speed=Math.hypot(entity.vx||0,entity.vy||0,entity.vz||0);
        object.rotation.y=THREE.MathUtils.lerp(object.rotation.y,entity.heading||0,1-Math.exp(-dt*2.8));
        if(Math.abs(entity.vy||0)>.05)object.rotation.x=THREE.MathUtils.lerp(object.rotation.x,-Math.asin(Math.max(-.45,Math.min(.45,entity.vy/Math.max(speed,.1)))),1-Math.exp(-dt*2));
        animateDiverEntityModel(object,time,speed);
      } else if(entity.type==='tendril') {
        animateTendril(object.userData.tendril||object, entity, time, dt);
      } else if(entity.type==='boss') {
        animateEmissionsMother(object.userData.mother||object, entity, time, dt);
      } else if(entity.type==='echo') {        const speed=Math.hypot(entity.vx||0,entity.vy||0,entity.vz||0);
        const heading=speed>.03?Math.atan2(-(entity.vx||0),-(entity.vz||0)):(entity.heading||0);
        const pitch=speed>.03?Math.asin(THREE.MathUtils.clamp((entity.vy||0)/speed,-.6,.6)):0;
        object.rotation.order='YXZ';
        object.rotation.y=THREE.MathUtils.lerp(object.rotation.y,heading,1-Math.exp(-dt*2.2));
        object.rotation.x=THREE.MathUtils.lerp(object.rotation.x,pitch,1-Math.exp(-dt*2.2));
        animateAberrantEchoModel(object,time,speed,entity);
        this.updateEchoTether(entity,time,state);
      } else if(entity.type==='islandNode') {
        animateParasiteNodeModel(object,time,entity);
      } else if(entity.type==='food'||entity.type==='isotope'||entity.type==='marineSnow') {
        object.position.y+=Math.sin(time*1.2+object.userData.seed)*.17;
        object.rotation.y=time*(entity.type==='marineSnow'?.13:.5)+object.userData.seed;
      } else if(entity.type==='boss') {
        object.rotation.y=time*.13;
        object.rotation.z=Math.sin(time*.2)*.15;
      } else if(entity.type==='predator'||entity.type==='drone') {
        object.lookAt(p.x,p.y,p.z);
        object.rotation.z=Math.sin(time+object.userData.seed)*.12;
      }
    }
    for(const [id,object] of this.objects) if(!active.has(id)) {
      const tether=this.echoTethers.get(id);
      if(tether) {
        this.scene.remove(tether);
        tether.geometry.dispose();
        tether.material.dispose();
        this.echoTethers.delete(id);
      }
      disposeObject(object);this.objects.delete(id);
    }
    for(const type of ['food','isotope','marineSnow'])for(const mesh of this.pickupBatches[type]) {
      mesh.count=this.pickupCounts[type];mesh.instanceMatrix.needsUpdate=true;
    }
    for(let i=this.effects.length-1;i>=0;i--) {
      const effect=this.effects[i];effect.life+=dt;
      const f=effect.life/effect.duration;
      if(effect.conical){
        const grow=Math.min(1,f*1.5);
        effect.mesh.scale.set(effect.reach*grow,effect.reach*grow,effect.reach*grow);
      } else effect.mesh.scale.setScalar(1+effect.max*f);
      effect.mesh.material.opacity=(1-f)*(effect.conical?.26:.32);
      if(f>=1){this.scene.remove(effect.mesh);effect.mesh.geometry.dispose();effect.mesh.material.dispose();this.effects.splice(i,1);}
    }
    const cameraMode=menu?'menu':this.firstPerson?'first':'third';
    const changedCamera=this.cameraMode!==cameraMode;
    this.cameraMode=cameraMode;
    if(changedCamera){this.cameraYaw=this.yaw;this.cameraPitch=this.pitch;}
    this.cameraYaw=this.yaw;this.cameraPitch=this.pitch;
    const targetFov=this.reducedMotion?60:this.firstPerson?68:58+(p.dashTime>0?6:0);
    this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,targetFov,1-Math.exp(-dt*5));
    this.camera.updateProjectionMatrix();
    if(menu) {
      const menuDistance=playerFollowDistance(p)+1.25;
      const focusHeight=p.lifeStage===0?.065:.32;
      this.target.set(p.x,p.y+focusHeight,p.z);
      this.tmp.set(
        p.x+Math.sin(time*.08)*menuDistance*.055,
        p.y+Math.sin(time*.07)*menuDistance*.035+.24,
        p.z+menuDistance,
      );
      this.camera.position.lerp(this.tmp,1-Math.exp(-dt*3));
      this.camera.lookAt(this.target);
      this.player.scale.multiplyScalar(1.45);
    } else if(this.firstPerson) {
      const openWaterSurface=islandSurfaceAt(this.world,p.x,p.z)===null&&p.y>=PLAYER_MAX_Y-.08;
      // At the surface the player's body stays submerged, while the eye point
      // lifts just above the moving mesh to avoid a half-plane water clip.
      // The surface shader displaces crests by roughly 0.4 world units. Keep the
      // first-person eye above the highest crest so a translucent triangle
      // never slices across the camera when the cell floats at the ocean line.
      this.camera.position.set(p.x,openWaterSurface?WATER_SURFACE_Y+.72:p.y+.25,p.z);
      this.target.set(p.x-Math.sin(this.cameraYaw)*Math.cos(this.cameraPitch)*10,this.camera.position.y-Math.sin(this.cameraPitch)*10,p.z-Math.cos(this.cameraYaw)*Math.cos(this.cameraPitch)*10);
      this.camera.lookAt(this.target);
    } else {
      // Attachment views need enough separation to keep the host or pressure
      // vessel out of the near plane even while the free-swimming cell is shown
      // at a deliberately close microscopic scale.
      const distance=p.attachment
        ?Math.max(8.4,playerFollowDistance(p))
        :playerFollowDistance(p);
      this.tmp.set(p.x+Math.sin(this.cameraYaw)*Math.cos(this.cameraPitch)*distance,p.y+1.7+Math.sin(this.cameraPitch)*distance,p.z+Math.cos(this.cameraYaw)*Math.cos(this.cameraPitch)*distance);
      this.tmp.y=Math.max(2,this.tmp.y);
      const cameraGround=islandSurfaceAt(this.world,this.tmp.x,this.tmp.z);
      const playerGround=islandSurfaceAt(this.world,p.x,p.z);
      const inUnderwaterPassage=playerGround!==null&&p.y<playerGround-4&&(islandDeepPassageAt(this.world,p.x,p.z)||p.y<36);
      if(cameraGround!==null&&!inUnderwaterPassage)this.tmp.y=Math.max(this.tmp.y,cameraGround+1.15);
      if(!inUnderwaterPassage)this.tmp.y=Math.max(this.tmp.y,seabedHeight(this.tmp.x,this.tmp.z)+1.1+size*.25);
      this.camera.position.copy(this.tmp);
      this.target.set(p.x,p.y+(p.lifeStage===0?.065:.32),p.z);
      this.cameraObstructed=false;
      // Pull the camera toward the player when a pressure vessel or the current
      // host blocks it. Check the interpolated position so orbiting cannot pass
      // through a solid shell between two otherwise clear camera positions.
      this.cameraRayDirection.subVectors(this.camera.position,this.target);
      const cameraDistance=this.cameraRayDirection.length();
      if(cameraDistance>.1) {
        this.cameraRayDirection.divideScalar(cameraDistance);
        this.cameraRay.set(this.target,this.cameraRayDirection);
        this.cameraRay.near=.06;this.cameraRay.far=cameraDistance+.3;
        const blockers=[];
        for(const entity of state.entities) {
          if(!(entity.type==='reactor'||entity.id===p.attachment?.entityId&&HOST_TYPES_FOR_CAMERA.has(entity.type)))continue;
          if(Math.hypot(entity.x-p.x,entity.y-p.y,entity.z-p.z)>24)continue;
          const object=this.objects.get(entity.id);
          if(!object)continue;
          object.updateWorldMatrix(true,true);
          object.traverse(child=>{if(child.isMesh&&!child.material?.transparent)blockers.push(child);});
        }
        this.outfall?.traverse(child=>{
          if(child.isMesh&&!child.material?.transparent)blockers.push(child);
        });
        const hit=this.cameraRay.intersectObjects(blockers,false)[0];
        const blocked=hit&&hit.distance<cameraDistance+.3;
        // Camera obstruction changes can alternate on adjacent frames around a
        // hull edge. Smooth outward recovery and require a short occlusion hold
        // before hiding the player; otherwise attachment views visibly strobe.
        this.cameraOcclusionTime=blocked
          ?Math.min(1,this.cameraOcclusionTime+dt*12)
          :Math.max(0,this.cameraOcclusionTime-dt*6);
        const clearDistance=blocked?Math.max(.24,hit.distance-.35):cameraDistance;
        if(this.cameraSmoothDistance<=.01)this.cameraSmoothDistance=clearDistance;
        this.cameraSmoothDistance=THREE.MathUtils.lerp(
          this.cameraSmoothDistance,
          clearDistance,
          1-Math.exp(-dt*(blocked?28:4.2)),
        );
        this.camera.position.copy(this.target).addScaledVector(this.cameraRayDirection,this.cameraSmoothDistance);
        this.cameraObstructed=Boolean(blocked);
        if(this.cameraObstructed&&this.cameraOcclusionTime>.16&&this.cameraSmoothDistance<size*1.25)this.player.visible=false;
      }else this.cameraOcclusionTime=Math.max(0,this.cameraOcclusionTime-dt*6);
      this.camera.lookAt(this.target);
    }
    // 屏幕震动在相机定位之后叠加，避免与跟随插值互相干扰。
    if (this.shakeAmount > 0) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.6);
      const strength = this.shakeAmount * this.shakeAmount * 0.85;
      this.camera.position.x += (Math.random() - .5) * strength;
      this.camera.position.y += (Math.random() - .5) * strength;
      this.camera.position.z += (Math.random() - .5) * strength;
    }
    if(this.finale&&!this.finale.done) {
      const f=this.finale;
      f.elapsed=Math.max(f.elapsed+dt,(performance.now()-f.startedAt)/1000);
      const t=Math.min(1,f.elapsed/5.5),core=this.world.core;
      if(f.type==='parasite') {
        const pulse=Math.sin(t*Math.PI*3)*.5+.5;
        const island=islandCenter(this.world);
        this.player.visible=true;
        this.player.position.lerp(this.player.position,1-Math.exp(-dt*2));
        this.playerLight.position.copy(this.player.position);
        this.playerLight.intensity=45+pulse*35;
        this.playerLight.distance=110;
        if(this.island.userData.radar)this.island.userData.radar.rotation.y+=dt*(1.2+pulse*3);
        if(this.island.userData.beacon)this.island.userData.beacon.material.emissiveIntensity=1.5+pulse*4;
        this.island.position.y=this.island.userData.restY;
        this.island.rotation.z=Math.sin(t*Math.PI)*.018;
        const orbit=-.85+t*.48,radius=108-t*20;
        this.camera.position.set(island.x+Math.sin(orbit)*radius,WATER_SURFACE_Y+24+t*8,island.z+Math.cos(orbit)*radius);
        this.camera.lookAt(island.x,WATER_SURFACE_Y+6,island.z);
        this.scene.fog.density=.0028;
        if(t>=1)f.done=true;
      } else {
        const sink=THREE.MathUtils.smoothstep(t,.25,.92),pulse=Math.sin(Math.min(1,t*1.3)*Math.PI);
        this.player.visible=true;
        this.player.position.lerpVectors(f.start,new THREE.Vector3(core.x,core.y-4,core.z+10),Math.min(1,t*2.2));
        this.player.rotation.set(-.08,Math.sin(t*Math.PI*2)*.035,Math.sin(t*Math.PI*2)*.06);
        this.player.scale.copy(f.scale).multiplyScalar(1+1.7*pulse);
        this.playerLight.position.copy(this.player.position);
        this.playerLight.intensity=72+Math.sin(t*Math.PI*5)*10;
        this.playerLight.distance=92;
        this.island.position.y=this.island.userData.restY-sink*sink*74;
        this.island.rotation.z=sink*.52;
        this.island.rotation.x=sink*.18;
        const orbit=.52+t*.2,radius=118-t*32;
        this.camera.position.set(core.x+Math.sin(orbit)*radius,core.y+16+Math.sin(t*Math.PI)*4,core.z+Math.cos(orbit)*radius);
        this.camera.lookAt(core.x,core.y+1-sink*3,core.z);
        this.scene.fog.density=.0048;
        if(t>=1)f.done=true;
      }
    }
    this.sky.visible=this.camera.position.y>WATER_SURFACE_Y-.2&&depth<350;
    this.post.environment?.(darkness,this.localPollution,this.camera.position.y<WATER_SURFACE_Y-.12?1:0);
    this.post.render(time);
  }

  consumeNearestHuman(position) {
    const groups=[
      this.island?.userData?.humanSettlement,
      this.island?.userData?.streetPopulation,
    ].filter(Boolean);
    if(!groups.length)return false;
    const nearest=groups
      .map(group=>({group,distance:nearestHumanDistance(group,position)}))
      .sort((a,b)=>a.distance-b.distance)[0];
    if(!nearest||!Number.isFinite(nearest.distance))return false;
    const consumed=consumeClosestHuman(nearest.group,position);
    if(consumed)this.humanPanic=1;
    return consumed;
  }

  project(position) {
    const vector = new THREE.Vector3(position.x,position.y,position.z).project(this.camera);
    return { x:(vector.x*.5+.5)*innerWidth,y:(-.5*vector.y+.5)*innerHeight,visible:vector.z<1 && vector.z>-1 && Math.abs(vector.x)<.9 && Math.abs(vector.y)<.8 };
  }
}
