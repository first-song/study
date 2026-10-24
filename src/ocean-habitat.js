import * as THREE from '../node_modules/three/build/three.module.js';
import { seabedHeight, WATER_SURFACE_Y } from './biology.js';
import { createWorld, worldRandom, biomeAt } from './world.js';
import { ART_PALETTE, createSurfaceMaps } from './visual-materials.js';
export { seabedHeight } from './biology.js';

const TAU=Math.PI*2, fallbackWorld=createWorld(4721);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=v=>v*v*(3-2*v);

function addCaustics(material,clock,strength=.1) {
  material.onBeforeCompile=shader=>{
    shader.uniforms.habitatTime=clock;
    shader.vertexShader=`varying vec3 habitatWorld;\n${shader.vertexShader}`.replace('#include <project_vertex>',`
      vec4 habitatPoint=vec4(transformed,1.0);
      #ifdef USE_INSTANCING
      habitatPoint=instanceMatrix*habitatPoint;
      #endif
      habitatWorld=(modelMatrix*habitatPoint).xyz;
      #include <project_vertex>`);
    shader.fragmentShader=`uniform float habitatTime;varying vec3 habitatWorld;\n${shader.fragmentShader}`.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec2 c=habitatWorld.xz*1.1;
      float web=sin(c.x+sin(c.y*1.2+habitatTime*.34))+cos(c.y+sin(c.x*.8-habitatTime*.29));
      float caustic=pow(1.0-abs(sin(web*2.2)),12.0);
      diffuseColor.rgb+=vec3(.43,.70,.61)*caustic*smoothstep(14.0,44.0,habitatWorld.y)*${strength.toFixed(3)};
    `);
  };
  material.customProgramCacheKey=()=>`habitat-caustics-${strength}`;
}

export function createSeabed(world=fallbackWorld) {
  const extent=world.radius*2+100,resolution=world.radius>200?160:110;
  const geometry=new THREE.PlaneGeometry(extent,extent,resolution,resolution);geometry.rotateX(-Math.PI/2);
  const p=geometry.attributes.position,colors=new Float32Array(p.count*3),color=new THREE.Color();
  const sand=new THREE.Color(0x7b816e),silt=new THREE.Color(0x2a4649),blue=new THREE.Color(0x12283c);
  const ochre=new THREE.Color(0x857157),teal=new THREE.Color(0x356b68),olive=new THREE.Color(0x526044);
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i),biome=biomeAt(world,{x,z});p.setY(i,seabedHeight(x,z));
    color.copy(sand).lerp(silt,.38+Math.sin(x*.045+z*.09)*.15+Math.cos(x*.11)*.11);
    if(biome?.id==='nursery')color.lerp(teal,.2);
    if(biome?.id==='kelp')color.lerp(olive,.32);
    if(biome?.id==='coral')color.lerp(ochre,.34);
    if(biome?.id==='abyss')color.lerp(blue,.68);
    if(biome?.id==='vents')color.multiplyScalar(.58);
    color.multiplyScalar(.92+Math.sin(x*1.2+Math.sin(z*.6))*.055);colors.set(color.toArray(),i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();
  const textures=createSurfaceMaps('seabed',{size:160,repeat:extent/18,seed:world.seed^325,normalStrength:.72});
  const material=new THREE.MeshPhysicalMaterial({
    vertexColors:true,roughness:.83,metalness:.005,...textures,
    normalScale:new THREE.Vector2(.52,.52),clearcoat:.08,clearcoatRoughness:.7,
  });
  const mesh=new THREE.Mesh(geometry,material);mesh.name='rippled-sediment';mesh.userData.worldSeed=world.seed;return mesh;
}

function irregularRock(detail=2) {
  const g=new THREE.SphereGeometry(1,detail>=2?15:11,detail>=2?10:7),p=g.attributes.position;
  const vertexColors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const ridge=Math.sin(x*5.7+y*3.1+detail)*Math.cos(z*4.8-x*2.4)*.18+
      Math.sin(y*10.5+z*6.2)*.075;
    const noise=1+ridge;
    p.setXYZ(i,x*noise,y*noise*(.72+Math.sin(x*3.1-z*2.7)*.08),z*noise);
    const shade=.62+Math.max(0,y)*.28+Math.sin(x*5.3+z*4.1)*.04;
    vertexColors[i*3]=shade;vertexColors[i*3+1]=shade*.99;vertexColors[i*3+2]=shade;
  }
  g.setAttribute('color',new THREE.BufferAttribute(vertexColors,3));
  g.computeVertexNormals();return g;
}
function merge(parts) {
  const gs=parts.map(g=>g.index?g.toNonIndexed():g.clone()),count=gs.reduce((sum,g)=>sum+g.attributes.position.count,0),result=new THREE.BufferGeometry();
  for(const [name,size]of [['position',3],['normal',3],['uv',2]]) {
    const array=new Float32Array(count*size);let offset=0;
    for(const g of gs){if(g.attributes[name])array.set(g.attributes[name].array,offset);offset+=g.attributes.position.count*size;}
    result.setAttribute(name,new THREE.BufferAttribute(array,size));
  }
  for(const g of [...gs,...parts])g.dispose();result.computeBoundingSphere();return result;
}
function tube(points,radius,segments=8,sides=5) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,sides,false);
}
function coralBranches() {
  const parts=[tube([[0,0,0],[.06,.42,0],[-.05,.88,0],[.08,1.24,.03]],.11,7,6)];
  for(let i=0;i<9;i++) {
    const a=i*2.399,y=.18+i*.075,spread=.82-i*.045,x=Math.cos(a)*spread,z=Math.sin(a)*spread;
    const forkX=x*1.22+Math.cos(a+1.4)*.18,forkZ=z*1.22+Math.sin(a+1.4)*.18;
    parts.push(tube([[0,y,0],[x*.58,y+.22,z*.58],[x,y+.55,z]],.052,3,4));
    parts.push(tube([[x*.52,y+.2,z*.52],[forkX,y+.48,forkZ],[forkX*1.16,y+.79,forkZ*1.16]],.03,3,3));
    for(const [tipX,tipY,tipZ] of [[forkX*1.16,y+.8,forkZ*1.16],[x,y+.56,z]]) {
      const tip=new THREE.SphereGeometry(.052+(i%3)*.009,4,3);tip.translate(tipX,tipY,tipZ);parts.push(tip);
    }
  }
  return merge(parts);
}
function coralPlate() {
  const p=[],uv=[],indices=[],segments=26,rings=4;
  for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++) {
    const a=i/segments*TAU,r=ring/rings,spread=r*(1+Math.sin(a*7)*.06+Math.sin(a*11)*.025);
    p.push(Math.cos(a)*spread,.1+.28*r*r+Math.sin(a*9)*.05*r,Math.sin(a)*spread);uv.push((Math.cos(a)*r+1)*.5,(Math.sin(a)*r+1)*.5);
    if(ring<rings&&i<segments){const n=ring*(segments+1)+i;indices.push(n,n+segments+1,n+1,n+1,n+segments+1,n+segments+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function anemoneGeometry() {
  const parts=[new THREE.SphereGeometry(.15,6,4)];
  for(let i=0;i<9;i++) {
    const a=i/9*TAU,r=.22+(i%3)*.06;
    parts.push(tube([
      [Math.cos(a)*.08,.08,Math.sin(a)*.08],
      [Math.cos(a)*r,.48,Math.sin(a)*r],
      [Math.cos(a)*(r+.12),.92+(i%4)*.12,Math.sin(a)*(r+.12)],
      [Math.cos(a)*(r+.2),1.08+(i%5)*.1,Math.sin(a)*(r+.2)],
    ],.025+(i%2)*.008,4,3));
  }
  return merge(parts);
}
function spongeGeometry() {
  const parts=[];
  for(let i=0;i<5;i++) {
    const a=i*2.399,r=.12+(i%3)*.14,height=.65+(i%5)*.18;
    parts.push(tube([[Math.cos(a)*r*.3,0,Math.sin(a)*r*.3],[Math.cos(a)*r,height*.55,Math.sin(a)*r],[Math.cos(a)*r*1.16,height,Math.sin(a)*r*1.16]],.055+(i%2)*.014,5,4));
    const rim=new THREE.TorusGeometry(.075+(i%2)*.018,.018,4,7);rim.rotateX(Math.PI/2);rim.translate(Math.cos(a)*r*1.16,height,Math.sin(a)*r*1.16);parts.push(rim);
  }
  return merge(parts);
}
function filterFanGeometry() {
  const parts=[tube([[0,0,0],[.08,.62,0],[.02,1.32,.04]],.045,8,4)];
  for(let i=0;i<9;i++) {
    const side=i%2?1:-1;
    parts.push(tube([[0,.55,0],[side*(.25+i*.035),.85+i*.035,0],[side*(.42+i*.045),1.15+i*.06,.05]],.022,6,4));
  }
  return merge(parts);
}
function shelfHeight(l,x,z) {
  const dx=x-l.x,dz=z-l.z,a=Math.atan2(dz,dx),radius=l.radius*(1+Math.sin(a*5+.7)*.075+Math.cos(a*3)*.08);
  const r=Math.hypot(dx,dz)/radius,base=seabedHeight(x,z),falloff=1-smooth(clamp((r-.58)/.42,0,1));
  return base+(l.y-base)*falloff+Math.sin(x*.31+z*.22)*.3*falloff;
}
function shelfGeometry(l) {
  const segments=80,rings=20,p=[],uv=[],colors=[],indices=[],color=new THREE.Color();
  const low=new THREE.Color(0x3c5352),high=new THREE.Color(l.biome==='kelp'?0x849173:0xaea78b);
  for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++) {
    const a=i/segments*TAU,r=ring/rings*l.radius,contour=1+Math.sin(a*5+.7)*.075+Math.cos(a*3)*.08;
    const x=l.x+Math.cos(a)*r*contour,z=l.z+Math.sin(a)*r*contour,y=shelfHeight(l,x,z);
    p.push(x,y,z);uv.push(x/8,z/8);color.copy(low).lerp(high,clamp(y/l.y,0,1)*.85);color.multiplyScalar(.89+Math.sin(y*3.5+Math.cos(x*.3))*.06);colors.push(color.r,color.g,color.b);
    if(ring<rings&&i<segments){const n=ring*(segments+1)+i;indices.push(n,n+1,n+segments+1,n+1,n+segments+2,n+segments+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
function kelpGeometry() {
  const parts=[tube([[0,0,0],[.13,1.5,0],[-.2,3.3,.18],[.3,5,.08],[.05,7,.5]],.045,15,4)];
  for(let i=1;i<12;i++) {
    const g=new THREE.PlaneGeometry(1.6,.38,8,2),p=g.attributes.position,side=i%2?1:-1;
    for(let k=0;k<p.count;k++){const x=p.getX(k)+.8,y=p.getY(k),t=x/1.6;p.setXYZ(k,x*side,i*.5+Math.sin(t*2)*.48+y*Math.sin(t*Math.PI),Math.sin(t*3)*.15);}
    g.rotateY(i*2.4);g.computeVertexNormals();parts.push(g);
  }
  return merge(parts);
}
function urchinGeometry() {
  const parts=[new THREE.SphereGeometry(.16,8,6)];
  for(let index=0;index<18;index++){
    const angle=index/18*TAU,ring=(index%4)*.38-.55;
    const spike=new THREE.CylinderGeometry(.004,.014,.38+(index%3)*.055,3,1);
    spike.rotateX(Math.PI*.5+ring);
    spike.rotateY(angle);
    spike.translate(Math.cos(angle)*.14,Math.sin(ring)*.12,Math.sin(angle)*.14);
    parts.push(spike);
  }
  return merge(parts);
}
function brittleStarGeometry() {
  const parts=[new THREE.SphereGeometry(.1,10,7)];
  for(let index=0;index<5;index++){
    const angle=index/5*TAU;
    parts.push(tube([
      [Math.cos(angle)*.05,.02,Math.sin(angle)*.05],
      [Math.cos(angle)*.32,.055,Math.sin(angle)*.32],
      [Math.cos(angle+.22)*.58,.025,Math.sin(angle+.22)*.58],
      [Math.cos(angle+.34)*.82,.012,Math.sin(angle+.34)*.82],
    ],.035,7,4));
  }
  return merge(parts);
}
function waving(material,clock) {
  addCaustics(material,clock,.18);const compile=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    compile(shader);
    shader.vertexShader=`uniform float habitatTime;\n${shader.vertexShader}`.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vec3 plantAnchor=vec3(0.0);
      #ifdef USE_INSTANCING
      plantAnchor=instanceMatrix[3].xyz;
      #endif
      float wave=sin(habitatTime*.8+plantAnchor.x*.17+plantAnchor.z*.23+position.y*.4);
      transformed.x+=wave*position.y*.075;
      transformed.z+=cos(habitatTime*.61+plantAnchor.z*.22+position.y*.34)*position.y*.045;
    `);
  };
  material.customProgramCacheKey=()=> 'habitat-waving-v2';
}
function archGeometry(radius) {
  const path=[];
  for(let i=0;i<=20;i++){const t=i/20,a=t*Math.PI;path.push(new THREE.Vector3(Math.cos(a)*radius,Math.sin(a)*radius*.75,Math.sin(t*TAU)*radius*.07));}
  const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),40,radius*.17,10,false),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,x+Math.sin(y*1.5+z*.6)*.5,y+Math.sin(x*.8+z)*.4,z+Math.sin(x*.6+y)*.55);}
  g.computeVertexNormals();return g;
}

export function createHabitatDetails(world=fallbackWorld) {
  const group=new THREE.Group(),random=worldRandom(world.seed^0x7394a2),dummy=new THREE.Object3D(),color=new THREE.Color(),clock={value:0};
  const textures=createSurfaceMaps('rock',{size:144,repeat:2.15,seed:world.seed^4029,normalStrength:1.25});
  const rockMaterial=new THREE.MeshPhysicalMaterial({
    color:0xe8ede6,vertexColors:true,roughness:.75,metalness:.015,...textures,
    normalScale:new THREE.Vector2(.78,.78),clearcoat:.13,clearcoatRoughness:.55,
  });
  addCaustics(rockMaterial,clock);
  group.name='benthic-habitat';group.userData.worldSeed=world.seed;group.userData.clock=clock;
  const pebbleMaterial=rockMaterial.clone();pebbleMaterial.vertexColors=false;
  const expanded=world.radius>200,rocks=new THREE.InstancedMesh(irregularRock(),rockMaterial,expanded?410:170);
  const pebbles=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),pebbleMaterial,expanded?1200:440);
  rocks.name='eroded-rock-fields';pebbles.name='mineral-fragments';
  const put=(mesh,index,x,y,z,sx,sy,sz,yaw=random()*TAU)=>{dummy.position.set(x,y,z);dummy.rotation.set(0,yaw,0);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);};
  for(let i=0;i<rocks.count;i++) {
    const biome=world.biomes[1+i%(world.biomes.length-1)],a=random()*TAU,r=Math.sqrt(random())*biome.radius*1.5,x=biome.x+Math.cos(a)*r,z=biome.z+Math.sin(a)*r;
    const size=1+random()*5.8,ridge=biome.id==='abyss'||biome.id==='ruins';
    put(rocks,i,x,seabedHeight(x,z)+size*.19,z,size*(.75+random()*.6),size*(ridge?1+random()*2.4:.4+random()*.9),size*(.65+random()*.8));
    color.setHSL(.46+random()*.12,.08+random()*.09,.43+random()*.2);rocks.setColorAt(i,color);
  }
  for(let i=0;i<pebbles.count;i++) {
    const a=random()*TAU,r=Math.sqrt(random())*world.radius,x=Math.cos(a)*r,z=Math.sin(a)*r;
    put(pebbles,i,x,seabedHeight(x,z)+.05,z,.15+random()*.8,.1+random()*.4,.18+random()*.9);color.setHSL(.12+random()*.1,.06+random()*.13,.38+random()*.18);pebbles.setColorAt(i,color);
  }
  group.add(rocks,pebbles);group.userData.rocks=rocks;group.userData.pebbles=pebbles;
  const shelfTextures=createSurfaceMaps('sand',{size:144,repeat:1.9,seed:world.seed^0x5a7e,normalStrength:.82});
  const shelfMaterial=new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.8,...shelfTextures,normalScale:new THREE.Vector2(.56,.56),clearcoat:.06,clearcoatRoughness:.75});addCaustics(shelfMaterial,clock,.16);
  const shelves=world.landmarks.filter(l=>l.kind==='shelf'||l.kind==='reef');
  for(const l of shelves){const mesh=new THREE.Mesh(shelfGeometry(l),shelfMaterial);mesh.name=l.id;group.add(mesh);}
  const kelpShelf=shelves.find(l=>l.biome==='kelp')||shelves[0],coralShelf=shelves.find(l=>l.biome==='coral')||shelves[0];
  const nurseryShelf=shelves.find(l=>l.biome==='nursery')||coralShelf;
  const shelfPoint=(shelf,spread=.6)=>{const a=random()*TAU,r=Math.sqrt(random())*shelf.radius*spread,x=shelf.x+Math.cos(a)*r,z=shelf.z+Math.sin(a)*r;return{x,y:shelfHeight(shelf,x,z),z};};
  const bladeGeometry=new THREE.PlaneGeometry(.22,2.8,1,7),blade=bladeGeometry.attributes.position;
  for(let i=0;i<blade.count;i++){const y=blade.getY(i)+1.4,t=y/2.8;blade.setXYZ(i,blade.getX(i)*(1-t*.96)+Math.sin(t*2.4)*.3,y,Math.sin(t*1.8)*.22);}bladeGeometry.computeVertexNormals();
  const grassMaterial=new THREE.MeshStandardMaterial({color:0xe1e8d7,side:THREE.DoubleSide,roughness:.72});waving(grassMaterial,clock);
  const grass=new THREE.InstancedMesh(bladeGeometry,grassMaterial,1800);grass.name='flowing-seagrass';
  for(let i=0;i<grass.count;i++){
    const shelf=i%5<2?nurseryShelf:kelpShelf;
    const p=shelfPoint(shelf,shelf===nurseryShelf?.9:.68);
    put(grass,i,p.x,p.y,p.z,.65+random(),.34+random()*.72,1);
    color.setHSL(.18+random()*.105,.22+random()*.3,.23+random()*.16);
    grass.setColorAt(i,color);
  }
  const kelpMaterial=new THREE.MeshStandardMaterial({color:0x66854b,side:THREE.DoubleSide,roughness:.6});waving(kelpMaterial,clock);
  const kelp=new THREE.InstancedMesh(kelpGeometry(),kelpMaterial,110);kelp.name='kelp-canopy';
  for(let i=0;i<kelp.count;i++){
    const p=shelfPoint(i%4===0?nurseryShelf:kelpShelf,i%4===0?.76:.62);
    put(kelp,i,p.x,p.y,p.z,.7+random()*.5,.65+random()*.95,.7+random()*.5);
  }
  group.add(grass,kelp);group.userData.grass=grass;group.userData.kelp=kelp;
  const nurseryGrass=new THREE.InstancedMesh(bladeGeometry,grassMaterial,860);nurseryGrass.name='nursery-seagrass-meadow';
  const nurseryKelp=new THREE.InstancedMesh(kelpGeometry(),kelpMaterial,72);nurseryKelp.name='nursery-kelp-young-growth';
  for(let i=0;i<nurseryGrass.count;i++){
    const p=shelfPoint(nurseryShelf,.92);
    put(nurseryGrass,i,p.x,p.y,p.z,.8+random()*.8,.42+random()*.8,.8+random()*.7);
    color.setHSL(.18+random()*.11,.24+random()*.3,.24+random()*.17);
    nurseryGrass.setColorAt(i,color);
  }
  for(let i=0;i<nurseryKelp.count;i++){
    const p=shelfPoint(nurseryShelf,.8),scale=.42+random()*.32;
    put(nurseryKelp,i,p.x,p.y,p.z,scale,scale*(.65+random()*.65),scale);
    color.setHSL(.22+random()*.08,.36+random()*.26,.3+random()*.16);
    nurseryKelp.setColorAt(i,color);
  }
  nurseryGrass.instanceMatrix.needsUpdate=nurseryKelp.instanceMatrix.needsUpdate=true;
  nurseryGrass.instanceColor.needsUpdate=nurseryKelp.instanceColor.needsUpdate=true;
  const ribbonGrassMaterial=new THREE.MeshStandardMaterial({color:0xc8ceaa,side:THREE.DoubleSide,roughness:.7});
  waving(ribbonGrassMaterial,clock);
  const nurseryRibbonGrass=new THREE.InstancedMesh(bladeGeometry,ribbonGrassMaterial,480);
  nurseryRibbonGrass.name='nursery-ribbon-seagrass';
  for(let i=0;i<nurseryRibbonGrass.count;i++){
    const p=shelfPoint(nurseryShelf,.94);
    put(nurseryRibbonGrass,i,p.x,p.y,p.z,.32+random()*.52,.58+random()*.9,.55+random()*.8);
    color.setHSL(.14+random()*.12,.2+random()*.27,.27+random()*.16);
    nurseryRibbonGrass.setColorAt(i,color);
  }
  nurseryRibbonGrass.instanceMatrix.needsUpdate=true;
  nurseryRibbonGrass.instanceColor.needsUpdate=true;
  group.add(nurseryGrass,nurseryKelp,nurseryRibbonGrass);
  group.userData.nurseryGrass=nurseryGrass;group.userData.nurseryKelp=nurseryKelp;
  group.userData.nurseryRibbonGrass=nurseryRibbonGrass;
  const coralMaterial=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:.5,metalness:0,clearcoat:.3,clearcoatRoughness:.38,sheen:.28,sheenColor:new THREE.Color(0xffc1cb),normalMap:textures.normalMap,normalScale:new THREE.Vector2(.14,.14)});addCaustics(coralMaterial,clock,.17);
  const corals=new THREE.InstancedMesh(coralBranches(),coralMaterial,220);corals.name='branching-corals';
  const plateMaterial=new THREE.MeshPhysicalMaterial({color:0xeadbce,side:THREE.DoubleSide,roughness:.6,clearcoat:.2,clearcoatRoughness:.45,normalMap:textures.normalMap,normalScale:new THREE.Vector2(.35,.35)});addCaustics(plateMaterial,clock,.2);
  const plates=new THREE.InstancedMesh(coralPlate(),plateMaterial,270);plates.name='terraced-plate-corals';
  for(let i=0;i<corals.count;i++) {
    const shelf=i%4?coralShelf:shelves.find(l=>l.biome==='nursery')||coralShelf,p=shelfPoint(shelf,.8),scale=.62+random()*1.45;
    put(corals,i,p.x,p.y,p.z,scale,scale*(.7+random()*.35),scale);
    color.setHSL(
      i%7===0?.86+random()*.08:.015+random()*.1,
      .24+random()*.27,
      .32+random()*.16,
    );corals.setColorAt(i,color);
  }
  for(let i=0;i<plates.count;i++){const p=shelfPoint(coralShelf,.88),scale=.58+random()*1.75;put(plates,i,p.x,p.y+(i%3)*.42,p.z,scale,.62+random()*.55,scale);color.setHSL(.035+random()*.11,.22+random()*.24,.32+random()*.19);plates.setColorAt(i,color);}
  group.add(corals,plates);group.userData.corals=corals;group.userData.plates=plates;
  const nursery=nurseryShelf||coralShelf;
  const anemoneMaterial=new THREE.MeshStandardMaterial({color:0xf1e2ea,emissive:0x3c152d,emissiveIntensity:.24,roughness:.68});waving(anemoneMaterial,clock);
  const anemones=new THREE.InstancedMesh(anemoneGeometry(),anemoneMaterial,expanded?420:180);anemones.name='pulsing-anemones';
  for(let i=0;i<anemones.count;i++){
    const shelf=i%5?nursery:coralShelf,p=shelfPoint(shelf,.9),scale=.45+random()*.9;
    put(anemones,i,p.x,p.y,p.z,scale,scale*(.75+random()*.5),scale);
    color.setHSL(.9+random()*.1,.25+random()*.25,.4+random()*.19);anemones.setColorAt(i,color);
  }
  const spongeMaterial=new THREE.MeshStandardMaterial({color:0xe1ddca,roughness:.76});waving(spongeMaterial,clock);
  const sponges=new THREE.InstancedMesh(spongeGeometry(),spongeMaterial,expanded?260:100);sponges.name='tube-sponges';
  for(let i=0;i<sponges.count;i++){
    const shelf=i%4?coralShelf:nursery,p=shelfPoint(shelf,.82),scale=.55+random()*1.15;
    put(sponges,i,p.x,p.y,p.z,scale,scale*(.7+random()*.65),scale,random()*TAU);
    color.setHSL(.08+random()*.08,.18+random()*.27,.42+random()*.18);sponges.setColorAt(i,color);
  }
  const fanMaterial=new THREE.MeshStandardMaterial({color:0xd9f0ec,emissive:0x123b45,emissiveIntensity:.48,roughness:.54,side:THREE.DoubleSide});waving(fanMaterial,clock);
  const fans=new THREE.InstancedMesh(filterFanGeometry(),fanMaterial,expanded?180:72);fans.name='filter-feeding-fans';
  for(let i=0;i<fans.count;i++){
    const shelf=i%3?coralShelf:nursery,p=shelfPoint(shelf,.86),scale=.5+random();
    put(fans,i,p.x,p.y+.1,p.z,scale,scale,scale,random()*TAU);
    color.setHSL(.48+random()*.13,.35+random()*.32,.38+random()*.22);fans.setColorAt(i,color);
  }
  const urchinMaterial=new THREE.MeshStandardMaterial({color:0xd1b5a6,roughness:.58,metalness:.02});
  const urchins=new THREE.InstancedMesh(urchinGeometry(),urchinMaterial,expanded?118:64);
  urchins.name='grazing-sea-urchins';
  for(let i=0;i<urchins.count;i++){
    const shelf=i%5<3?nursery:coralShelf,p=shelfPoint(shelf,.88),scale=.38+random()*.62;
    put(urchins,i,p.x,p.y+.08,p.z,scale,scale,scale,random()*TAU);
    color.setHSL(.86+random()*.09,.22+random()*.23,.28+random()*.18);
    urchins.setColorAt(i,color);
  }
  const starMaterial=new THREE.MeshStandardMaterial({color:0xd6b79a,roughness:.66,metalness:.01});
  const brittleStars=new THREE.InstancedMesh(brittleStarGeometry(),starMaterial,expanded?92:48);
  brittleStars.name='brittle-stars-on-sediment';
  for(let i=0;i<brittleStars.count;i++){
    const shelf=i%4<3?nursery:coralShelf,p=shelfPoint(shelf,.94),scale=.62+random()*.78;
    put(brittleStars,i,p.x,p.y+.075,p.z,scale,scale,scale,random()*TAU);
    color.setHSL(.06+random()*.08,.2+random()*.25,.38+random()*.18);
    brittleStars.setColorAt(i,color);
  }
  urchins.instanceMatrix.needsUpdate=brittleStars.instanceMatrix.needsUpdate=true;
  urchins.instanceColor.needsUpdate=brittleStars.instanceColor.needsUpdate=true;
  group.add(anemones,sponges,fans,urchins,brittleStars);
  group.userData.anemones=anemones;group.userData.sponges=sponges;group.userData.fans=fans;
  group.userData.urchins=urchins;group.userData.brittleStars=brittleStars;
  for(const l of world.landmarks.filter(l=>l.kind==='bridge')){const orientation=random()*Math.PI,mesh=new THREE.Mesh(archGeometry(l.radius),rockMaterial);mesh.position.set(l.x,seabedHeight(l.x,l.z)+1,l.z);mesh.rotation.y=l.angle??orientation;mesh.name=l.id;group.add(mesh);}
  // Fictional extremophile microbial blooms replace sunlight plants in the abyss.
  const abyss=world.biomes.find(b=>b.id==='abyss')||world.biomes[0];
  const blooms=new THREE.InstancedMesh(coralPlate(),new THREE.MeshStandardMaterial({color:0xe6f8ff,emissive:0x13558d,emissiveIntensity:.66,roughness:.32,side:THREE.DoubleSide}),320);blooms.name='abyss-blue-colonies';
  for(let i=0;i<blooms.count;i++){const a=random()*TAU,r=Math.sqrt(random())*abyss.radius*.75,x=abyss.x+Math.cos(a)*r,z=abyss.z+Math.sin(a)*r,scale=.22+random()*1.1;put(blooms,i,x,seabedHeight(x,z)+.15+(i%4)*.12,z,scale,.4+random(),scale);color.setHSL(.52+random()*.14,.4+random()*.3,.35+random()*.25);blooms.setColorAt(i,color);}
  group.add(blooms);
  const lanternSites=world.biomes.filter(biome=>['abyss','vents','ruins','coral'].includes(biome.id));
  const lanternCount=world.radius>200?760:280;
  const lanternPositions=new Float32Array(lanternCount*3);
  const lanternColors=new Float32Array(lanternCount*3);
  const lanternPhases=new Float32Array(lanternCount);
  for(let i=0;i<lanternCount;i++){
    const site=lanternSites[i%lanternSites.length],angle=random()*TAU,radius=Math.sqrt(random())*site.radius*.86;
    const x=site.x+Math.cos(angle)*radius,z=site.z+Math.sin(angle)*radius;
    lanternPositions[i*3]=x;
    lanternPositions[i*3+1]=8+random()*42;
    lanternPositions[i*3+2]=z;
    color.setHSL(site.id==='coral'?.08+random()*.08:.47+random()*.13,.5+random()*.35,.56+random()*.25);
    lanternColors[i*3]=color.r;lanternColors[i*3+1]=color.g;lanternColors[i*3+2]=color.b;
    lanternPhases[i]=random()*TAU;
  }
  const lanternGeometry=new THREE.BufferGeometry();
  lanternGeometry.setAttribute('position',new THREE.BufferAttribute(lanternPositions,3));
  lanternGeometry.setAttribute('tint',new THREE.BufferAttribute(lanternColors,3));
  lanternGeometry.setAttribute('phase',new THREE.BufferAttribute(lanternPhases,1));
  const lanternMaterial=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    uniforms:{time:{value:0}},
    vertexShader:`attribute float phase;attribute vec3 tint;varying vec3 vColor;varying float vPulse;
      uniform float time;
      void main(){vColor=tint;vPulse=.55+.45*sin(time*1.25+phase);
        vec3 drift=position;drift.x+=sin(time*.16+phase)*1.2;drift.y+=cos(time*.12+phase*.7)*.55;
        vec4 mv=modelViewMatrix*vec4(drift,1.);gl_PointSize=clamp((2.3+sin(phase*3.)*.9)*(36./-mv.z),1.,8.);
        gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying vec3 vColor;varying float vPulse;
      void main(){float radius=distance(gl_PointCoord,vec2(.5));float alpha=smoothstep(.5,.05,radius)*vPulse*.72;
        gl_FragColor=vec4(vColor*(1.4+vPulse*.65),alpha);}`,
  });
  const lanternDrift=new THREE.Points(lanternGeometry,lanternMaterial);
  lanternDrift.name='abyssal-plankton-lanterns';lanternDrift.frustumCulled=false;
  group.add(lanternDrift);group.userData.lanternDrift=lanternDrift;
  const spires=new THREE.InstancedMesh(irregularRock(2),rockMaterial,32);spires.name='abyss-rift-walls';
  for(let i=0;i<32;i++){const side=i%2?1:-1,d=(Math.floor(i/2)-7.5)*5.5,x=abyss.x+side*(12+Math.sin(d*.09)*4),z=abyss.z+d;put(spires,i,x,seabedHeight(x,z)+2,z,4+random()*3,11+random()*12,5+random()*3,Math.sin(i)*.3);}group.add(spires);
  const vents=world.landmarks.filter(l=>l.kind==='vent');
  const chimneys=new THREE.InstancedMesh(irregularRock(2),new THREE.MeshStandardMaterial({color:0x35454a,roughness:.94,...textures}),vents.length*6);chimneys.name='mineral-vent-spires';
  const plumeSeeds=[],plumeGeometry=new THREE.BufferGeometry();plumeGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(vents.length*28*3),3));
  for(let i=0;i<vents.length;i++) {
    const v=vents[i],base=seabedHeight(v.x,v.z),height=6+v.radius;
    for(let j=0;j<6;j++){const a=j*2.4,r=j?v.radius*.45:0;put(chimneys,i*6+j,v.x+Math.cos(a)*r,base+height*.28,v.z+Math.sin(a)*r,j?.6+random():1.5,height*(j?.4+random()*.45:1),j?.7+random():1.4);}
    for(let j=0;j<28;j++)plumeSeeds.push({x:v.x,y:base+height*.95,z:v.z,phase:random(),speed:.08+random()*.05,spread:.5+random()*1.5});
  }
  const plumes=new THREE.Points(plumeGeometry,new THREE.PointsMaterial({color:0x536d75,size:1.8,transparent:true,opacity:.18,depthWrite:false}));plumes.name='rising-mineral-smoke';plumes.frustumCulled=false;
  group.add(chimneys,plumes);group.userData.plumes=plumes;group.userData.plumeSeeds=plumeSeeds;
  const wormGeometry=merge([tube([[0,0,0],[.03,.7,0],[.08,1.5,.04]],.07,7),tube([[.08,1.4,.04],[.25,1.75,.05],[.28,1.95,.06]],.075,5)]);
  const worms=new THREE.InstancedMesh(wormGeometry,new THREE.MeshStandardMaterial({color:0xc2a89c,roughness:.6}),vents.length*35);worms.name='vent-tube-worms';
  for(let i=0;i<worms.count;i++){const v=vents[i%vents.length],a=random()*TAU,r=3+random()*6,x=v.x+Math.cos(a)*r,z=v.z+Math.sin(a)*r;put(worms,i,x,seabedHeight(x,z),z,.5+random(),.5+random(),.5+random());color.setHSL(.01+random()*.04,.2+random()*.3,.45+random()*.15);worms.setColorAt(i,color);}
  group.add(worms);
  for(const child of group.children)if(child.isInstancedMesh){child.instanceMatrix.needsUpdate=true;child.computeBoundingSphere();}
  animateHabitatDetails(group,0);return group;
}

export function animateHabitatDetails(group,time) {
  if(group.userData.clock)group.userData.clock.value=time;
  if(group.userData.lanternDrift)group.userData.lanternDrift.material.uniforms.time.value=time;
  const positions=group.userData.plumes?.geometry.attributes.position,seeds=group.userData.plumeSeeds;if(!positions||!seeds)return;
  for(let i=0;i<seeds.length;i++){const p=seeds[i],t=(p.phase+time*p.speed)%1,d=t*p.spread;positions.setXYZ(i,p.x+Math.sin(time*.4+i)*d+t*2.2,p.y+t*13,p.z+Math.cos(time*.32+i)*d);}
  positions.needsUpdate=true;
}

export function createWaterSurface(world=fallbackWorld) {
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{time:{value:0},uDeep:{value:new THREE.Color(ART_PALETTE.oceanDeep)},uMid:{value:new THREE.Color(ART_PALETTE.oceanMid)},uShallow:{value:new THREE.Color(ART_PALETTE.oceanShallow)}},
    vertexShader:`uniform float time;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying float vSwell;
      varying float vCrest;
      float waveHeight(vec2 p,float t){
        float broad=sin(dot(p,vec2(.041,.026))+t*.43)*.24;
        float crossWave=sin(dot(p,vec2(-.029,.058))-t*.69)*.13;
        float ripples=sin(dot(p,vec2(.132,.087))+t*1.17)*.038;
        return broad+crossWave+ripples;
      }
      void main(){
        vec2 p=position.xz;
        float h=waveHeight(p,time);
        vec2 delta=vec2(.12,0.);
        float dhx=(waveHeight(p+delta,time)-waveHeight(p-delta,time))/(delta.x*2.);
        float dhz=(waveHeight(p+delta.yx,time)-waveHeight(p-delta.yx,time))/(delta.x*2.);
        vec3 displaced=position;
        displaced.y+=h;
        vec4 world=modelMatrix*vec4(displaced,1.);
        vWorldPosition=world.xyz;
        vWorldNormal=normalize(mat3(modelMatrix)*vec3(-dhx,1.,-dhz));
        vSwell=h;
        vCrest=smoothstep(.09,.31,h+sin(dot(p,vec2(.047,.031))+time*.9)*.07);
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader:`uniform float time;
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uShallow;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      varying float vSwell;
      varying float vCrest;
      void main(){
        vec3 n=normalize(vWorldNormal);
        vec3 v=normalize(cameraPosition-vWorldPosition);
        if(dot(n,v)<0.)n=-n;
        vec2 p=vWorldPosition.xz;
        float micro=sin(p.x*1.18+sin(p.y*.73+time*.43)*1.7)*cos(p.y*1.05-time*.37);
        float crossRipple=sin(dot(p,vec2(2.17,-1.63))+time*1.6)*.5+.5;
        n=normalize(n+vec3(micro*.014,0.,crossRipple*.01));
        float facing=max(dot(n,v),0.);
        float fresnel=pow(1.-facing,4.2);
        float above=smoothstep(-.08,.12,cameraPosition.y-vWorldPosition.y);
        vec3 reflected=reflect(-v,n);
        vec3 sky=mix(vec3(.38,.63,.72),vec3(.045,.25,.4),smoothstep(-.05,.8,reflected.y));
        float sun=pow(max(dot(reflected,normalize(vec3(.32,.62,-.7))),0.),260.);
        float lace=pow(1.-abs(sin((sin(p.x*.17+time*.12)+cos(p.y*.21-time*.16))*3.2+sin(p.y*.53)*.8)),18.);
        float foam=smoothstep(.82,.99,vCrest*.66+lace*.06+micro*.012);
        vec3 underwater=mix(uDeep,uMid,.32+vSwell*.9);
        underwater=mix(underwater,uShallow,.11+fresnel*.22);
        underwater+=vec3(.22,.48,.42)*max(0.,-reflected.y)*.1;
        vec3 surface=mix(uShallow,sky,.31+fresnel*.58);
        surface=mix(surface,vec3(.70,.84,.82),foam*.22);
        surface+=vec3(1.,.77,.47)*sun*2.4;
        surface+=vec3(.38,.73,.67)*micro*.018;
        vec3 color=mix(underwater,surface,above);
        float alpha=mix(.46,.72+foam*.1,above);
        float distanceToView=length(cameraPosition-vWorldPosition);
        float horizonFade=smoothstep(240.,920.,distanceToView);
        color=mix(color,mix(vec3(.16,.34,.43),vec3(.38,.61,.68),above),horizonFade*.72);
        alpha=mix(alpha,.94,horizonFade*.82);
        gl_FragColor=vec4(color,alpha);
      }`,
  });
  const extent=Math.max(1600,world.radius*4);
  const geometry=new THREE.PlaneGeometry(extent,extent,180,180);
  geometry.rotateX(-Math.PI/2);
  const surface=new THREE.Mesh(geometry,material);
  surface.position.y=WATER_SURFACE_Y;
  surface.renderOrder=4;
  surface.name='moving-water-surface';
  surface.userData.material=material;
  return surface;
}
