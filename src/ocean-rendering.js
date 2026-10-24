import * as THREE from '../node_modules/three/build/three.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from '../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import { createHumanSettlement, createIslandPopulation } from './human-models.js';
import { WATER_SURFACE_Y } from './biology.js';
import { islandCenter, islandPoint, islandShorePoint, islandSurfaceAt, islandVisualSurfaceAt, islandTreeLayout, islandHouseLayout, islandRoadLayout, ISLAND_RADIUS_X, ISLAND_RADIUS_Z } from './island.js';
import { worldRandom } from './world.js';
import { ART_PALETTE, createSurfaceMaps } from './visual-materials.js';
import { ISLAND_MARKS, createSignBoard, createWallNotice, signTexture } from './japanese-marks.js';
import { createGreenhouses, createGuardrails, createPostBoxes, createRicePaddies, createRooftopAppliances, createShopRow, createStoneLanterns, createUtilityPoles, createVendingMachines } from './island-detail.js';

const TAU=Math.PI*2;

export function createOceanRendering(renderer,scene,camera) {
  // A tiny procedural scene provides soft IBL without shipping an HDR file.
  const sky=new THREE.Scene();
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,uniforms:{},
    vertexShader:'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 v;void main(){float h=normalize(v).y;vec3 c=mix(vec3(.018,.055,.078),vec3(.48,.72,.76),smoothstep(-.38,1.,h));float sun=pow(max(0.,dot(normalize(v),normalize(vec3(.3,.85,-.4)))),70.);gl_FragColor=vec4(c+vec3(1.,.84,.62)*sun*2.1,1.);}' });
  const geometry=new THREE.SphereGeometry(10,24,16);sky.add(new THREE.Mesh(geometry,material));
  const pmrem=new THREE.PMREMGenerator(renderer),environment=pmrem.fromScene(sky,.04);
  scene.environment=environment.texture;scene.environmentIntensity=.88;
  pmrem.dispose();material.dispose();geometry.dispose();
  const composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.3,.52,.9);
  composer.addPass(bloom);
  const grade=new ShaderPass({
    uniforms:{tDiffuse:{value:null},uAmount:{value:.72},uTime:{value:0},uDepth:{value:0},uPollution:{value:0},uUnderwater:{value:0}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform sampler2D tDiffuse;uniform float uAmount;uniform float uTime;uniform float uDepth;uniform float uPollution;uniform float uUnderwater;varying vec2 vUv;
      void main(){vec4 source=texture2D(tDiffuse,vUv);vec3 color=source.rgb;
      float luma=dot(color,vec3(.2126,.7152,.0722));
      float shadow=1.-smoothstep(.08,.52,luma);
      float highlight=smoothstep(.58,.96,luma);
      float edgeDistance=distance(vUv,vec2(.5));
      float farVeil=smoothstep(.18,.72,edgeDistance);
      vec2 lens=(vUv-.5)*uUnderwater*(.00008+uDepth*.00013);
      float fringe=smoothstep(.16,.7,edgeDistance);
      color.r=mix(color.r,texture2D(tDiffuse,vUv+lens).r,fringe*.16);
      color.b=mix(color.b,texture2D(tDiffuse,vUv-lens).b,fringe*.16);
      vec3 waterTint=mix(vec3(.045,.185,.19),vec3(.006,.025,.048),uDepth);
      color=mix(color,color*vec3(.91,1.018,1.055)+waterTint*(.032-.012*luma),uUnderwater*(.22+uDepth*.11));
      color=mix(color,color*vec3(.91,1.02,1.04),uPollution*.22);
      color.r=mix(color.r,color.r*.988+color.g*.012,farVeil*uUnderwater*.12);
      color.b=mix(color.b,color.b*1.014+color.r*.006,farVeil*uUnderwater*.08);
      color=mix(vec3(luma),color,1.09);
      color*=mix(vec3(.94,.99,1.05),vec3(1.055,1.005,.925),highlight);
      color+=vec3(-.003,.003,.009)*shadow+vec3(.003,.010,.008)*(1.-uDepth)*uUnderwater*shadow;
      color=(color-.5)*1.055+.5;
      float edge=smoothstep(.32,.76,edgeDistance);
      color*=1.-edge*(uAmount*.19+uUnderwater*.065);
      color+=mix(vec3(-.002,.004,.008),vec3(.003,.012,.018),1.-uDepth)*edge*uUnderwater*.08;
      float grain=fract(sin(dot(gl_FragCoord.xy+uTime*.07,vec2(12.9898,78.233)))*43758.5453)-.5;
      color+=grain*(.0012+uDepth*.0008);
      gl_FragColor=vec4(color,source.a);}`
  });
  composer.addPass(grade);composer.addPass(new OutputPass());
  let quality='medium';
  renderer.info.autoReset=false;
  return {
    composer,bloom,
    quality(value){quality=value;bloom.strength=value==='high'?.4:value==='low'?.16:.3;},
    environment(depth=0,pollution=0,underwater=0){
      grade.uniforms.uDepth.value=THREE.MathUtils.clamp(depth,0,1);
      grade.uniforms.uPollution.value=THREE.MathUtils.clamp(pollution,0,1);
      grade.uniforms.uUnderwater.value=THREE.MathUtils.clamp(underwater,0,1);
    },
    resize(){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(innerWidth,innerHeight);},
    render(time=0){renderer.info.reset();grade.uniforms.uTime.value=time;if(quality==='low')renderer.render(scene,camera);else composer.render();},
    dispose(){composer.dispose();bloom.dispose();grade.dispose?.();environment.dispose();}
  };
}

export function createSkyDome() {
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{time:{value:0}},
    vertexShader:`varying vec3 direction;void main(){direction=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float time;varying vec3 direction;
      float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
      float fbm(vec2 p){float n=0.,a=.55;mat2 r=mat2(.8,-.6,.6,.8);
        for(int i=0;i<5;i++){n+=noise(p)*a;p=r*p*2.06+11.3;a*=.49;}return n;}
      void main(){
        vec3 dir=normalize(direction);
        float h=clamp(dir.y*.5+.5,0.,1.);
        vec3 horizon=vec3(.46,.72,.77);
        vec3 haze=vec3(.24,.43,.5);
        vec3 zenith=vec3(.025,.16,.32);
        vec3 color=mix(horizon,zenith,pow(h,1.18));
        color=mix(haze,color,smoothstep(.43,.72,h));
        vec2 cloudUv=vec2(atan(dir.z,dir.x)*1.85+dir.x*2.1,dir.y*5.1);
        float weather=fbm(cloudUv+vec2(time*.0025,0.))*.67+
          fbm(cloudUv*2.15+vec2(3.8,1.2)-vec2(time*.004,0.))*.33;
        float cloud=smoothstep(.53,.76,weather)*smoothstep(.015,.22,dir.y);
        float wisps=smoothstep(.66,.9,fbm(cloudUv*3.8+vec2(2.1,7.3)))*smoothstep(.08,.52,dir.y);
        vec3 cloudColor=mix(vec3(.52,.65,.69),vec3(.9,.82,.69),smoothstep(.1,.72,dir.y));
        color=mix(color,cloudColor,cloud*.53+wisps*.11);
        float sun=max(0.,dot(dir,normalize(vec3(.35,.62,-.7))));
        color+=vec3(1.,.74,.46)*(pow(sun,900.)*3.4+pow(sun,13.)*.2);
        color+=vec3(.28,.42,.4)*exp(-abs(dir.y)*20.)*(.055+cloud*.04);
        gl_FragColor=vec4(color,1.);
      }`
  });
  const sky=new THREE.Mesh(new THREE.SphereGeometry(680,32,20),material);
  sky.name='above-water-sky';sky.frustumCulled=false;sky.renderOrder=-20;
  return sky;
}

export function createHorizonHaze() {
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,fog:false,
    uniforms:{color:{value:new THREE.Color(0xa9d0d1)}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 color;varying vec2 vUv;
      void main(){
        float band=exp(-pow((vUv.y-.42)*3.1,2.));
        float broken=.82+.18*sin(vUv.x*48.+sin(vUv.x*17.)*2.);
        gl_FragColor=vec4(color,band*.17*broken);
      }`,
  });
  const haze=new THREE.Mesh(new THREE.CylinderGeometry(700,700,34,64,1,true),material);
  haze.name='soft-sea-horizon';
  haze.position.y=WATER_SURFACE_Y+8;
  haze.renderOrder=-8;
  return haze;
}

function islandGroundMaps(seed) {
  return createSurfaceMaps('island',{size:160,repeat:1.38,seed:seed^0x91fbe3,normalStrength:.82});
}

function clamp01(value) { return Math.max(0,Math.min(1,value)); }

// 把一组静态小物件按材质合并成几个网格。
// 岛上的日式细节（电线杆、护栏、石灯笼…）加起来有几百个网格，
// 逐个画会白白吃掉几百个 draw call；合并后只剩十来个。
function mergeStaticGroup(root) {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();
  const batches = new Map();
  root.traverse(node => {
    if (!node.isMesh || node.isInstancedMesh || node.userData.keepSeparate) return;
    if (node.material?.transparent) return;
    const geometry = node.geometry.clone();
    geometry.applyMatrix4(inverseRoot.clone().multiply(node.matrixWorld));
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!normalized.attributes.uv) {
      normalized.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(normalized.attributes.position.count * 2), 2));
    }
    for (const attribute of Object.keys(normalized.attributes)) {
      if (!['position', 'normal', 'uv'].includes(attribute)) normalized.deleteAttribute(attribute);
    }
    if (!normalized.attributes.normal) normalized.computeVertexNormals();
    const key = node.material.uuid;
    if (!batches.has(key)) batches.set(key, { material: node.material, geometries: [], nodes: [] });
    const batch = batches.get(key);
    batch.geometries.push(normalized);
    batch.nodes.push(node);
  });
  for (const { material, geometries, nodes } of batches.values()) {
    // 只有一块的批次保留原网格（它的材质独一份，合并没有意义）。
    if (geometries.length < 2) { for (const geometry of geometries) geometry.dispose(); continue; }
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = 'merged-island-detail';
    root.add(mesh);
    for (const node of nodes) node.parent?.remove(node);
  }
  return root;
}

function islandTerrainGeometry(world) {
  const segments=192,rings=44,positions=[],colors=[],uvs=[],indices=[],color=new THREE.Color();
  const sand=new THREE.Color(0x857a60),meadow=new THREE.Color(0x405c40),forest=new THREE.Color(0x1b332b),rock=new THREE.Color(0x4e5854),snow=new THREE.Color(0xb8c0b8);
  for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++) {
    const radial=ring/rings,angle=i/segments*Math.PI*2,point=islandPoint(world,radial,angle),center=islandCenter(world);
    const elevation=point.y-WATER_SURFACE_Y;
    const terrainFold=(Math.sin(point.x*.31+point.z*.17)*.075+Math.cos(point.z*.43-point.x*.12)*.045)*(1-radial*.45);
    positions.push(point.x-center.x,elevation+terrainFold,point.z-center.z);
    color.copy(meadow).lerp(forest,THREE.MathUtils.smoothstep(elevation,2,20)*.54);
    color.lerp(rock,THREE.MathUtils.smoothstep(elevation,14,32)*.72);
    color.lerp(snow,THREE.MathUtils.smoothstep(elevation,28,38)*.72);
    const coast=1-THREE.MathUtils.smoothstep(radial,.62,.99);
    color.lerp(sand,coast*.84);
    const moisture=.5+.5*Math.sin(point.x*.13-point.z*.09+angle*3);
    color.lerp(forest,moisture*.12);
    const exposed=Math.max(0,Math.sin(point.x*.47+point.z*.29)*Math.cos(point.x*.16-point.z*.38)-.52)*.22;
    color.lerp(sand,exposed);
    const variation=.92+Math.sin(point.x*.21+point.z*.17)*.055;
    color.multiplyScalar(variation);colors.push(color.r,color.g,color.b);uvs.push(point.x/9,point.z/9);
    if(ring<rings&&i<segments){const n=ring*(segments+1)+i;indices.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function islandCliffGeometry(world) {
  const segments=192,positions=[],colors=[],uvs=[],indices=[],center=islandCenter(world);
  const coast=[];
  for(let i=0;i<segments;i++){const p=islandShorePoint(world,i/segments*Math.PI*2);coast.push([p.x-center.x,p.z-center.z]);}
  const rings=[
    {scale:1,y:.16,color:new THREE.Color(0x68786d)},
    {scale:1.009,y:-2.2,color:new THREE.Color(0x52635f)},
    {scale:1.021,y:-8.5,color:new THREE.Color(0x3f5352)},
    {scale:1.038,y:-17,color:new THREE.Color(0x324846)},
    {scale:1.058,y:-28,color:new THREE.Color(0x293d40)},
    {scale:1.079,y:-43,color:new THREE.Color(0x21363a)},
    {scale:1.1,y:-68,color:new THREE.Color(0x182c32)},
  ];
  rings.forEach((ring,row)=>{
    coast.forEach(([x,z],i)=>{
      const scallop=1+Math.sin(i*.43+row*1.7)*.006+Math.cos(i*.17-row*.8)*.004;
      positions.push(x*ring.scale*scallop,ring.y+Math.sin(i*.31+row*.9)*.35,z*ring.scale*scallop);
      colors.push(ring.color.r,ring.color.g,ring.color.b);
      uvs.push(i/segments*11.5,row/(rings.length-1)*4.2);
    });
  });
  for(let row=0;row<rings.length-1;row++)for(let i=0;i<segments;i++){
    const n=(i+1)%segments,a=row*segments+i,b=row*segments+n,c=(row+1)*segments+i,d=(row+1)*segments+n;
    indices.push(a,b,c,b,d,c);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function islandMountainGeometry(seed=0) {
  const segments=36,rings=18,positions=[],indices=[];
  for(let ring=0;ring<=rings;ring++){
    const t=ring/rings,radius=1-t;
    for(let i=0;i<=segments;i++){
      const angle=i/segments*Math.PI*2;
      const ridgeNoise=Math.sin(angle*3+seed*.17+t*7.1)*.16+
        Math.cos(angle*7-seed*.11+t*4.3)*.07+
        Math.sin(angle*11+seed*.07)*.025;
      const ridge=radius*(1+ridgeNoise*(1-t*.45));
      const summitFlatten=t>.86?(t-.86)/.14*.16:0;
      const y=t-.5+Math.sin(angle*5+t*9)*.018*radius-summitFlatten;
      positions.push(Math.cos(angle)*ridge,y,Math.sin(angle)*ridge*.82);
    }
  }
  for(let ring=0;ring<rings;ring++)for(let i=0;i<segments;i++){
    const a=ring*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;
    indices.push(a,b,c,b,d,c);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// 火山锥：日本海岛最有辨识度的地貌。凹形的坡面、顶上的火山口。
function volcanoConeGeometry(seed=0) {
  const segments=56,rings=26,craterRatio=.13;
  const positions=[],indices=[];
  // 沟壑不能是等距的：让角度随高度游走，坡面才不会像沙丘。
  const fluting=(angle,u)=>{
    const wander=angle+Math.sin(u*3.4+seed*.07)*.55+Math.sin(u*7.9-seed*.11)*.22;
    return 1
      +Math.sin(wander*9+seed*.13)*.034
      +Math.sin(wander*19-seed*.07+u*2.1)*.017
      +Math.sin(wander*37+seed*.31+u*5.3)*.008;
  };
  // 指数小于 1：坡面上陡下缓，像真正的成层火山。
  const radiusAt=(u,angle)=>(craterRatio+(1-craterRatio)*Math.pow(u,.68))*fluting(angle,u);
  const heightAt=(u)=>1-Math.pow(u,1.04);
  for(let ring=0;ring<=rings;ring++){
    const u=ring/rings;
    for(let i=0;i<=segments;i++){
      const angle=i/segments*Math.PI*2;
      const r=radiusAt(u,angle);
      positions.push(Math.cos(angle)*r,heightAt(u),Math.sin(angle)*r*.92);
    }
  }
  for(let ring=0;ring<rings;ring++)for(let i=0;i<segments;i++){
    const a=ring*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;
    indices.push(a,b,c,b,d,c);
  }
  // 火山口内壁：一个浅浅的碗。
  const bowlStart=positions.length/3;
  for(let ring=0;ring<=7;ring++){
    const t=ring/7,r=craterRatio*(1-t),y=1-t*t*.17;
    for(let i=0;i<=segments;i++){
      const angle=i/segments*Math.PI*2;
      positions.push(Math.cos(angle)*r,y,Math.sin(angle)*r*.92);
    }
  }
  for(let ring=0;ring<7;ring++)for(let i=0;i<segments;i++){
    const a=bowlStart+ring*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function islandOutcropGeometry(seed=0) {
  const geometry=new THREE.SphereGeometry(1,18,12),position=geometry.attributes.position;
  for(let i=0;i<position.count;i++){
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    const fracture=1+Math.sin(x*7.1+y*4.7+z*5.3+seed*.17)*.19+Math.cos(z*9.2-x*5.8)*.085;
    position.setXYZ(i,x*fracture,y*fracture*(.7+Math.abs(x)*.16),z*fracture);
  }
  geometry.computeVertexNormals();return geometry;
}

function islandRoadGeometry(world,width=5.8) {
  const center=islandCenter(world);
  const points=islandRoadLayout(world).filter(point=>point.y!==null);
  const positions=[],uvs=[],indices=[];
  for(let index=0;index<points.length;index++){
    const previous=points[Math.max(0,index-1)],next=points[Math.min(points.length-1,index+1)];
    const tangentX=next.x-previous.x,tangentZ=next.z-previous.z,length=Math.hypot(tangentX,tangentZ)||1;
    const sideX=-tangentZ/length*width*.5,sideZ=tangentX/length*width*.5;
    const y=points[index].y-WATER_SURFACE_Y+.14;
    positions.push(points[index].x-center.x+sideX,y,points[index].z-center.z+sideZ);
    positions.push(points[index].x-center.x-sideX,y,points[index].z-center.z-sideZ);
    const v=index/(points.length-1)*8;
    uvs.push(0,v,1,v);
    if(index<points.length-1){
      const n=index*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function gabledRoofGeometry() {
  const positions=[
    -.5,0,-.5, .5,0,-.5, 0,1,-.5,
    -.5,0,.5, .5,0,.5, 0,1,.5,
  ];
  const indices=[
    0,2,1, 3,4,5,
    0,3,5, 0,5,2,
    1,2,5, 1,5,4,
    0,1,4, 0,4,3,
  ];
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function broadleafCrownGeometry(seed=0) {
  const parts=[];
  const clusters=[
    [0,1.12,0,1.05,.82,1.02],
    [-.9,.62,.18,.78,.72,.82],
    [.82,.72,-.28,.88,.68,.9],
    [-.18,.42,-.82,.82,.62,.76],
    [.16,1.65,.36,.7,.7,.7],
  ];
  for(const [index,[x,y,z,sx,sy,sz]] of clusters.entries()){
    const geometry=new THREE.IcosahedronGeometry(1,1);
    const position=geometry.attributes.position;
    for(let vertex=0;vertex<position.count;vertex++){
      const px=position.getX(vertex),py=position.getY(vertex),pz=position.getZ(vertex);
      const irregular=1+Math.sin(px*7+py*5+seed*.019+index)*.075+Math.cos(pz*8-px*3+seed*.011)*.045;
      position.setXYZ(vertex,px*irregular,py*irregular,pz*irregular);
    }
    geometry.scale(sx,sy,sz);
    geometry.translate(x,y,z);
    parts.push(geometry.index?geometry.toNonIndexed():geometry);
    if(geometry.index)geometry.dispose();
  }
  const result=mergeGeometries(parts,false);
  for(const part of parts)part.dispose();
  result.computeVertexNormals();
  return result;
}

function cedarCrownGeometry(seed=0) {
  const layers=[
    [.96,2.25,1.32],[.84,2.08,2.05],[.72,1.82,2.74],
    [.58,1.52,3.37],[.42,1.2,3.9],[.24,.78,4.36],
  ];
  const parts=[];
  for(const [index,[radius,height,centerY]] of layers.entries()) {
    const geometry=new THREE.ConeGeometry(radius,height,11,2,true);
    const position=geometry.attributes.position;
    for(let vertex=0;vertex<position.count;vertex++) {
      const x=position.getX(vertex),y=position.getY(vertex),z=position.getZ(vertex);
      const angle=Math.atan2(z,x),radial=Math.hypot(x,z);
      const ragged=1+Math.sin(angle*7+seed*.017+index*1.8)*.12+
        Math.cos(angle*11-index*.7+seed*.009)*.055;
      position.setXYZ(vertex,x*ragged,y,z*ragged);
    }
    geometry.rotateY(index*.31+seed*.003);
    geometry.translate(0,centerY,0);
    parts.push(geometry.index?geometry.toNonIndexed():geometry);
    if(geometry.index)geometry.dispose();
  }
  const result=mergeGeometries(parts,false);
  for(const part of parts)part.dispose();
  result.computeVertexNormals();
  return result;
}

function pineCrownGeometry(seed=0) {
  const clusters=[
    [0,2.55,0,1.3,.42,1.05],
    [-1.02,2.18,.18,.95,.38,.78],
    [.96,2.05,-.12,.9,.34,.72],
    [-.45,3.02,-.3,.84,.38,.7],
    [.58,3.0,.32,.8,.34,.67],
    [-.08,3.55,.03,.63,.34,.57],
  ];
  const parts=[];
  for(const [index,[x,y,z,sx,sy,sz]] of clusters.entries()) {
    const geometry=new THREE.IcosahedronGeometry(1,1);
    const position=geometry.attributes.position;
    for(let vertex=0;vertex<position.count;vertex++) {
      const px=position.getX(vertex),py=position.getY(vertex),pz=position.getZ(vertex);
      const irregular=1+Math.sin(px*8+py*6+pz*5+seed*.013+index)*.085;
      position.setXYZ(vertex,px*irregular,py*irregular,pz*irregular);
    }
    geometry.scale(sx,sy,sz);
    geometry.translate(x,y,z);
    parts.push(geometry.index?geometry.toNonIndexed():geometry);
    if(geometry.index)geometry.dispose();
  }
  const result=mergeGeometries(parts,false);
  for(const part of parts)part.dispose();
  result.computeVertexNormals();
  return result;
}

function shrubClusterGeometry(seed=0) {
  const clusters=[[0,.42,0,.72,.52,.66],[-.55,.34,.12,.52,.42,.55],[.5,.3,-.15,.58,.38,.48]];
  const parts=[];
  for(const [index,[x,y,z,sx,sy,sz]] of clusters.entries()) {
    const geometry=new THREE.IcosahedronGeometry(1,1);
    const position=geometry.attributes.position;
    for(let vertex=0;vertex<position.count;vertex++) {
      const scale=1+Math.sin(position.getX(vertex)*7+position.getY(vertex)*5+seed*.01+index)*.09;
      position.setXYZ(vertex,position.getX(vertex)*scale,position.getY(vertex)*scale,position.getZ(vertex)*scale);
    }
    geometry.scale(sx,sy,sz);geometry.translate(x,y,z);
    parts.push(geometry.index?geometry.toNonIndexed():geometry);
    if(geometry.index)geometry.dispose();
  }
  const result=mergeGeometries(parts,false);
  for(const part of parts)part.dispose();
  result.computeVertexNormals();
  return result;
}

function createFoliageTexture(kind,seed=0) {
  const size=128,data=new Uint8Array(size*size*4);
  const palette={
    cedar:[34,68,46,91,128,78],
    pine:[42,69,38,102,125,59],
    broadleaf:[48,82,44,116,139,67],
  }[kind];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/(size-1),v=1-y/(size-1),offset=(y*size+x)*4;
    const grain=Math.sin(u*71+v*47+seed*.017)*.5+
      Math.cos(u*23-v*83+seed*.011)*.3+
      Math.sin((u+v)*151+seed*.007)*.2;
    const blobs=kind==='pine'
      ? [[.5,.52,.46,.28],[.31,.39,.31,.24],[.69,.4,.3,.23],[.4,.67,.28,.24],[.62,.72,.25,.2]]
      : kind==='cedar'
        ? [[.5,.53,.37,.46],[.33,.4,.24,.27],[.67,.43,.23,.26],[.42,.7,.2,.19]]
        : [[.5,.5,.45,.4],[.29,.43,.3,.3],[.71,.45,.29,.29],[.39,.7,.3,.25],[.64,.7,.27,.23]];
    let density=-1;
    for(const [cx,cy,rx,ry] of blobs){
      const dx=(u-cx)/rx,dy=(v-cy)/ry;
      density=Math.max(density,1-Math.hypot(dx,dy)+grain*.075);
    }
    if(kind==='cedar'&&Math.sin(v*91+u*33+seed*.013)>.76)density-=.075;
    if(kind!=='cedar'&&Math.sin(v*57-u*79+seed*.01)>.82)density-=.05;
    const alpha=Math.max(0,Math.min(1,(density+.02)/.075));
    if(alpha<.015){data[offset+3]=0;continue;}
    const shade=.55+v*.28+grain*.13;
    data[offset]=palette[0]*shade+palette[3]*(1-shade);
    data[offset+1]=palette[1]*shade+palette[4]*(1-shade);
    data[offset+2]=palette[2]*shade+palette[5]*(1-shade);
    data[offset+3]=Math.round(alpha*255);
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.anisotropy=4;
  texture.needsUpdate=true;
  return texture;
}

function layeredFoliageGeometry(kind,seed=0) {
  const specs=kind==='cedar'
    ? [
      [0,1.05,0,2.3,1.15,0],[-.22,1.58,.12,2.05,1.02,.55],
      [.24,2.08,-.08,1.82,.92,1.3],[-.16,2.55,.14,1.52,.8,2.1],
      [.14,3.0,-.06,1.22,.72,2.7],[0,3.42,0,.9,.62,3.35],
      [0,3.78,0,.58,.5,3.9],
    ]
    : kind==='pine'
      ? [
        [0,2.2,0,2.2,.78,0],[-.7,2.5,.18,1.75,.68,.75],
        [.72,2.58,-.2,1.7,.64,1.45],[-.18,2.98,-.35,1.55,.62,2.1],
        [.22,3.28,.28,1.4,.58,2.75],[0,3.5,0,.85,.48,3.4],
      ]
      : [
        [-.18,2.35,.08,2.08,1.28,0],[ .66,2.55,-.22,1.75,1.15,.7],
        [-.67,2.63,-.14,1.72,1.1,1.35],[.08,2.92,-.46,1.9,1.25,2.05],
        [.12,3.28,.4,1.7,1.08,2.75],[.02,3.55,0,1.42,.92,3.45],
      ];
  const parts=[];
  for(const [index,[x,y,z,width,height,rotation]] of specs.entries()){
    for(let cross=0;cross<2;cross++){
      const geometry=new THREE.PlaneGeometry(width,height,1,2);
      geometry.rotateY(rotation+cross*Math.PI*.5+seed*.0017);
      geometry.translate(x,y,z);
      parts.push(geometry.index?geometry.toNonIndexed():geometry);
      if(geometry.index)geometry.dispose();
    }
  }
  const result=mergeGeometries(parts,false);
  for(const part of parts)part.dispose();
  result.computeVertexNormals();
  return result;
}

function layeredFoliageCoreGeometry(kind,seed=0) {
  const clusters=kind==='cedar'
    ? [[0,1.25,0,.94,.72,.88],[0,1.9,0,.88,.72,.82],[0,2.52,0,.78,.68,.74],
      [0,3.08,0,.64,.6,.6],[0,3.54,0,.45,.5,.42],[0,3.83,0,.26,.36,.25]]
    : kind==='pine'
      ? [[0,2.2,0,1.28,.42,1.02],[-.82,2.43,.18,.9,.38,.72],
        [.87,2.47,-.18,.88,.36,.7],[-.28,2.82,-.35,.82,.37,.68],[.38,2.96,.32,.74,.34,.62]]
      : [[0,2.36,0,1.18,.98,1.02],[-.75,2.48,.16,.9,.82,.78],[.8,2.5,-.16,.88,.8,.77],
        [-.18,2.9,-.34,.9,.78,.78],[.35,3.05,.35,.8,.7,.7],[0,3.34,0,.65,.6,.58]];
  const parts=[];
  for(const [index,[x,y,z,sx,sy,sz]] of clusters.entries()){
    const geometry=new THREE.SphereGeometry(1,12,8);
    const position=geometry.attributes.position;
    for(let vertex=0;vertex<position.count;vertex++){
      const px=position.getX(vertex),py=position.getY(vertex),pz=position.getZ(vertex);
      const irregular=1+Math.sin(px*6+py*8+pz*5+seed*.013+index)*.085+
        Math.cos(px*11-py*4-z*7+seed*.007)*.04;
      position.setXYZ(vertex,px*irregular,py*irregular,pz*irregular);
    }
    geometry.scale(sx,sy,sz);geometry.translate(x,y,z);
    parts.push(geometry.index?geometry.toNonIndexed():geometry);
    if(geometry.index)geometry.dispose();
  }
  const result=mergeGeometries(parts,false);
  for(const part of parts)part.dispose();
  result.computeVertexNormals();
  return result;
}

function coastalPineTrunkGeometry() {
  const parts=[];
  const lower=new THREE.CylinderGeometry(.15,.29,2.55,8,2);
  lower.translate(0,1.27,0);parts.push(lower.toNonIndexed());lower.dispose();
  const upper=new THREE.CylinderGeometry(.1,.17,2.15,7,2);
  upper.rotateZ(.24);upper.rotateX(-.08);upper.translate(.16,2.82,.03);
  parts.push(upper.toNonIndexed());upper.dispose();
  for(const [angle,length] of [[.2,1.25],[2.45,1.1],[4.1,1.2]]){
    const branch=new THREE.CylinderGeometry(.035,.085,length,6,1);
    branch.rotateZ(Math.PI*.5-angle*.08);branch.rotateY(angle);
    branch.translate(Math.cos(angle)*length*.42,2.25+Math.sin(angle)*.12,Math.sin(angle)*length*.42);
    parts.push(branch.index?branch.toNonIndexed():branch);
    if(branch.index)branch.dispose();
  }
  const geometry=mergeGeometries(parts,false);
  for(const part of parts)part.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

function grassTuftGeometry(seed=0) {
  const parts=[];
  for(let index=0;index<7;index++){
    const angle=index*2.399+seed*.013;
    const height=.32+(index%4)*.105,radius=.42+(index%3)*.12;
    const blade=new THREE.ConeGeometry(.035+(index%2)*.012,height,3,1,true);
    blade.rotateZ(Math.sin(angle)*.55);
    blade.rotateY(angle);
    blade.translate(Math.cos(angle)*radius*.16,height*.5,Math.sin(angle)*radius*.16);
    parts.push(blade.index?blade.toNonIndexed():blade);
    if(blade.index)blade.dispose();
  }
  const result=mergeGeometries(parts,false);
  for(const part of parts)part.dispose();
  result.computeVertexNormals();
  return result;
}

function wildflowerGeometry() {
  const parts=[];
  for(let index=0;index<5;index++){
    const angle=index/5*TAU;
    const petal=new THREE.CircleGeometry(.075,5);
    petal.rotateX(-Math.PI/2);
    petal.translate(Math.cos(angle)*.065,.18+index*.018,Math.sin(angle)*.065);
    parts.push(petal.index?petal.toNonIndexed():petal);
    if(petal.index)petal.dispose();
  }
  return mergeGeometries(parts,false);
}

function shorelineFoamTexture(seed) {
  const width=256,height=48,data=new Uint8Array(width*height*4),random=worldRandom(seed^0x76b91d);
  for(let y=0;y<height;y++){
    const v=y/(height-1),edge=Math.sin(v*Math.PI);
    for(let x=0;x<width;x++){
      const u=x/(width-1);
      const breakers=.48+.31*Math.sin((u*17+v*.7)*TAU)+.18*Math.sin((u*41-v*1.3)*TAU);
      const fibrous=.48+.52*Math.pow(.5+.5*Math.sin((u*57+v*4.2)*TAU),3);
      const alpha=clamp01((breakers*.68+fibrous*.32-.42)*2.35)*edge*(.38+random()*.62);
      const offset=(y*width+x)*4;
      data[offset]=221+Math.round(alpha*20);
      data[offset+1]=246;
      data[offset+2]=239;
      data[offset+3]=Math.round(alpha*245);
    }
  }
  const texture=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
  texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;
  return texture;
}

function shorelineFoamGeometry(world,innerOutset,outerOutset) {
  const segments=256,positions=[],uvs=[],indices=[],center=islandCenter(world);
  for(let i=0;i<=segments;i++){
    const angle=i/segments*TAU;
    for(const [row,outset] of [[0,innerOutset],[1,outerOutset]]) {
      const point=islandShorePoint(world,angle,outset);
      positions.push(point.x-center.x,.42+Math.sin(angle*7+i*.31)*.025,point.z-center.z);
      uvs.push(i/segments*18,row);
    }
    if(i<segments){
      const base=i*2;
      indices.push(base,base+2,base+1,base+2,base+3,base+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function islandGrassGeometry() {
  const positions=[],indices=[];
  const blades=[
    [[-.06,0,0],[-.12,.78,.03],[0,.62,-.08]],
    [[.06,0,-.02],[.18,.65,-.04],[.03,.46,.08]],
    [[0,0,.05],[-.04,.58,.16],[.12,.42,.04]],
    [[-.02,0,-.04],[.08,.86,-.12],[-.04,.54,-.2]],
  ];
  blades.forEach((blade,index)=>{
    positions.push(...blade.flat());
    const n=index*3;indices.push(n,n+1,n+2);
  });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

function createBreezeMaterial(options={}) {
  const material=new THREE.MeshStandardMaterial(options);
  material.onBeforeCompile=shader=>{
    shader.uniforms.uTime={value:0};
    shader.vertexShader='uniform float uTime;\n'+shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         float breezePhase=instanceMatrix[3].x*.19+instanceMatrix[3].z*.13;
       #else
         float breezePhase=0.0;
       #endif
       float breezeHeight=max(0.0,position.y+1.4);
       transformed.x+=sin(uTime*1.05+breezePhase)*.026*breezeHeight;
       transformed.z+=cos(uTime*.82+breezePhase*1.3)*.018*breezeHeight;`,
    );
    material.userData.shader=shader;
  };
  material.customProgramCacheKey=()=>`island-breeze-${options.roughness??.86}`;
  return material;
}

export function createIsland(world) {
  const group=new THREE.Group();group.name='灰屿 · 日本式海岸列岛与排放设施';
  const center=islandCenter(world);
  const cliffMaps=createSurfaceMaps('rock',{size:160,repeat:2.8,seed:world.seed^0x6c412,normalStrength:2.1});
  const cliffMaterial=new THREE.MeshPhysicalMaterial({
    vertexColors:true,roughness:.77,metalness:.01,emissive:0x07110f,emissiveIntensity:.12,...cliffMaps,
    normalScale:new THREE.Vector2(1.45,1.45),clearcoat:.14,clearcoatRoughness:.55,side:THREE.DoubleSide,
  });
  const groundMaps=islandGroundMaps(world.seed);
  const terrainMaterial=new THREE.MeshPhysicalMaterial({
    vertexColors:true,roughness:.82,...groundMaps,
    normalScale:new THREE.Vector2(.86,.86),clearcoat:.1,clearcoatRoughness:.7,side:THREE.DoubleSide,
  });
  const steelMaps=createSurfaceMaps('paint',{size:128,repeat:1.8,seed:world.seed^0x4c7a,normalStrength:.7});
  const concreteMaps=createSurfaceMaps('concrete',{size:128,repeat:1.65,seed:world.seed^0x93d1,normalStrength:1.0});
  const roofMaps=createSurfaceMaps('roof',{size:128,repeat:1.9,seed:world.seed^0x7ad4,normalStrength:1.2});
  const roadMaps=createSurfaceMaps('asphalt',{size:144,repeat:2.4,seed:world.seed^0x2f86,normalStrength:1.05});
  const steel=new THREE.MeshPhysicalMaterial({color:0x708388,metalness:.72,roughness:.32,...steelMaps,clearcoat:.72,clearcoatRoughness:.2,envMapIntensity:1.15});
  const concrete=new THREE.MeshPhysicalMaterial({color:0x8b9590,roughness:.72,...concreteMaps,clearcoat:.16,clearcoatRoughness:.58,envMapIntensity:.8});
  const warmGlass=new THREE.MeshStandardMaterial({color:0xdfc27f,emissive:0xd49542,emissiveIntensity:2.2,roughness:.35});
  const hazard=new THREE.MeshStandardMaterial({color:0x2d1a11,emissive:0xe05c35,emissiveIntensity:1.7,roughness:.5});
  const lacquer=new THREE.MeshPhysicalMaterial({color:0xa74131,roughness:.3,metalness:.06,clearcoat:.78,clearcoatRoughness:.18,envMapIntensity:.9});
  const groundAt=(x,z)=>islandVisualSurfaceAt(world,center.x+x,center.z+z)-WATER_SURFACE_Y;
  const terrain=new THREE.Mesh(islandTerrainGeometry(world),terrainMaterial);terrain.name='gray-island-irregular-terrain';group.add(terrain);
  const cliff=new THREE.Mesh(islandCliffGeometry(world),cliffMaterial);cliff.name='gray-island-coastal-cliffs';group.add(cliff);
  const outcropMaterial=new THREE.MeshPhysicalMaterial({
    color:0x68736b,roughness:.83,metalness:.01,clearcoat:.08,clearcoatRoughness:.62,
    emissive:0x09120e,emissiveIntensity:.18,
    normalMap:cliffMaps.normalMap,normalScale:new THREE.Vector2(.55,.55),flatShading:true,
  });
  const outcrops=new THREE.InstancedMesh(islandOutcropGeometry(world.seed),outcropMaterial,38);
  outcrops.name='exposed-mountain-scarps';
  const outcropRandom=worldRandom(world.seed^0x31f7ca),outcropDummy=new THREE.Object3D();
  for(let i=0;i<outcrops.count;i++){
    const cluster=i<24?{x:-4,z:-52,r:18}:{x:31,z:-8,r:15};
    const angle=outcropRandom()*TAU,radius=Math.sqrt(outcropRandom())*cluster.r;
    const x=cluster.x+Math.cos(angle)*radius,z=cluster.z+Math.sin(angle)*radius,size=.65+outcropRandom()*2.15;
    outcropDummy.position.set(x,groundAt(x,z)+size*.32,z);
    outcropDummy.rotation.set(outcropRandom()*.62,outcropRandom()*TAU,outcropRandom()*.36);
    outcropDummy.scale.set(size*(.72+outcropRandom()*.72),size*(.62+outcropRandom()*1.45),size*(.7+outcropRandom()*.66));
    outcropDummy.updateMatrix();outcrops.setMatrixAt(i,outcropDummy.matrix);
    outcropRandom();
  }
  outcrops.instanceMatrix.needsUpdate=true;group.add(outcrops);
  const ridgeMaterial=new THREE.MeshPhysicalMaterial({
    color:0x66796b,roughness:.8,emissive:0x0a1711,emissiveIntensity:.16,...cliffMaps,
    normalScale:new THREE.Vector2(.75,.75),clearcoat:.1,clearcoatRoughness:.62,
  });
  const snowMaterial=new THREE.MeshPhysicalMaterial({color:0xe4e9e2,roughness:.66,clearcoat:.2,clearcoatRoughness:.5});
  for(const [x,z,width,height,rotation,snowy] of [
    [-8,-53,17,18,.2,true],[-31,-43,11,12,-.4,false],
    [18,-46,13,14,.65,false],[35,-21,10,11,-.2,false],
  ]){
    const base=groundAt(x,z),ridge=new THREE.Mesh(islandMountainGeometry(world.seed+x*.13+z),ridgeMaterial);
    ridge.position.set(x,base+height*.42,z);
    ridge.rotation.y=rotation;
    ridge.scale.set(width,height,width*.78);
    ridge.name='layered-mountain-ridge';
    group.add(ridge);
    if(snowy){
      const cap=new THREE.Mesh(islandMountainGeometry(world.seed+z*.21),snowMaterial);
      cap.position.set(x,base+height*.79,z);cap.rotation.y=rotation;cap.scale.set(width*.28,height*.28,width*.22);group.add(cap);
    }
  }
  // 火山锥：北西侧台地上的一个寄生火山锥，是这座岛的地貌签名。
  const volcanoBase=groundAt(-46,-40);
  const volcanoMaterial=new THREE.MeshStandardMaterial({
    color:0x2c2924,roughness:.96,metalness:.02,
    normalMap:cliffMaps.normalMap,normalScale:new THREE.Vector2(.75,.75),
    emissive:0x140d08,emissiveIntensity:.28,flatShading:true,
  });
  const volcano=new THREE.Mesh(volcanoConeGeometry(world.seed^0x5c0a1),volcanoMaterial);
  volcano.name='parasitic-volcano-cone';
  volcano.position.set(-46,volcanoBase-3.4,-40);
  volcano.scale.set(16,14.5,16);
  group.add(volcano);
  const craterGlow=new THREE.Mesh(
    new THREE.CircleGeometry(1,26),
    new THREE.MeshBasicMaterial({color:0xff7a3c,transparent:true,opacity:.4,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}),
  );
  craterGlow.name='volcano-crater-glow';
  craterGlow.rotation.x=-Math.PI/2;
  craterGlow.position.set(-46,volcanoBase-3.4+14.5*.9,-40);
  craterGlow.scale.set(1.5,1.4,1);
  group.add(craterGlow);
  const volcanoSteam=new THREE.Group();
  volcanoSteam.name='volcano-steam';
  const steamMaterial=new THREE.MeshBasicMaterial({color:0xd9d2c6,transparent:true,opacity:.19,side:THREE.DoubleSide,depthWrite:false});
  for(let i=0;i<7;i++){
    const puff=new THREE.Mesh(new THREE.PlaneGeometry(3.6+i*.9,2.8+i*.7),steamMaterial);
    puff.position.set(-46+(i%2?1:-1)*i*.45,volcanoBase-3.4+14.5*.92+i*1.9,-40+i*.3);
    puff.rotation.y=i*.7;
    puff.userData.drift=i*.9;
    volcanoSteam.add(puff);
  }
  group.add(volcanoSteam);

  const shoreFoamTexture=shorelineFoamTexture(world.seed);
  const outerSurfMaterial=new THREE.MeshBasicMaterial({
    color:0xc6ece5,map:shoreFoamTexture,transparent:true,opacity:.27,
    side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending,
  });
  const outerSurf=new THREE.Mesh(shorelineFoamGeometry(world,-.8,5.8),outerSurfMaterial);
  outerSurf.name='shoreline-surf';
  const shoreFoamMaterial=outerSurfMaterial.clone();
  shoreFoamMaterial.opacity=.54;
  const shoreFoam=new THREE.Mesh(shorelineFoamGeometry(world,-1.7,.55),shoreFoamMaterial);
  shoreFoam.name='shoreline-breaking-foam';
  group.add(outerSurf,shoreFoam);

  const coastRandom=worldRandom(world.seed^0x3d7e42),coastRockMaterial=cliffMaterial.clone();
  coastRockMaterial.vertexColors=false;coastRockMaterial.color.setHex(0x77827b);coastRockMaterial.roughness=.7;
  const coastRockCount=110,coastRocks=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),coastRockMaterial,coastRockCount),coastDummy=new THREE.Object3D();
  coastRocks.name='broken-coastal-boulders';
  for(let i=0;i<coastRockCount;i++){
    const angle=i/coastRockCount*Math.PI*2+coastRandom()*.035;
    const point=islandShorePoint(world,angle,-1.2-coastRandom()*7.5),size=.8+coastRandom()*2.25;
    coastDummy.position.set(point.x-center.x,-.72+coastRandom()*.42,point.z-center.z);
    coastDummy.rotation.set(coastRandom()*.45,coastRandom()*TAU,coastRandom()*.32);
    coastDummy.scale.set(size*(.75+coastRandom()*.8),size*(.48+coastRandom()*.66),size*(.72+coastRandom()*.9));
    coastDummy.updateMatrix();coastRocks.setMatrixAt(i,coastDummy.matrix);
    coastRocks.setColorAt(i,new THREE.Color().setHSL(.42+coastRandom()*.08,.06+coastRandom()*.08,.32+coastRandom()*.15));
  }
  coastRocks.instanceMatrix.needsUpdate=coastRocks.instanceColor.needsUpdate=true;
  group.add(coastRocks);

  const plantBase=groundAt(-4,-8),townBase=groundAt(12,12);
  const plant=new THREE.Group();plant.name='灰屿排放与控制站';
  const blocks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),steel,6),windows=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),warmGlass,6),pipes=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,1,12),steel,6),dummy=new THREE.Object3D();
  for(let i=0;i<6;i++){
    const x=(i%3-1)*7,z=Math.floor(i/3)*7-4,h=4+i%3;
    dummy.position.set(x,plantBase+h/2,z);dummy.scale.set(6,h,5.5);dummy.updateMatrix();blocks.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x,plantBase+h*.67,z-.02);dummy.scale.set(4.4,.45,5.65);dummy.updateMatrix();windows.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x*1.08,plantBase+6,z);dummy.scale.set(.8,27,1);dummy.updateMatrix();pipes.setMatrixAt(i,dummy.matrix);
  }
  plant.add(blocks,windows,pipes);
  const stack=new THREE.Mesh(new THREE.CylinderGeometry(2.1,3.1,24,18),steel);stack.position.set(-11,plantBase+12,-8);plant.add(stack);
  const beacon=new THREE.Mesh(new THREE.SphereGeometry(1.25,14,10),hazard);beacon.position.set(-11,plantBase+24.7,-8);plant.add(beacon);
  const mast=new THREE.Mesh(new THREE.CylinderGeometry(.16,.25,23,8),steel);mast.position.set(13,plantBase+12,-9);plant.add(mast);
  const radar=new THREE.Mesh(new THREE.BoxGeometry(5,.32,1.1),steel);radar.position.set(13,plantBase+23.5,-9);plant.add(radar);
  const tankBodies=new THREE.InstancedMesh(new THREE.CylinderGeometry(1.55,1.7,4.4,14),steel,4);
  const tankBands=new THREE.InstancedMesh(new THREE.CylinderGeometry(1.58,1.58,.16,14),hazard,4);
  for(let i=0;i<4;i++){
    const x=-20+(i%2)*4.1,z=-1+Math.floor(i/2)*4.2;
    dummy.position.set(x,plantBase+2.25,z);dummy.rotation.set(0,i*.37,0);dummy.scale.setScalar(1);dummy.updateMatrix();tankBodies.setMatrixAt(i,dummy.matrix);
    dummy.position.y=plantBase+3.65;dummy.updateMatrix();tankBands.setMatrixAt(i,dummy.matrix);
  }
  tankBodies.instanceMatrix.needsUpdate=tankBands.instanceMatrix.needsUpdate=true;
  plant.add(tankBodies,tankBands);

  // 排放站的告示牌：日文本身就是"这是日本"的说明。
  const plantSign=createSignBoard(signTexture(ISLAND_MARKS.plant.lines,ISLAND_MARKS.plant.options),{width:6.4,height:3.1,postHeight:2.2});
  plantSign.name='plant-alps-notice';
  plantSign.position.set(6.5,plantBase+2.6,-13.4);
  plantSign.rotation.y=Math.PI*.08;
  plant.add(plantSign);

  const hazardNotice=createWallNotice(signTexture(ISLAND_MARKS.plantNotice.lines,ISLAND_MARKS.plantNotice.options),{width:2.6,height:1.7});
  hazardNotice.name='plant-radiation-warning';
  hazardNotice.position.set(-3.4,plantBase+2.4,-2.9);
  plant.add(hazardNotice);

  // 围栏：把排放站圈起来，竖线之间挂铁丝网。
  const fenceMaterial=new THREE.MeshStandardMaterial({color:0x8a8f88,roughness:.72,metalness:.45,transparent:true,opacity:.42});
  const fencePosts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.07,.09,3.1,6),fenceMaterial,64);
  const fenceMesh=new THREE.Mesh(new THREE.PlaneGeometry(52,2.6),new THREE.MeshBasicMaterial({color:0x9aa39c,transparent:true,opacity:.22,side:THREE.DoubleSide,wireframe:true}));
  fenceMesh.name='plant-perimeter-fence';
  for(let i=0;i<64;i++){
    const t=i/64*Math.PI*2;
    dummy.position.set(Math.cos(t)*26,plantBase+1.55,Math.sin(t)*26-6);
    dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();fencePosts.setMatrixAt(i,dummy.matrix);
  }
  fencePosts.instanceMatrix.needsUpdate=true;
  fenceMesh.position.set(0,plantBase+1.6,-6);
  plant.add(fencePosts,fenceMesh);

  group.add(plant);

  const smokeCount=84,smokePositions=new Float32Array(smokeCount*3),smokeSeeds=[];
  for(let i=0;i<smokeCount;i++){
    const phase=(i*37%97)/97;
    smokeSeeds.push({phase,drift:(i*53%101)/101-0.5,lift:.4+(i%9)*.13,baseY:plantBase+24});
    smokePositions[i*3]=-11;smokePositions[i*3+1]=plantBase+24;smokePositions[i*3+2]=-8;
  }
  const smokeGeometry=new THREE.BufferGeometry();
  smokeGeometry.setAttribute('position',new THREE.BufferAttribute(smokePositions,3));
  const industrialSmoke=new THREE.Points(smokeGeometry,new THREE.PointsMaterial({
    color:0xa9b6b0,size:1.15,transparent:true,opacity:.16,depthWrite:false,
    blending:THREE.NormalBlending,
  }));
  industrialSmoke.name='cooling-stack-plume';
  industrialSmoke.frustumCulled=false;
  group.add(industrialSmoke);

  const treeTrunkMaterial=new THREE.MeshStandardMaterial({color:0x4b382a,roughness:.94,metalness:0});
  const cedarLeafMaterial=createBreezeMaterial({
    color:0xffffff,map:createFoliageTexture('cedar',world.seed),alphaTest:.34,
    alphaToCoverage:true,side:THREE.DoubleSide,roughness:.9,metalness:0,emissive:0x07120d,
    emissiveIntensity:.12,
  });
  const pineLeafMaterial=createBreezeMaterial({
    color:0xffffff,map:createFoliageTexture('pine',world.seed^0x61d7),alphaTest:.34,
    alphaToCoverage:true,side:THREE.DoubleSide,roughness:.9,metalness:0,emissive:0x07100b,
    emissiveIntensity:.12,
  });
  const broadleafLeafMaterial=createBreezeMaterial({
    color:0xffffff,map:createFoliageTexture('broadleaf',world.seed^0x3a91),alphaTest:.34,
    alphaToCoverage:true,side:THREE.DoubleSide,roughness:.9,metalness:0,emissive:0x09130c,
    emissiveIntensity:.13,
  });
  const foliageMaps=createSurfaceMaps('foliage',{size:96,repeat:2.4,seed:world.seed^0x6be2a1,normalStrength:1.25});
  const foliageCoreMaterial=createBreezeMaterial({
    color:0xffffff,map:foliageMaps.map,roughnessMap:foliageMaps.roughnessMap,
    roughness:.94,metalness:0,emissive:0x0b2416,emissiveIntensity:.2,
  });
  const treeLayout=islandTreeLayout(world);
  const cedarLayout=treeLayout.filter(tree=>tree.species==='cedar');
  const pineLayout=treeLayout.filter(tree=>tree.species==='pine');
  const broadleafLayout=treeLayout.filter(tree=>tree.species==='broadleaf');
  const uprightTrees=treeLayout.filter(tree=>tree.species!=='pine');
  const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.13,.26,3.8,8),treeTrunkMaterial,uprightTrees.length);
  const pineTrunks=new THREE.InstancedMesh(coastalPineTrunkGeometry(),treeTrunkMaterial,pineLayout.length);
  const rootFlares=new THREE.InstancedMesh(new THREE.ConeGeometry(.48,.32,8,1,false),treeTrunkMaterial,treeLayout.length);
  const treeContacts=new THREE.InstancedMesh(
    new THREE.CircleGeometry(1,14),
    new THREE.MeshBasicMaterial({color:0x0a150e,transparent:true,opacity:.19,depthWrite:false}),
    treeLayout.length,
  );
  const cedarCrowns=new THREE.InstancedMesh(layeredFoliageGeometry('cedar',world.seed),cedarLeafMaterial,cedarLayout.length);
  const pineCrowns=new THREE.InstancedMesh(layeredFoliageGeometry('pine',world.seed^0x91a3),pineLeafMaterial,pineLayout.length);
  const broadleafCrowns=new THREE.InstancedMesh(layeredFoliageGeometry('broadleaf',world.seed),broadleafLeafMaterial,broadleafLayout.length);
  const cedarCores=new THREE.InstancedMesh(layeredFoliageCoreGeometry('cedar',world.seed),foliageCoreMaterial,cedarLayout.length);
  const pineCores=new THREE.InstancedMesh(layeredFoliageCoreGeometry('pine',world.seed^0x91a3),foliageCoreMaterial,pineLayout.length);
  const broadleafCores=new THREE.InstancedMesh(layeredFoliageCoreGeometry('broadleaf',world.seed),foliageCoreMaterial,broadleafLayout.length);
  trunks.name='mixed-forest-trunks';
  pineTrunks.name='leaning-coastal-pine-trunks';
  rootFlares.name='tree-root-flares';
  treeContacts.name='tree-contact-shadows';
  cedarCrowns.name='japanese-cedar-crowns';
  pineCrowns.name='coastal-black-pine-crowns';
  broadleafCrowns.name='broadleaf-tree-crowns';
  cedarCores.name='japanese-cedar-volume';
  pineCores.name='coastal-black-pine-volume';
  broadleafCores.name='broadleaf-tree-volume';
  for(const mesh of [trunks,pineTrunks,rootFlares,cedarCrowns,pineCrowns,broadleafCrowns,cedarCores,pineCores,broadleafCores]){mesh.receiveShadow=true;mesh.frustumCulled=true;}
  const leafColor=new THREE.Color(),trunkColor=new THREE.Color();
  let uprightIndex=0,pineTrunkIndex=0;
  for(let i=0;i<treeLayout.length;i++){
    const tree=treeLayout[i],lx=tree.x-center.x,lz=tree.z-center.z,heightScale=tree.species==='cedar'?1.28:tree.species==='pine'?.9:1.02;
    dummy.position.set(lx,tree.y-WATER_SURFACE_Y+1.9*heightScale*tree.scale,lz);
    dummy.rotation.set(tree.leanZ||0,tree.angle,tree.leanX||0);
    dummy.scale.set(tree.scale*(.9+(i%3)*.035),heightScale*tree.scale,tree.scale*(.88+(i%4)*.03));
    dummy.updateMatrix();
    if(tree.species==='pine')pineTrunks.setMatrixAt(pineTrunkIndex++,dummy.matrix);
    else trunks.setMatrixAt(uprightIndex++,dummy.matrix);
    trunkColor.setHSL(.075+(i%3)*.008,.24+(i%4)*.025,.22+(i%5)*.02);
    if(tree.species==='pine')pineTrunks.setColorAt(pineTrunkIndex-1,trunkColor);
    else trunks.setColorAt(uprightIndex-1,trunkColor);
    dummy.position.set(lx,tree.y-WATER_SURFACE_Y+.12*tree.scale,lz);
    dummy.rotation.set(0,tree.angle,0);
    dummy.scale.set(tree.scale*(.8+(i%4)*.06),tree.scale*.9,tree.scale*(.78+(i%3)*.07));
    dummy.updateMatrix();rootFlares.setMatrixAt(i,dummy.matrix);
    dummy.position.set(lx,tree.y-WATER_SURFACE_Y+.035,lz);
    dummy.rotation.set(-Math.PI/2,0,tree.angle);
    dummy.scale.set(tree.scale*(1.05+(i%4)*.08),tree.scale*(.76+(i%3)*.07),1);
    dummy.updateMatrix();treeContacts.setMatrixAt(i,dummy.matrix);
  }
  const placeCrowns=(layout,mesh,core,species)=>{
    for(let i=0;i<layout.length;i++){
      const tree=layout[i],baseScale=tree.scale*(species==='cedar'?1.1:species==='pine'?1.04:.98);
      dummy.position.set(tree.x-center.x,tree.y-WATER_SURFACE_Y,tree.z-center.z);
      dummy.rotation.set(tree.leanZ||0,tree.angle*1.17,tree.leanX||0);
      dummy.scale.set(
        baseScale*(.92+(i%4)*.045),
        baseScale*(.94+((i+1)%5)*.038),
        baseScale*(.9+(i%3)*.05),
      );
      dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);core.setMatrixAt(i,dummy.matrix);
      if(species==='cedar')leafColor.setHSL(.33+(i%4)*.008,.08+(i%3)*.018,.84+(i%5)*.018);
      else if(species==='pine')leafColor.setHSL(.29+(i%4)*.012,.07+(i%3)*.018,.88+(i%5)*.02);
      else leafColor.setHSL(.26+(i%5)*.014,.08+(i%4)*.02,.86+(i%6)*.02);
      mesh.setColorAt(i,leafColor);
      const coreTint=leafColor.clone().multiplyScalar(.9+(i%4)*.018);
      core.setColorAt(i,coreTint);
    }
    if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    if(core.instanceColor)core.instanceColor.needsUpdate=true;
  };
  placeCrowns(cedarLayout,cedarCrowns,cedarCores,'cedar');
  placeCrowns(pineLayout,pineCrowns,pineCores,'pine');
  placeCrowns(broadleafLayout,broadleafCrowns,broadleafCores,'broadleaf');
  trunks.instanceMatrix.needsUpdate=true;trunks.instanceColor.needsUpdate=true;
  pineTrunks.instanceMatrix.needsUpdate=true;pineTrunks.instanceColor.needsUpdate=true;
  rootFlares.instanceMatrix.needsUpdate=true;
  treeContacts.instanceMatrix.needsUpdate=true;
  group.add(trunks,pineTrunks,rootFlares,treeContacts,cedarCores,pineCores,broadleafCores,cedarCrowns,pineCrowns,broadleafCrowns);

  const shrubLayout=treeLayout.filter((tree,index)=>index%2===0).slice(0,170);
  const shrubMaterial=createBreezeMaterial({
    color:0xffffff,roughness:.94,metalness:0,emissive:0x06100c,
    emissiveIntensity:.18,
  });
  const shrubs=new THREE.InstancedMesh(shrubClusterGeometry(world.seed^0x4ba8),shrubMaterial,shrubLayout.length);
  shrubs.name='mixed-undergrowth';
  for(let i=0;i<shrubLayout.length;i++){
    const shrub=shrubLayout[i],scale=(.46+((i*17)%11)*.055)*shrub.scale;
    const side=shrub.angle+i*2.4;
    dummy.position.set(
      shrub.x-center.x+Math.cos(side)*.7*scale,
      shrub.y-WATER_SURFACE_Y+.05,
      shrub.z-center.z+Math.sin(side)*.7*scale,
    );
    dummy.rotation.set(.06,(shrub.angle||0)*1.7,.04);
    dummy.scale.set(scale*1.24,scale*.88,scale*1.08);
    dummy.updateMatrix();shrubs.setMatrixAt(i,dummy.matrix);
    leafColor.setHSL(.27+(i%5)*.012,.32+(i%3)*.035,.24+(i%5)*.026);
    shrubs.setColorAt(i,leafColor);
  }
  shrubs.instanceMatrix.needsUpdate=true;shrubs.instanceColor.needsUpdate=true;
  shrubs.receiveShadow=true;group.add(shrubs);

  const coverRandom=worldRandom(world.seed^0x52ce19),coverDummy=new THREE.Object3D(),coverColor=new THREE.Color();
  const grassMaterial=createBreezeMaterial({color:0x587044,roughness:.9,side:THREE.DoubleSide});
  const grassCover=new THREE.InstancedMesh(grassTuftGeometry(world.seed),grassMaterial,980);
  grassCover.name='island-grass-tufts';
  for(let i=0;i<grassCover.count;i++){
    const angle=coverRandom()*TAU,radial=.62+Math.sqrt(coverRandom())*.34,point=islandPoint(world,radial,angle);
    const scale=.55+coverRandom()*1.45;
    coverDummy.position.set(point.x-center.x,point.y-WATER_SURFACE_Y+.01,point.z-center.z);
    coverDummy.rotation.set(0,coverRandom()*TAU,(coverRandom()-.5)*.08);
    coverDummy.scale.set(scale*(.8+coverRandom()*.45),scale,scale*(.8+coverRandom()*.45));
    coverDummy.updateMatrix();grassCover.setMatrixAt(i,coverDummy.matrix);
    coverColor.setHSL(.20+coverRandom()*.09,.23+coverRandom()*.23,.24+coverRandom()*.16);
    grassCover.setColorAt(i,coverColor);
  }
  grassCover.instanceMatrix.needsUpdate=true;grassCover.instanceColor.needsUpdate=true;

  const flowerMaterial=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.74,side:THREE.DoubleSide});
  const flowers=new THREE.InstancedMesh(wildflowerGeometry(),flowerMaterial,320);
  flowers.name='coastal-wildflowers';
  for(let i=0;i<flowers.count;i++){
    const angle=coverRandom()*TAU,radial=.68+Math.sqrt(coverRandom())*.26,point=islandPoint(world,radial,angle);
    const scale=.65+coverRandom()*.72;
    coverDummy.position.set(point.x-center.x,point.y-WATER_SURFACE_Y+.02,point.z-center.z);
    coverDummy.rotation.set(0,coverRandom()*TAU,0);coverDummy.scale.setScalar(scale);coverDummy.updateMatrix();
    flowers.setMatrixAt(i,coverDummy.matrix);
    coverColor.setHSL(i%5===0?.92:.085+coverRandom()*.07,.28+coverRandom()*.28,.67+coverRandom()*.16);
    flowers.setColorAt(i,coverColor);
  }
  flowers.instanceMatrix.needsUpdate=true;flowers.instanceColor.needsUpdate=true;
  group.add(grassCover,flowers);

  const houseLayout=islandHouseLayout(world);
  const houseCount=houseLayout.length;
  const roofMaterial=new THREE.MeshPhysicalMaterial({color:0x49605d,roughness:.54,...roofMaps,clearcoat:.2,clearcoatRoughness:.5});
  const wallDarkMaterial=new THREE.MeshPhysicalMaterial({color:0x5d665e,roughness:.78,...concreteMaps,clearcoat:.08});
  const walls=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),concrete,houseCount);
  const foundations=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),wallDarkMaterial,houseCount);
  const roofs=new THREE.InstancedMesh(gabledRoofGeometry(),roofMaterial,houseCount);
  const ridgeCaps=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),roofMaterial,houseCount);
  const houseLights=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),warmGlass,houseCount*3);
  const houseDoors=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),wallDarkMaterial,houseCount);
  for(let i=0;i<houseCount;i++){
    const house=houseLayout[i],lx=house.x-center.x,lz=house.z-center.z,base=house.y-WATER_SURFACE_Y,w=house.width,h=house.height;
    const cos=Math.cos(house.angle),sin=Math.sin(house.angle);
    const place=(mesh,index,ox,oy,oz,sx,sy,sz)=>{
      dummy.position.set(lx+ox*cos+oz*sin,base+oy,lz-ox*sin+oz*cos);
      dummy.rotation.set(0,house.angle,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
    };
    place(foundations,i,0,.13,0,w*1.08,.26,w*.88);
    dummy.position.set(lx,base+h/2,lz);dummy.scale.set(w,h,w*.78);dummy.rotation.set(0,house.angle,0);dummy.updateMatrix();walls.setMatrixAt(i,dummy.matrix);
    place(roofs,i,0,h+.02,0,w*1.12,1.1+((i%2)*.16),w*.91);
    place(ridgeCaps,i,0,h+1.12,0,w*1.02,.09,.12);
    for(let column=0;column<3;column++){
      const localX=(column-1)*w*.24,localZ=-w*.4;
      const wx=lx+localX*Math.cos(house.angle)+localZ*Math.sin(house.angle);
      const wz=lz-localX*Math.sin(house.angle)+localZ*Math.cos(house.angle);
      dummy.position.set(wx,base+h*(.43+(column%2)*.2),wz);
      dummy.scale.set(.58,.46,.05);dummy.rotation.set(0,house.angle,0);dummy.updateMatrix();
      houseLights.setMatrixAt(i*3+column,dummy.matrix);
    }
    place(houseDoors,i,0,.72,-w*.4,.68,1.22,.07);
  }
  for(const mesh of [foundations,walls,roofs,ridgeCaps,houseLights,houseDoors])mesh.instanceMatrix.needsUpdate=true;
  group.add(foundations,walls,roofs,ridgeCaps,houseLights,houseDoors);

  const roadMaterial=new THREE.MeshPhysicalMaterial({color:0x465353,roughness:.68,...roadMaps,clearcoat:.34,clearcoatRoughness:.42,envMapIntensity:.85});
  const roadLayout=islandRoadLayout(world);
  const roadShoulder=new THREE.Mesh(islandRoadGeometry(world,7.15),wallDarkMaterial);
  roadShoulder.position.y=-.055;roadShoulder.receiveShadow=true;roadShoulder.name='continuous-road-shoulder';group.add(roadShoulder);
  const roads=new THREE.Mesh(islandRoadGeometry(world,5.8),roadMaterial);
  roads.name='coastal-roads';
  roads.receiveShadow=true;group.add(roads);

  const litRoads=roadLayout.filter(road=>road.y!==null);
  const roadsideMaterial=new THREE.MeshStandardMaterial({color:0xc5c8b8,roughness:.7});
  const roadEdgeStrips=new THREE.InstancedMesh(new THREE.BoxGeometry(.085,.035,4.4),roadsideMaterial,litRoads.length*2);
  for(const [index,road] of litRoads.entries()){
    for(const side of [-1,1]){
      const localX=side*2.35;
      const x=road.x-center.x+localX*Math.cos(road.angle);
      const z=road.z-center.z-localX*Math.sin(road.angle);
      dummy.position.set(x,road.y-WATER_SURFACE_Y+.2,z);
      dummy.rotation.set(0,road.angle,0);dummy.scale.setScalar(1);dummy.updateMatrix();
      roadEdgeStrips.setMatrixAt(index*2+(side>0?1:0),dummy.matrix);
    }
  }
  roadEdgeStrips.instanceMatrix.needsUpdate=true;
  group.add(roadEdgeStrips);

  const roadLampPosts=new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.055,.085,3.2,7),
    new THREE.MeshStandardMaterial({color:0x344248,metalness:.48,roughness:.58}),
    litRoads.length,
  );
  const roadLampBulbs=new THREE.InstancedMesh(
    new THREE.SphereGeometry(.15,9,7),
    new THREE.MeshStandardMaterial({color:0x3a2712,emissive:0xffb653,emissiveIntensity:2.8,roughness:.35}),
    litRoads.length,
  );
  for(const [index,road] of litRoads.entries()){
    const offset=index%2?2.9:-2.9;
    const x=road.x-center.x+Math.cos(road.angle)*offset,z=road.z-center.z-Math.sin(road.angle)*offset,y=road.y-WATER_SURFACE_Y;
    dummy.position.set(x,y+1.55,z);dummy.rotation.set(0,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();roadLampPosts.setMatrixAt(index,dummy.matrix);
    dummy.position.y=y+3.12;dummy.updateMatrix();roadLampBulbs.setMatrixAt(index,dummy.matrix);
  }
  roadLampPosts.instanceMatrix.needsUpdate=roadLampBulbs.instanceMatrix.needsUpdate=true;
  group.add(roadLampPosts,roadLampBulbs);

  const lighthouse=new THREE.Group();lighthouse.name='gray-island-lighthouse';const lighthouseBase=groundAt(-23,8);
  lighthouse.add(new THREE.Mesh(new THREE.CylinderGeometry(2,2.7,13,18),concrete));
  const redBand=new THREE.Mesh(new THREE.CylinderGeometry(2.08,2.17,2.6,18),lacquer);redBand.position.y=2.2;lighthouse.add(redBand);
  const lantern=new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,2.1,12),warmGlass);lantern.position.y=7.4;lighthouse.add(lantern);
  const lanternCap=new THREE.Mesh(new THREE.ConeGeometry(1.72,.85,18),wallDarkMaterial);lanternCap.position.y=8.88;lighthouse.add(lanternCap);
  const beaconBeam=new THREE.Mesh(
    new THREE.ConeGeometry(4.6,42,18,1,true),
    new THREE.MeshBasicMaterial({color:0xffc878,transparent:true,opacity:.018,side:THREE.FrontSide,depthWrite:false,blending:THREE.AdditiveBlending}),
  );
  beaconBeam.rotation.z=Math.PI/2;beaconBeam.position.set(20,7.45,0);lighthouse.add(beaconBeam);
  lighthouse.position.set(-23,lighthouseBase,8);group.add(lighthouse);

  const breakwater=new THREE.Group();breakwater.name='southern-breakwater';
  const breakwaterY=1.0;
  const breakwaterBlocks=new THREE.InstancedMesh(new THREE.BoxGeometry(7.6,2.2,3.2),concrete,10);
  for(let i=0;i<10;i++){
    dummy.position.set(-24+i*4.8,breakwaterY,ISLAND_RADIUS_Z*.88-i*1.2);
    dummy.rotation.set(0,-.16+i*.012,0);dummy.scale.setScalar(1);dummy.updateMatrix();breakwaterBlocks.setMatrixAt(i,dummy.matrix);
  }
  breakwaterBlocks.instanceMatrix.needsUpdate=true;breakwater.add(breakwaterBlocks);
  const harborBeacon=new THREE.Group();harborBeacon.position.set(20,breakwaterY+1.1,ISLAND_RADIUS_Z*.77);
  harborBeacon.add(new THREE.Mesh(new THREE.CylinderGeometry(.8,.95,7,12),lacquer));
  const harborLantern=new THREE.Mesh(new THREE.CylinderGeometry(.72,.72,1.2,10),warmGlass);harborLantern.position.y=4;harborBeacon.add(harborLantern);
  breakwater.add(harborBeacon);group.add(breakwater);

  const gate=new THREE.Group();gate.name='gray-island-torii';const gateBase=groundAt(2,28);
  for(const side of [-1,1]){const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.35,.45,7,10),lacquer);pillar.position.set(side*3.2,3.5,0);gate.add(pillar);}
  const upper=new THREE.Mesh(new THREE.BoxGeometry(8.8,.55,.7),lacquer);upper.position.y=6.8;gate.add(upper);
  const lower=new THREE.Mesh(new THREE.BoxGeometry(7.2,.35,.55),lacquer);lower.position.y=5.45;gate.add(lower);
  const topCap=new THREE.Mesh(new THREE.CylinderGeometry(.29,.29,10.4,12),lacquer);topCap.rotation.z=Math.PI/2;topCap.position.y=7.12;gate.add(topCap);
  const plaque=new THREE.Mesh(new THREE.BoxGeometry(1.3,1.05,.14),wallDarkMaterial);plaque.position.set(0,6.18,-.4);gate.add(plaque);
  gate.position.set(2,gateBase,28);group.add(gate);

  const bridgeCount=9,bridgeBase=groundAt(10,27);
  const bridgeDeckMaterial=new THREE.MeshStandardMaterial({color:0x62473a,roughness:.78});
  const bridgeDeck=new THREE.InstancedMesh(new THREE.BoxGeometry(4.2,.2,1.35),bridgeDeckMaterial,bridgeCount);
  const bridgeRail=new THREE.InstancedMesh(new THREE.BoxGeometry(.11,.75,1.36),lacquer,bridgeCount*2);
  for(let i=0;i<bridgeCount;i++){
    const t=i/(bridgeCount-1),z=27+i*1.02,y=bridgeBase+Math.sin(t*Math.PI)*1.85;
    dummy.position.set(10,y,z);dummy.rotation.set(Math.cos(t*Math.PI)*.12,0,0);dummy.scale.setScalar(1);dummy.updateMatrix();bridgeDeck.setMatrixAt(i,dummy.matrix);
    for(const side of [-1,1]){
      dummy.position.set(10+side*2.02,y+.45,z);dummy.updateMatrix();bridgeRail.setMatrixAt(i*2+(side>0?1:0),dummy.matrix);
    }
  }
  bridgeDeck.instanceMatrix.needsUpdate=bridgeRail.instanceMatrix.needsUpdate=true;
  group.add(bridgeDeck,bridgeRail);

  const shrine=new THREE.Group();shrine.name='hillside-shrine';const shrineBase=groundAt(10,34);
  const shrinePlatform=new THREE.Mesh(new THREE.CylinderGeometry(3.1,3.6,.45,8),new THREE.MeshStandardMaterial({color:0x887861,roughness:.9}));shrinePlatform.position.y=.23;shrine.add(shrinePlatform);
  const shrineHall=new THREE.Mesh(new THREE.BoxGeometry(5.4,3.2,4.8),new THREE.MeshStandardMaterial({color:0xd7ccb2,roughness:.88}));shrineHall.position.y=2.05;shrine.add(shrineHall);
  const shrineRoof=new THREE.Mesh(new THREE.ConeGeometry(4.4,1.35,4),lacquer);shrineRoof.rotation.y=Math.PI/4;shrineRoof.position.y=4.35;shrine.add(shrineRoof);
  for(let i=0;i<5;i++){const step=new THREE.Mesh(new THREE.BoxGeometry(4.5,.13,.28),concrete);step.position.set(0,.25+i*.16,-2.8-i*.28);shrine.add(step);}
  const shrinePlaque=createWallNotice(signTexture(ISLAND_MARKS.shrine.lines,ISLAND_MARKS.shrine.options),{width:1.5,height:.8});
  shrinePlaque.name='shrine-plaque';
  shrinePlaque.position.set(0,2.6,2.45);
  shrine.add(shrinePlaque);

  shrine.position.set(10,shrineBase,34);group.add(shrine);

  // Layered islets give the horizon readable depth without adding unique
  // geometry for every rock.
  const isletRockMaterial=new THREE.MeshPhysicalMaterial({color:0x526562,roughness:.82,metalness:.01,clearcoat:.08,emissive:0x071211,emissiveIntensity:.15,flatShading:true,normalMap:cliffMaps.normalMap,normalScale:new THREE.Vector2(.65,.65)});
  const isletGreenMaterial=createBreezeMaterial({color:0x273f35,roughness:.88,flatShading:true});
  const isletRocks=new THREE.InstancedMesh(islandOutcropGeometry(world.seed^0x18a3),isletRockMaterial,7);
  const isletCaps=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),isletGreenMaterial,7);
  const isletFoam=new THREE.InstancedMesh(
    new THREE.RingGeometry(.8,1.28,32),
    new THREE.MeshBasicMaterial({color:0xc9eee9,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}),
    7,
  );
  isletFoam.name='offshore-islet-waterline';
  for(let i=0;i<7;i++){
    const angle=.28+i/7*TAU+.018*Math.sin(i*3.1),radius=176+(i%3)*27,width=6.5+(i%4)*2.6,height=8+(i%3)*3.4;
    const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
    dummy.position.set(x,height*.25-1.8,z);dummy.rotation.set(.04*Math.sin(i),angle*.7,.03*Math.cos(i));dummy.scale.set(width,height,width*.72);dummy.updateMatrix();isletRocks.setMatrixAt(i,dummy.matrix);
    dummy.position.y=height*.68-1.2;dummy.rotation.set(.08*Math.sin(i*1.7),angle*.9,.06*Math.cos(i*1.3));dummy.scale.set(width*.53,.85+i%2*.35,width*.36);dummy.updateMatrix();isletCaps.setMatrixAt(i,dummy.matrix);
    dummy.position.set(x,.08,z);dummy.rotation.set(-Math.PI/2,0,angle);dummy.scale.set(width*.85,width*.62,1);dummy.updateMatrix();isletFoam.setMatrixAt(i,dummy.matrix);
  }
  isletRocks.instanceMatrix.needsUpdate=isletCaps.instanceMatrix.needsUpdate=isletFoam.instanceMatrix.needsUpdate=true;
  group.add(isletRocks,isletCaps,isletFoam);

  const birdGeometry=new THREE.BufferGeometry();
  birdGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0,-1.05,.08,.3,-.18,0,.06,
    0,0,0,.18,0,.06,1.05,.08,.3,
  ],3));
  birdGeometry.computeVertexNormals();
  const seaBirds=new THREE.InstancedMesh(
    birdGeometry,
    new THREE.MeshStandardMaterial({color:0xd9ded2,roughness:.82,side:THREE.DoubleSide}),
    18,
  );
  seaBirds.name='coastal-bird-flock';
  seaBirds.frustumCulled=false;
  seaBirds.userData.birds=Array.from({length:18},(_,index)=>({
    radius:42+(index%6)*8,
    height:19+(index%5)*1.4,
    phase:index*.91,
    speed:.055+(index%4)*.008,
    scale:.48+(index%3)*.12,
  }));
  group.add(seaBirds);

  const settlement=createHumanSettlement();
  const shore=islandShorePoint(world,Math.PI/2);
  settlement.position.set(shore.x-center.x,0,shore.z-center.z-1.5);
  group.add(settlement);
  const population=createIslandPopulation(groundAt);group.add(population);
  const shadowExclusions=new Set([outerSurf,shoreFoam,seaBirds,industrialSmoke,isletRocks,isletCaps,isletFoam,grassCover,flowers]);
  const shadowScale=new THREE.Vector3();
  group.updateWorldMatrix(true,true);
  group.traverse(node=>{
    if(!node.isMesh||shadowExclusions.has(node)||node.material?.transparent)return;
    node.receiveShadow=true;
    if(node.isInstancedMesh){node.castShadow=true;return;}
    node.geometry.computeBoundingSphere();
    node.getWorldScale(shadowScale);
    const radius=(node.geometry.boundingSphere?.radius||0)*Math.max(shadowScale.x,shadowScale.y,shadowScale.z);
    // Large terrain, roofs, ships and industrial shells throw useful silhouettes.
    // Individual hands, rails, windows and crowd parts stay in the receive pass;
    // rendering every small island detail into the shadow map doubled draw calls.
    node.castShadow=radius>=2.4;
  });
  // ---- 日式细节：让岛看起来是有人住的地方 ----
  const poleRoutes=[{from:[-2,4],to:[16,-2],count:7},{from:[2,26],to:[11,36],count:5}];
  const utilityPoles=createUtilityPoles(groundAt,poleRoutes,world.seed);
  group.add(mergeStaticGroup(utilityPoles));

  const rooftopAppliances=createRooftopAppliances(groundAt,[
    {x:-14,z:16,width:3,depth:2.6,height:2.4},{x:-6,z:22,width:3,depth:2.6,height:2.6},
    {x:6,z:20,width:3,depth:2.6,height:2.3},{x:15,z:12,width:3,depth:2.6,height:2.5},
    {x:-18,z:6,width:3,depth:2.6,height:2.2},{x:20,z:2,width:3,depth:2.6,height:2.4},
  ],world.seed);
  group.add(mergeStaticGroup(rooftopAppliances));

  const greenhouses=createGreenhouses(groundAt,[
    {x:24,z:-16,length:11,width:3.4,rows:3},{x:24,z:-24,length:9,width:3.2,rows:2},
    {x:-26,z:22,length:10,width:3.2,rows:2},
  ],world.seed);
  group.add(mergeStaticGroup(greenhouses));

  const paddies=createRicePaddies(groundAt,[
    {x:-20,z:-18,width:15,depth:11,columns:3,rows:2},
    {x:20,z:30,width:13,depth:9,columns:2,rows:2},
  ]);
  group.add(mergeStaticGroup(paddies));

  const shrinePath=[];
  for(let step=0;step<6;step++)shrinePath.push({x:6+step*1.2,z:27+step*1.5});
  const lanterns=createStoneLanterns(groundAt,shrinePath);
  group.add(mergeStaticGroup(lanterns));

  // 商店街：沿路的一排小店，招牌是日文。
  const shopRow=createShopRow(groundAt,[
    {x:-1,z:31,width:5.6,depth:4.4,height:3.3,angle:-Math.PI/2,awning:0,sign:ISLAND_MARKS.shop},
    {x:-1,z:37,width:5.2,depth:4.2,height:3.1,angle:-Math.PI/2,awning:1,sign:ISLAND_MARKS.konbini},
    {x:-1.5,z:43,width:5,depth:4,height:3,angle:-Math.PI/2,awning:2,sign:ISLAND_MARKS.soba},
    {x:-2,z:49,width:5.4,depth:4.2,height:3.2,angle:-Math.PI/2,awning:3,sign:ISLAND_MARKS.shop},
  ]);
  group.add(mergeStaticGroup(shopRow));

  const vendingMachines=createVendingMachines(groundAt,[
    {x:-6.4,z:33.6,angle:-Math.PI/2},
    {x:-5.4,z:44.4,angle:-Math.PI/2},
    {x:-6.2,z:50.6,angle:-Math.PI/2},
  ]);
  group.add(mergeStaticGroup(vendingMachines));

  const postBoxes=createPostBoxes(groundAt,[{x:-5.8,z:39.4},{x:-4.6,z:47.2}]);
  group.add(mergeStaticGroup(postBoxes));

  // 沿海公路的白色护栏。
  const guardrailPath=[];
  const roadPoints=islandRoadLayout(world).filter(point=>point.y!==null);
  for(let i=0;i<roadPoints.length;i+=2){
    const point=roadPoints[i];
    guardrailPath.push({x:point.x-center.x-4.1,z:point.z-center.z});
  }
  if(guardrailPath.length>1)group.add(mergeStaticGroup(createGuardrails(groundAt,guardrailPath)));

  // 渔港的港名牌
  const portSign=createSignBoard(signTexture(ISLAND_MARKS.port.lines,ISLAND_MARKS.port.options),{width:5.2,height:2.5,postHeight:1.9});
  portSign.name='harbor-name-board';
  portSign.position.set(shore.x-center.x+7.4,1.6,shore.z-center.z-4.2);
  portSign.rotation.y=-.42;
  group.add(portSign);

  // 排放站外围的立式警告牌
  const barrierSign=createSignBoard(signTexture(ISLAND_MARKS.barrier.lines,ISLAND_MARKS.barrier.options),{width:3.6,height:1.9,postHeight:1.5});
  barrierSign.name='plant-barrier-sign';
  barrierSign.position.set(12,plantBase+1.7,-16.5);
  barrierSign.rotation.y=Math.PI*.92;
  group.add(barrierSign);

  group.userData.humanSettlement=settlement;group.userData.streetPopulation=population;group.userData.radar=radar;group.userData.beacon=beacon;
  group.userData.breezeMaterials=[cedarLeafMaterial,pineLeafMaterial,broadleafLeafMaterial,foliageCoreMaterial,shrubMaterial,grassMaterial,isletGreenMaterial];
  group.userData.seaBirds=seaBirds;
  group.userData.grassCover=grassCover;
  group.userData.wildflowers=flowers;
  group.userData.industrialSmoke=industrialSmoke;
  group.userData.industrialSmokeSeeds=smokeSeeds;
  group.userData.shoreFoamTextures=[shoreFoamTexture];
  group.position.set(center.x,WATER_SURFACE_Y,center.z);
  group.userData.restY=WATER_SURFACE_Y;return group;
}
