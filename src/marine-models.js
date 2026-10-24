import * as THREE from '../node_modules/three/build/three.module.js';

const TAU=Math.PI*2;
const clamp=THREE.MathUtils.clamp;
export const MARINE_SPECIES=new Set(['fish','jelly','shark','squid','whale','ray','turtle','angler','crab','lanternfish','cuttlefish','oarfish']);

// Original procedural meshes. The head, trunk and caudal peduncle of each
// vertebrate are one continuous surface, rather than intersecting primitives.
function profileAt(profile,z,column) {
  let i=0;
  while(i<profile.length-2&&z>profile[i+1][0])i++;
  const a=profile[Math.max(0,i-1)][column],b=profile[i][column];
  const c=profile[i+1][column],d=profile[Math.min(profile.length-1,i+2)][column];
  const t=clamp((z-profile[i][0])/(profile[i+1][0]-profile[i][0]),0,1);
  return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
}

export function continuousBody(profile,back,belly,{rows=72,sides=28,squared=1,pattern=0}={}) {
  const positions=[],colors=[],uvs=[],indices=[];
  const top=new THREE.Color(back),bottom=new THREE.Color(belly),color=new THREE.Color();
  const first=profile[0][0],last=profile.at(-1)[0];
  for(let j=0;j<=rows;j++) {
    const z=first+(last-first)*j/rows,rx=Math.max(.0005,profileAt(profile,z,1)),ry=Math.max(.0005,profileAt(profile,z,2)),cy=profileAt(profile,z,3);
    for(let i=0;i<=sides;i++) {
      const a=i/sides*TAU,cs=Math.cos(a),sn=Math.sin(a);
      const x=Math.sign(cs)*Math.abs(cs)**squared*rx,y=Math.sign(sn)*Math.abs(sn)**squared*ry+cy;
      positions.push(x,y,z);uvs.push(i/sides,j/rows);
      const ventral=THREE.MathUtils.smoothstep(sn,-.48,.3);
      color.copy(bottom).lerp(top,ventral);
      const mottle=Math.sin(z*38+sn*8)*Math.sin(x*93+y*39)*.034+Math.sin(x*61+z*17)*.018;
      color.multiplyScalar(1+mottle);
      if(pattern===1)color.multiplyScalar(.94+.06*Math.sin(z*72+Math.sin(a*5)));
      if(pattern===2)color.multiplyScalar(.85+.15*Math.abs(Math.sin(x*27+z*24)*Math.sin(z*35-y*17)));
      colors.push(color.r,color.g,color.b);
      if(j<rows&&i<sides) {
        const n=j*(sides+1)+i;
        indices.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const normals=geometry.attributes.normal;
  for(let j=0;j<=rows;j++) {
    const a=j*(sides+1),b=a+sides;
    const x=normals.getX(a)+normals.getX(b),y=normals.getY(a)+normals.getY(b),z=normals.getZ(a)+normals.getZ(b),length=Math.hypot(x,y,z)||1;
    normals.setXYZ(a,x/length,y/length,z/length);normals.setXYZ(b,x/length,y/length,z/length);
  }
  geometry.userData.continuousSections=rows+1;
  return geometry;
}

function colorGeometry(geometry,color) {
  const c=new THREE.Color(color),values=new Float32Array(geometry.attributes.position.count*3);
  for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}
  geometry.setAttribute('color',new THREE.BufferAttribute(values,3));
  return geometry;
}

function merge(parts) {
  const positions=[],normals=[],colors=[];
  for(const part of parts) {
    part.updateMatrix();
    const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();
    geometry.applyMatrix4(part.matrix);
    const position=geometry.attributes.position.array,normal=geometry.attributes.normal.array,color=geometry.attributes.color?.array;
    for(let i=0;i<position.length;i++){positions.push(position[i]);normals.push(normal[i]);colors.push(color?color[i]:1);}
    geometry.dispose();part.geometry.dispose();
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return geometry;
}

function sphere(scale,position,color,segments=12) {
  const mesh=new THREE.Mesh(colorGeometry(new THREE.SphereGeometry(1,segments,Math.max(8,segments/2)),color));
  mesh.scale.set(...scale);mesh.position.set(...position);return mesh;
}

function curve(points,radius,color,segments=18) {
  return new THREE.Mesh(colorGeometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),segments,radius,5,false),color));
}

function taperedTissue(points,radius,color,segments=22) {
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const geometry=new THREE.TubeGeometry(path,segments,radius,7,false),positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const t=Math.floor(i/8)/segments,center=path.getPointAt(t),taper=Math.max(.035,(1-t)**.65);
    positions.setXYZ(i,center.x+(positions.getX(i)-center.x)*taper,center.y+(positions.getY(i)-center.y)*taper,center.z+(positions.getZ(i)-center.z)*taper);
  }
  geometry.computeVertexNormals();return new THREE.Mesh(colorGeometry(geometry,color));
}

function aberrantAnatomy(type,variant,group,uniforms,details) {
  if(variant==='normal')return;
  const scale=type==='fish'?.78:1;
  if(variant==='crooked') {
    // Uneven jaw folds and a recessed eye sit on the same distorted surface.
    details.push(taperedTissue([[-.12,-.11,-.75],[.04,-.25,-.79],[.17,-.29,-.68]],.026,0x8b8176,14));
    details.push(foil([[.02,.18,.23],[.09,.43,.45],[.12,.2,.59]],0x5b645c,'x',.011));
  } else if(variant==='armored') {
    // Overlapping scutes grow along the spine and flank. They are rough bony
    // surfaces with offset ridges, rather than luminous collectibles.
    for(let i=0;i<7;i++) {
      const z=-.42+i*.21,width=(.27-i*.021)*scale,height=(.28-i*.017)*scale;
      details.push(foil([[-width,height*.72,z-.12],[0,height+.09,z-.16],[width,height*.73,z-.11],[width*.73,height*.9,z+.08],[0,height+.14,z+.13],[-width*.73,height*.9,z+.08]],i%2?0x969384:0xaba592,'y',.025));
      if(i<5)details.push(taperedTissue([[0,height+.03,z],[.025,height+.28-i*.02,z+.12],[.018,height+.37-i*.024,z+.22]],.046-i*.004,0xb1aa95,12));
      for(const side of [-1,1])details.push(foil([[side*width*.86,.07,z-.1],[side*(width+.06),.03,z],[side*width*.96,-.065,z+.12],[side*width*.8,.1,z+.1]],0x7f8578,'x',.015));
    }
    details.push(foil([[-.15,.09,-.88],[0,.15,-1.02],[.15,.09,-.88],[.1,.17,-.65],[-.1,.17,-.65]],0x969584,'y',.03));
  } else if(variant==='lure') {
    const tissue=[];
    for(let i=0;i<4;i++) {
      const side=i%2?1:-1,rootZ=-.6+i*.15,rootY=.05+i*.035,length=.48+(i%3)*.2;
      tissue.push(taperedTissue([[side*.17,rootY,rootZ],[side*.35,rootY+.2,rootZ-.13],[side*.44,rootY+.18,rootZ-length*.65],[side*.35,rootY+.32,rootZ-length]],.038,0x8a8074,24));
      // Slit-shaped sensory tissue is held in fleshy sockets at ectopic sites.
      if(i<2) {
        tissue.push(sphere([.043,.072,.047],[side*.35,rootY+.32,rootZ-length],0xaca78c));
        tissue.push(sphere([.026,.046,.008],[side*.35,rootY+.32,rootZ-length-.041],0x252e2b));
      }
    }
    tissue.push(taperedTissue([[.08,.22,-.42],[.2,.43,-.3],[.34,.56,-.54],[.39,.48,-.82]],.047,0x8d8a75,26));
    const organs=new THREE.Mesh(merge(tissue),marineMaterial(uniforms,{roughness:.68}));
    organs.name='ectopic-sensory-tissue';organs.scale.setScalar(scale);group.add(organs);group.userData.aberrantOrgans=organs;
    details.push(curve([[-.14,-.12,-.65],[-.27,-.2,-.72],[-.2,-.25,-.86]],.018,0x685d52,16));
  }
}

function deformAberrantBody(geometry,type,variant,seed) {
  if(variant==='normal')return;
  const position=geometry.attributes.position,color=geometry.attributes.color,phase=seed*.13;
  for(let i=0;i<position.count;i++) {
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
    if(variant==='crooked') {
      const bow=Math.exp(-(((z-.03)/.64)**2)),head=Math.max(0,(-z-.37)/.65);
      const asymmetric=x>0&&z>-.42&&z<.42?.64:1;
      position.setXYZ(i,x*asymmetric+Math.sin(z*3.6+.4)*.19*bow+head*.075,y+Math.sin(z*4.2-1)*.105*bow-head*.1,z+Math.max(0,x)*.13);
    } else if(variant==='armored') {
      const head=Math.exp(-(((z+.72)/.37)**2));
      position.setXYZ(i,x*(1+head*.23),y*(1+head*.12),z<-.62?-.62+(z+.62)*.8:z);
    } else if(variant==='lure') {
      const swelling=Math.exp(-(((z+.37)/.33)**2))*Math.max(0,-x)*.28;
      position.setXYZ(i,x-swelling,y+swelling*.45,z);
    }
    const lesion=Math.sin(x*31+z*17+phase)*Math.sin(z*24+y*21-phase);
    if(lesion>.37&&z<.7&&y<.18) {
      const strength=variant==='lure'?.26:.15;
      color.setXYZ(i,Math.min(1,color.getX(i)*(1-strength)+.39*strength),color.getY(i)*(1-strength)+.27*strength,color.getZ(i)*(1-strength)+.23*strength);
    }
  }
  geometry.computeVertexNormals();
}

// A cambered, rounded fin with a thin trailing edge. Coordinates are baked in
// body space so one traveling bend also moves the fins, mouth and gill details.
function foil(points,color,axis='y',thickness=.018) {
  const outline=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),true,'centripetal');
  const center=new THREE.Vector3();for(const point of points)center.add(new THREE.Vector3(...point));center.multiplyScalar(1/points.length);
  const positions=[],indices=[],normalAxis=axis==='x'?0:1;
  const rings=3,sides=24;
  for(let side=0;side<2;side++)for(let r=0;r<=rings;r++)for(let i=0;i<=sides;i++) {
    const f=r/rings,p=outline.getPoint(i/sides).lerp(center,1-f);
    p.setComponent(normalAxis,p.getComponent(normalAxis)+(side?1:-1)*thickness*Math.sin(f*Math.PI));
    positions.push(p.x,p.y,p.z);
    if(r<rings&&i<sides){const n=side*(rings+1)*(sides+1)+r*(sides+1)+i;indices.push(...(side?[n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1]:[n,n+sides+1,n+1,n+1,n+sides+1,n+sides+2]));}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return new THREE.Mesh(colorGeometry(geometry,color));
}

function marineMaterial(uniforms,{roughness=.55,transparent=false,opacity=1,emissive=0x000000}={}) {
  const material=new THREE.MeshPhysicalMaterial({
    color:0xffffff,vertexColors:true,roughness,metalness:.035,
    clearcoat:transparent?.08:.24,clearcoatRoughness:transparent?.32:.38,
    sheen:transparent?.18:.34,sheenRoughness:.58,sheenColor:new THREE.Color(0x8fbfc1),
    envMapIntensity:1.12,side:THREE.DoubleSide,transparent,opacity,depthWrite:!transparent,emissive,
  });
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{marineTime:uniforms.time,marineSpeed:uniforms.speed,marinePhase:uniforms.phase,marineAxis:uniforms.axis,marineAmplitude:uniforms.amplitude});
    shader.vertexShader='uniform float marineTime; uniform float marineSpeed; uniform float marinePhase; uniform float marineAxis; uniform float marineAmplitude; varying vec3 marinePosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      marinePosition=position;
      float aft=clamp((position.z+0.75)/2.1,0.,1.);
      float wave=sin(marineTime*(1.8+marineSpeed*.22)-position.z*3.6+marinePhase)*marineAmplitude*aft*aft;
      transformed.x+=wave*(1.-marineAxis); transformed.y+=wave*marineAxis;
    `);
    shader.fragmentShader='varying vec3 marinePosition;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float skinGrain=sin(marinePosition.x*241.+sin(marinePosition.z*179.))*sin(marinePosition.y*189.+marinePosition.z*73.);
      float scaleRows=sin(marinePosition.z*176.+sin(marinePosition.y*44.)*1.8);
      float scales=scaleRows*sin(marinePosition.x*229.+marinePosition.y*117.);
      diffuseColor.rgb*=.975+skinGrain*.022+scales*.012;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      roughnessFactor=clamp(roughnessFactor+skinGrain*.052+scales*.025,.25,1.);
      float wetRim=pow(1.-saturate(dot(normalize(vNormal),normalize(vViewPosition))),3.2);
      totalEmissiveRadiance+=vec3(.035,.10,.105)*wetRim*.18;
    `);
  };
  material.customProgramCacheKey=()=> 'marine-skin-v4';
  return material;
}

function eyeParts(x,y,z,r=.025) {
  const parts=[];
  for(const side of [-1,1]) {
    parts.push(sphere([r*.57,r,r],[side*x,y,z],0xa5a08a));
    parts.push(sphere([r*.35,r*.65,r*.68],[side*(x+r*.35),y,z-.002],0x070e11));
    parts.push(sphere([r*.16,r*.19,r*.2],[side*(x+r*.48),y+r*.2,z-r*.17],0x8cb4bc,8));
  }
  return parts;
}

const PROFILES={
  fish:[[-.84,0,0,0],[-.7,.055,.09,0],[-.45,.14,.23,.015],[-.1,.17,.29,.025],[.28,.11,.19,0],[.58,.032,.052,0],[.76,.018,.026,0],[.83,0,0,0]],
  shark:[[-1.07,0,0,-.015],[-.96,.09,.055,-.018],[-.76,.2,.13,0],[-.48,.27,.21,.018],[-.12,.285,.255,.015],[.3,.23,.2,.005],[.64,.13,.12,0],[.94,.057,.063,.018],[1.19,.025,.035,.035],[1.29,0,0,.045]],
  whale:[[-1.1,0,0,.08],[-1.055,.17,.21,.075],[-.96,.3,.34,.065],[-.74,.34,.36,.045],[-.39,.345,.335,.018],[-.06,.315,.29,0],[.3,.265,.245,-.01],[.63,.175,.17,-.018],[.93,.09,.1,-.025],[1.19,.044,.055,-.025],[1.35,0,0,-.025]],
  squid:[[-.75,0,0,-.015],[-.66,.23,.21,-.015],[-.47,.29,.25,-.015],[-.28,.24,.22,0],[-.1,.31,.29,.02],[.34,.33,.31,.04],[.75,.23,.23,.055],[1.1,.09,.11,.07],[1.3,0,0,.07]],
  ray:[[-.8,0,0,0],[-.64,.26,.11,0],[-.3,.42,.17,.015],[.12,.39,.14,0],[.46,.2,.075,-.01],[.77,.06,.04,0],[1.2,.03,.025,0],[1.75,.01,.012,.025],[2.05,0,0,.02]],
  turtle:[[-.97,0,0,0],[-.87,.13,.12,0],[-.66,.155,.13,.015],[-.49,.11,.1,-.005],[-.33,.32,.2,0],[.02,.43,.27,.035],[.39,.35,.21,.018],[.65,.15,.09,-.01],[.83,.035,.025,-.03],[.97,0,0,-.04]],
  angler:[[-.88,0,0,-.02],[-.8,.23,.25,-.02],[-.57,.38,.37,.045],[-.2,.4,.39,.075],[.18,.29,.29,.04],[.48,.14,.14,0],[.73,.035,.054,-.015],[.94,0,0,-.015]],
  crab:[[-.6,0,0,0],[-.47,.37,.13,0],[-.2,.52,.22,.015],[.1,.55,.23,.018],[.4,.38,.15,0],[.57,0,0,-.015]],
};

function buildVertebrate(type,group,uniforms) {
  const variant=group.userData.variant;
  const palette={fish:[0x607d87,0xc5d3c5],shark:[0x586b73,0xc0c7bd],whale:[0x485b63,0x7b8c90],squid:[0x955e53,0xccaaa0],ray:[0x56625a,0xc8c7aa],turtle:[0x655c3e,0xb1a375],angler:[0x5c5144,0x9c8970],crab:[0x836f57,0xa18f76]}[type];
  const bodyGeometry=continuousBody(PROFILES[type],...palette,{rows:type==='fish'?36:72,sides:type==='fish'?18:28,squared:type==='whale'?.8:1,pattern:type==='turtle'||type==='angler'||type==='crab'?2:type==='fish'?1:0});
  const body=new THREE.Mesh(bodyGeometry,marineMaterial(uniforms,{roughness:type==='whale'?.72:type==='crab'?.76:.5}));
  body.name=`${type}-continuous-body`;
  const fins=[],details=[],sideColor=palette[0];
  const paired=(points,color=sideColor)=>{for(const side of [-1,1])fins.push(foil(points.map(([x,y,z])=>[x*side,y,z]),color));};
  if(type==='fish') {
    fins.push(foil([[0,.16,-.35],[0,.49,-.08],[0,.42,.3],[0,.1,.46]],sideColor,'x',.007));
    fins.push(foil([[0,0,.63],[0,.34,1.02],[0,.16,.96],[0,0,.84],[0,-.16,.96],[0,-.34,1.02]],sideColor,'x',.01));
    paired([[.11,-.03,-.28],[.4,-.16,.05],[.31,-.15,.19],[.12,-.02,.11]]);
    details.push(...eyeParts(.118,.07,-.48,.04));
    for(const side of [-1,1])details.push(curve([[side*.14,.12,-.34],[side*.17,0,-.3],[side*.12,-.15,-.25]],.006,0x354954,10));
  } else if(type==='shark') {
    fins.push(foil([[0,.2,-.2],[0,.69,.11],[0,.59,.19],[0,.19,.39]],0x4a606b,'x',.023));
    fins.push(foil([[0,.1,.62],[0,.28,.79],[0,.08,.9]],0x4a606b,'x',.01));
    paired([[.2,-.1,-.43],[.88,-.21,.08],[.9,-.22,.16],[.47,-.17,.13],[.19,-.1,.11]]);
    paired([[.12,-.1,.4],[.35,-.17,.64],[.3,-.16,.7],[.08,-.075,.59]]);
    fins.push(foil([[0,.03,1.07],[0,.72,1.45],[0,.66,1.52],[0,.2,1.36],[0,.08,1.28],[0,-.35,1.46],[0,-.39,1.4]],0x506570,'x',.02));
    details.push(...eyeParts(.188,.043,-.77,.027));
    details.push(curve([[-.14,-.085,-.86],[-.11,-.12,-.76],[0,-.135,-.71],[.11,-.12,-.76],[.14,-.085,-.86]],.007,0x293b3f,26));
    for(const side of [-1,1])for(let i=0;i<5;i++)details.push(curve([[side*(.251+i*.005),.1,-.49+i*.045],[side*(.273+i*.002),-.015,-.47+i*.045],[side*.236,-.105,-.43+i*.045]],.0055,0x34464a,10));
  } else if(type==='whale') {
    paired([[.24,-.18,-.31],[.49,-.29,.01],[.48,-.31,.2],[.36,-.26,.2],[.23,-.18,-.04]]);
    fins.push(foil([[0,.2,.35],[0,.31,.52],[0,.23,.66],[0,.16,.76]],0x44575e,'x',.035));
    paired([[.02,-.03,1.11],[.4,0,1.27],[.47,.025,1.43],[.34,-.025,1.38],[.16,-.05,1.31],[0,-.05,1.43]],0x455c66);
    details.push(...eyeParts(.334,-.115,-.48,.022));
    for(const side of [-1,1])details.push(curve([[side*.11,-.2,-1.01],[side*.17,-.24,-.79],[side*.21,-.26,-.51],[side*.18,-.23,-.32]],.007,0x263a42,24));
    details.push(sphere([.044,.006,.063],[-.06,.365,-.77],0x263b43));
    // Subtle pale scar marks follow the flank instead of floating above it.
    for(const side of [-1,1])for(let i=0;i<5;i++)details.push(curve([[side*(.323-i*.006),-.015,-.53+i*.1],[side*(.325-i*.006),.025,-.5+i*.1]],.0028,0x788e94,5));
  } else if(type==='squid') {
    paired([[.1,.035,1.18],[.67,.015,.76],[.51,.012,.37],[.26,.02,.24]],0xab7364);
    details.push(...eyeParts(.278,.035,-.49,.095));
    const arms=new THREE.Group();arms.name='muscular-arms';const armParts=[],suckers=[];
    for(let i=0;i<10;i++) {
      const a=i/10*TAU,sx=Math.cos(a),sy=Math.sin(a),long=i>=8,len=long?2.1:1.18+(i%3)*.1;
      const path=new THREE.CatmullRomCurve3([[sx*.19,sy*.16,-.63],[sx*.43,sy*.35,-.9],[sx*.49,sy*.35,-.63-len*.68],[sx*.37,sy*.26,-.63-len]].map(p=>new THREE.Vector3(...p)));
      const geometry=new THREE.TubeGeometry(path,24,long?.028:.057,7,false),pos=geometry.attributes.position;
      for(let j=0;j<pos.count;j++) {
        const segment=Math.floor(j/8),t=segment/24,center=path.getPointAt(t),taper=1-t*.82;
        pos.setXYZ(j,center.x+(pos.getX(j)-center.x)*taper,center.y+(pos.getY(j)-center.y)*taper,center.z+(pos.getZ(j)-center.z)*taper);
      }
      geometry.computeVertexNormals();armParts.push(new THREE.Mesh(colorGeometry(geometry,palette[0])));
      for(let j=1;j<7;j++){const p=path.getPoint(j/8);suckers.push(sphere([.018,.012,.023],[p.x*.94,p.y*.94,p.z],0xd2b6a1,8));}
    }
    arms.add(new THREE.Mesh(merge([...armParts,...suckers]),marineMaterial(uniforms)));
    group.add(arms);group.userData.arms=arms;
  } else if(type==='ray') {
    paired([[.16,.025,-.63],[.65,.045,-.45],[1.36,.015,.12],[1.23,-.035,.32],[.7,-.015,.53],[.22,.01,.42]],0x596960);
    details.push(...eyeParts(.24,.14,-.38,.032));
    for(const side of [-1,1])for(let i=0;i<5;i++)details.push(curve([[side*.13,-.133,-.36+i*.055],[side*.28,-.119,-.33+i*.055]],.004,0x5c6859,7));
    details.push(curve([[-.13,-.1,-.54],[0,-.115,-.57],[.13,-.1,-.54]],.006,0x39463d));
  } else if(type==='turtle') {
    paired([[.23,-.05,-.37],[.92,-.13,-.36],[1.02,-.18,-.06],[.86,-.2,.13],[.62,-.13,.01],[.25,-.06,-.04]],0x7a7953);
    paired([[.25,-.05,.35],[.63,-.11,.55],[.64,-.12,.72],[.34,-.09,.68],[.2,-.05,.51]],0x7a7953);
    details.push(...eyeParts(.128,.048,-.79,.021));
    details.push(curve([[-.095,-.025,-.86],[0,-.044,-.92],[.095,-.025,-.86]],.005,0x393e2d));
    // Scute boundaries are surface markings on the integrated carapace.
    for(let i=0;i<4;i++) {
      const z=-.26+i*.18,r=.36*Math.sqrt(Math.max(.2,1-(z/.65)**2));
      details.push(curve([[-r*.85,.13,z],[-r*.4,.25,z+.025],[0,.3,z],[r*.4,.25,z+.025],[r*.85,.13,z]],.004,0x393e2c,18));
    }
    details.push(curve([[0,.21,-.37],[0,.3,0],[0,.22,.39]],.004,0x393e2c));
  } else if(type==='angler') {
    paired([[.24,-.1,-.3],[.6,-.18,-.05],[.55,-.2,.25],[.19,-.1,.14]],0x817659);
    fins.push(foil([[0,.04,.68],[0,.28,1.02],[0,-.26,1.05],[0,-.06,.68]],0x756852,'x',.015));
    details.push(...eyeParts(.3,.205,-.55,.036));
    details.push(curve([[-.25,.015,-.73],[-.17,-.2,-.72],[0,-.28,-.69],[.17,-.2,-.72],[.25,.015,-.73]],.022,0x352e24,24));
    for(let i=0;i<11;i++){const x=(i-5)*.035;details.push(curve([[x,-.19,-.755],[x*.93,-.07+(i%2)*.04,-.79]],.007,0xc4b897,5));}
    details.push(curve([[0,.35,-.32],[.015,.7,-.44],[.035,.8,-.79],[.02,.57,-.99]],.012,0x766d54,26));
    const lure=new THREE.Mesh(new THREE.SphereGeometry(.041,12,8),new THREE.MeshBasicMaterial({color:0x92c8c1}));lure.position.set(.02,.57,-.99);group.add(lure);group.userData.lure=lure;
  } else if(type==='crab') {
    details.push(...eyeParts(.21,.15,-.42,.027));
    const legCurve=new THREE.CatmullRomCurve3([[0,0,0],[.25,.045,.05],[.46,-.12,.12],[.53,-.35,.18]].map(p=>new THREE.Vector3(...p)));
    const legGeometry=colorGeometry(new THREE.TubeGeometry(legCurve,18,.025,5,false),0x8a765b);
    const legMesh=new THREE.InstancedMesh(legGeometry,marineMaterial(uniforms,{roughness:.8}),8),legDummy=new THREE.Object3D(),legPhases=[];
    for(const side of [-1,1])for(let i=0;i<4;i++) {
      const z=-.25+i*.17,index=legPhases.length;
      legDummy.position.set(side*.37,-.04,z);legDummy.rotation.set(0,side<0?Math.PI:0,0);legDummy.scale.setScalar(1);legDummy.updateMatrix();legMesh.setMatrixAt(index,legDummy.matrix);
      legPhases.push(i*Math.PI*.65+(side===1?Math.PI:0));
    }
    legMesh.instanceMatrix.needsUpdate=true;group.add(legMesh);group.userData.legs=legPhases;group.userData.legMesh=legMesh;group.userData.legDummy=legDummy;
    for(const side of [-1,1]) {
      details.push(curve([[side*.29,0,-.35],[side*.55,.04,-.63],[side*.48,.07,-.85]],.05,0x9a7956));
      details.push(curve([[side*.48,.07,-.85],[side*.64,.06,-1.02],[side*.53,.04,-1.17]],.055,0x9a7956));
      details.push(curve([[side*.47,.07,-.85],[side*.38,.08,-1.04],[side*.49,.05,-1.18]],.039,0x9a7956));
    }
  }
  aberrantAnatomy(type,variant,group,uniforms,details);
  const continuousSections=body.geometry.userData.continuousSections;
  const combinedBodyParts=[body,...details];
  if(!['ray','turtle'].includes(type))combinedBodyParts.push(...fins);
  const combinedGeometry=merge(combinedBodyParts);
  deformAberrantBody(combinedGeometry,type,variant,group.userData.seed);
  body.material.dispose();combinedGeometry.userData.continuousSections=continuousSections;combinedGeometry.computeBoundingSphere();
  const combinedBody=new THREE.Mesh(combinedGeometry,marineMaterial(uniforms,{roughness:type==='whale'?.72:type==='crab'?.76:.5}));
  combinedBody.name=`${type}-continuous-body`;group.add(combinedBody);group.userData.bodyMesh=combinedBody;
  if(['ray','turtle'].includes(type)) {
    const mesh=new THREE.Mesh(merge(fins),marineMaterial(uniforms,{roughness:.58}));mesh.name='anatomical-fins';group.add(mesh);group.userData.fins=mesh;
    // Cached base coordinates permit low-cost bilateral fin strokes.
    mesh.userData.basePositions=mesh.geometry.attributes.position.array.slice();
    mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);group.userData.flappingFins=mesh;
  } else group.userData.fins=combinedBody;
}

function buildJelly(group,uniforms) {
  const material=marineMaterial(uniforms,{transparent:true,opacity:.28,roughness:.22});
  const bell=new THREE.Group();bell.name='contractile-bell';
  const geometry=colorGeometry(new THREE.SphereGeometry(.77,36,22,0,TAU,0,Math.PI*.54),0xc5c6d0);
  const body=new THREE.Mesh(geometry,material);body.scale.y=.65;bell.add(body);group.userData.bodyMesh=body;
  const canals=[];
  for(let i=0;i<12;i++) {
    const a=i/12*TAU;
    canals.push(curve([[0,.49,0],[Math.cos(a)*.41,.4,Math.sin(a)*.41],[Math.cos(a)*.74,.1,Math.sin(a)*.74]],.006,0xb5c7cb,20));
  }
  const inner=marineMaterial(uniforms,{transparent:true,opacity:.45,roughness:.4});
  const gonads=[];for(let i=0;i<4;i++){const a=i/4*TAU;gonads.push(sphere([.16,.055,.1],[Math.cos(a)*.18,.15,Math.sin(a)*.18],0xb49cba));}
  bell.add(new THREE.Mesh(merge([...canals,...gonads]),inner));group.add(bell);group.userData.bell=bell;
  const tentacles=new THREE.Group(),parts=[];
  for(let i=0;i<24;i++) {
    const a=i/24*TAU,length=1.2+(i%5)*.15,r=.7;
    parts.push(curve([[Math.cos(a)*r,-.07,Math.sin(a)*r],[Math.cos(a+.1)*r,-length*.4,Math.sin(a+.1)*r],[Math.cos(a-.14)*r*.8,-length*.78,Math.sin(a-.14)*r*.8],[Math.cos(a+.13)*r*.7,-length,Math.sin(a+.13)*r*.7]],.008,0xb7b6bd,20));
  }
  for(let i=0;i<4;i++){const a=i/4*TAU;parts.push(curve([[Math.cos(a)*.15,0,Math.sin(a)*.15],[Math.cos(a+.5)*.25,-.5,Math.sin(a+.5)*.25],[Math.cos(a)*.24,-1,Math.sin(a)*.24],[Math.cos(a+.4)*.32,-1.5,Math.sin(a+.4)*.32]],.045,0xb4a4b3,25));}
  tentacles.add(new THREE.Mesh(merge(parts),marineMaterial(uniforms,{transparent:true,opacity:.54,roughness:.55})));group.add(tentacles);group.userData.tentacles=tentacles;
}

// These animals use their own cross sections, appendages and propulsion. A
// light organ is a surface mesh, so many shoaling fish do not spawn point lights.
function luminousParts(parts,color=0x84d9cc) {
  const mesh=new THREE.Mesh(merge(parts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.58,emissive:color,emissiveIntensity:1.15,metalness:0}));
  mesh.name='ventral-photophore-rows';return mesh;
}

function dynamicFin(parts,uniforms,name,group) {
  const mesh=new THREE.Mesh(merge(parts),marineMaterial(uniforms,{roughness:.66}));
  mesh.name=name;mesh.userData.basePositions=mesh.geometry.attributes.position.array.slice();
  mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);return mesh;
}

function installBody(group,uniforms,body,details,roughness=.62) {
  const sections=body.geometry.userData.continuousSections;
  const geometry=merge([body,...details]);geometry.userData.continuousSections=sections;geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,marineMaterial(uniforms,{roughness}));mesh.name=`${group.userData.species}-continuous-body`;
  group.add(mesh);group.userData.bodyMesh=mesh;
}

function buildLanternfish(group,uniforms) {
  const profile=[[-1.03,0,0,0],[-.96,.035,.043,-.01],[-.79,.083,.115,.005],[-.58,.128,.17,.008],[-.25,.13,.18,.008],[.14,.106,.143,0],[.44,.057,.078,0],[.7,.02,.031,0],[.84,0,0,0]];
  const body=new THREE.Mesh(continuousBody(profile,0x30454f,0xb3c6bd,{rows:52,sides:24,pattern:1}));
  const details=[...eyeParts(.113,.047,-.66,.061)];
  details.push(foil([[0,.13,-.22],[0,.35,-.03],[0,.28,.24],[0,.075,.39]],0x627e80,'x',.008));
  details.push(foil([[0,0,.68],[0,.32,1.02],[0,.19,.98],[0,0,.83],[0,-.19,.98],[0,-.32,1.02]],0x647f82,'x',.009));
  details.push(foil([[0,-.1,.01],[0,-.23,.2],[0,-.08,.44]],0x7d9891,'x',.006));
  for(const side of [-1,1]) {
    details.push(foil([[side*.105,-.028,-.45],[side*.3,-.13,-.25],[side*.23,-.1,-.12],[side*.12,-.02,-.23]],0x688b8b,'y',.008));
    details.push(curve([[side*.083,-.045,-.91],[side*.095,-.08,-.73],[side*.12,-.07,-.51]],.005,0x263940,18));
    details.push(curve([[side*.121,.1,-.48],[side*.137,-.015,-.43],[side*.11,-.11,-.42]],.006,0x263b44,14));
    details.push(curve([[side*.128,.024,-.43],[side*.132,.04,-.15],[side*.09,.025,.22],[side*.035,0,.54]],.0028,0x728f91,22));
  }
  installBody(group,uniforms,body,details,.52);
  const photophores=[];
  for(const side of [-1,1])for(let i=0;i<13;i++) {
    const z=-.48+i*.075,x=Math.max(.027,profileAt(profile,z,1)*.78),y=-Math.max(.03,profileAt(profile,z,2)*.67);
    photophores.push(sphere([.012,.009,.014],[side*x,y,z],0x9ae4d2,8));
    if(i<7)photophores.push(sphere([.009,.007,.01],[side*x*.95,y-.025,z+.03],0x6fb7c5,8));
  }
  const organs=luminousParts(photophores);group.add(organs);group.userData.photophores=organs;
  group.userData.anatomy={propulsion:'caudal',photophoreRows:4,lure:false};
}

function buildCuttlefish(group,uniforms) {
  const profile=[[-.91,0,0,-.02],[-.82,.16,.115,-.01],[-.65,.28,.18,.02],[-.5,.25,.15,.025],[-.33,.43,.2,.04],[.02,.5,.25,.055],[.36,.47,.235,.06],[.71,.32,.17,.045],[.95,.1,.07,.025],[1.04,0,0,.02]];
  const body=new THREE.Mesh(continuousBody(profile,0x937961,0xcbbba2,{rows:64,sides:28,pattern:2}));
  const details=[...eyeParts(.27,.045,-.65,.086)];
  for(const side of [-1,1]) {
    details.push(curve([[side*.331,.15,-.3],[side*.41,.218,.04],[side*.37,.2,.36],[side*.2,.12,.79]],.0055,0xb6aa83,28));
    // The W-like pupil is a small curved slit rather than a round cartoon eye.
    details.push(curve([[side*.312,.059,-.705],[side*.319,.037,-.681],[side*.321,.055,-.66],[side*.319,.034,-.639],[side*.31,.051,-.614]],.008,0x172528,16));
  }
  const funnel=taperedTissue([[0,-.1,-.49],[0,-.19,-.65],[0,-.2,-.81]],.054,0xab9d88,16);details.push(funnel);
  installBody(group,uniforms,body,details,.72);
  const skirtParts=[];
  for(const side of [-1,1])for(let i=0;i<12;i++) {
    const z=-.35+i*.103,next=z+.15,rx=profileAt(profile,z,1),nrx=profileAt(profile,Math.min(.98,next),1);
    skirtParts.push(foil([[side*rx*.95,.025,z],[side*(rx+.16),.012,z+.025],[side*(nrx+.17),.015,next],[side*nrx*.95,.028,next]],i%3?0xaa9075:0xb4a187,'y',.006));
  }
  group.userData.skirt=dynamicFin(skirtParts,uniforms,'continuous-skirt-fins',group);
  const arms=[];
  for(let i=0;i<8;i++) {
    const a=i/8*TAU,sx=Math.cos(a),sy=Math.sin(a),length=.52+(i%2)*.09;
    arms.push(taperedTissue([[sx*.15,sy*.1,-.8],[sx*.28,sy*.16,-.99],[sx*.19,sy*.17,-1.2],[sx*.14,sy*.1,-.87-length]],.045,0x9c836e,20));
    for(let n=0;n<3;n++)arms.push(sphere([.012,.009,.016],[sx*(.23-n*.025),sy*(.13-n*.012),-1.01-n*.105],0xd2c4ab,8));
  }
  group.userData.arms=new THREE.Group();group.userData.arms.name='short-grasping-arms';
  group.userData.arms.add(new THREE.Mesh(merge(arms),marineMaterial(uniforms,{roughness:.65})));group.add(group.userData.arms);
  group.userData.anatomy={propulsion:'skirt-and-siphon',arms:8,broadMantle:true};
}

function ribbonFin(profile) {
  const positions=[],indices=[],colors=[],color=new THREE.Color();
  const segments=104,across=4;
  for(let i=0;i<=segments;i++) {
    const t=i/segments,z=-.6+t*4.75,root=profileAt(profile,z,2)+profileAt(profile,z,3),height=(.15+.06*Math.sin(t*Math.PI))*(1-t*.7);
    for(let j=0;j<=across;j++) {
      const v=j/across;positions.push(0,root+height*v,z);
      color.set(j===across?0x8e352d:0xb05d49).multiplyScalar(.9+Math.sin(i*2.1)*.07);colors.push(color.r,color.g,color.b);
      if(i<segments&&j<across){const n=i*(across+1)+j;indices.push(n,n+1,n+across+1,n+1,n+across+2,n+across+1);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  return new THREE.Mesh(geometry);
}

function buildOarfish(group,uniforms) {
  const profile=[[-1.02,0,0,0],[-.94,.046,.07,.01],[-.83,.071,.14,.025],[-.63,.063,.24,.02],[-.25,.054,.25,.018],[.3,.049,.228,.009],[1,.042,.19,0],[1.9,.032,.145,-.004],[2.8,.022,.092,-.002],[3.6,.012,.043,0],[4.15,0,0,0]];
  const body=new THREE.Mesh(continuousBody(profile,0x919b9d,0xd2d4c4,{rows:144,sides:20,pattern:1}));
  const details=[...eyeParts(.065,.049,-.83,.033)];
  for(const side of [-1,1]) {
    details.push(curve([[side*.059,.12,-.72],[side*.067,0,-.68],[side*.055,-.15,-.64]],.004,0x526061,14));
    details.push(foil([[side*.052,-.015,-.61],[side*.18,-.13,-.48],[side*.14,-.17,-.39],[side*.05,-.05,-.45]],0x9c6050,'y',.005));
    details.push(taperedTissue([[side*.033,-.18,-.6],[side*.12,-.43,-.37],[side*.17,-.52,.05],[side*.08,-.5,.42]],.011,0xa74f40,30));
    for(let i=0;i<10;i++) {
      const z=-.2+i*.34,x=profileAt(profile,z,1)*1.02,y=profileAt(profile,z,2);
      details.push(curve([[side*x,y*.6,z-.08],[side*x,0,z],[side*x,-y*.65,z+.1]],.003,0x677f82,12));
    }
  }
  installBody(group,uniforms,body,details,.56);
  const crown=[];
  for(let i=0;i<6;i++) {
    const z=-.7+i*.06,height=.74-i*.068;
    crown.push(taperedTissue([[0,.22,z],[.015,height*.73,z+.06],[.025,height,z+.24],[.02,height*.92,z+.45]],.017-i*.001,0xad5546,23));
  }
  group.userData.ribbon=dynamicFin([ribbonFin(profile),...crown],uniforms,'red-dorsal-ribbon-and-crown',group);
  group.userData.anatomy={propulsion:'dorsal-wave',ribbonBody:true,headCrown:6};
}

export function createMarineAnimal(entity) {
  const group=new THREE.Group(),type=entity.type;
  const variant=['fish','shark'].includes(type)&&['crooked','armored','lure'].includes(entity.variant)?entity.variant:'normal';
  const uniforms={time:{value:0},speed:{value:0},phase:{value:entity.seed||0},axis:{value:type==='whale'?1:0},amplitude:{value:{fish:.14,shark:.13,whale:.1,squid:.018,ray:.025,turtle:.015,angler:.06,crab:0,jelly:.012,lanternfish:.12,cuttlefish:.012,oarfish:.045}[type]??0}};
  Object.assign(group.userData,{animal:true,species:type,variant,seed:entity.seed||0,exposure:entity.exposure||0,proceduralModelVersion:3,continuousBody:true,swimUniforms:uniforms,baseAmplitude:uniforms.amplitude.value,legs:[]});
  if(type==='jelly')buildJelly(group,uniforms);
  else if(type==='lanternfish')buildLanternfish(group,uniforms);
  else if(type==='cuttlefish')buildCuttlefish(group,uniforms);
  else if(type==='oarfish')buildOarfish(group,uniforms);
  else buildVertebrate(type,group,uniforms);
  const factor={squid:1/1.65,jelly:1/1.45,ray:.79,turtle:.9,crab:.8,cuttlefish:.8,oarfish:.42}[type]||1;
  group.scale.setScalar((entity.radius||1)*factor);
  group.name=`marine-${type}-${variant}`;return group;
}

export function animateMarineAnimal(group,time,speed,dt,turn=0) {
  const data=group.userData,type=data.species,phase=time+(data.seed||0);
  const crooked=data.variant==='crooked',armored=data.variant==='armored';
  data.swimUniforms.time.value=time+(crooked?Math.sin(phase*2.3)*.13:0);data.swimUniforms.speed.value=speed*(armored?.68:1);
  data.swimUniforms.amplitude.value=data.baseAmplitude*(crooked?1.15+Math.sin(phase*3.2)*.32:armored?.57:1);
  const roll=clamp(-turn*.6,-.24,.24)+(type==='crab'?0:Math.sin(phase*.65)*.012)+(crooked?Math.sin(phase*2.1)*.075+.055:0);
  group.rotation.z=THREE.MathUtils.lerp(group.rotation.z,roll,1-Math.exp(-dt*3));
  if(data.bell) {
    const pulse=Math.sin(phase*1.8);
    data.bell.scale.set(1+pulse*.08,1-pulse*.13,1+pulse*.08);
    data.tentacles.rotation.x=Math.sin(phase*.8)*.055;data.tentacles.rotation.z=Math.cos(phase*.7)*.04;
  }
  if(data.arms){data.arms.rotation.x=Math.sin(phase*1.6)*.055;data.arms.rotation.y=Math.sin(phase*1.3)*.045;}
  if(data.aberrantOrgans){data.aberrantOrgans.rotation.x=Math.sin(phase*1.7)*.045;data.aberrantOrgans.rotation.y=Math.sin(phase*1.21)*.055;}
  if(data.photophores)data.photophores.material.emissiveIntensity=.9+Math.sin(phase*.8)*.2;
  if(data.skirt||data.ribbon) {
    const mesh=data.skirt||data.ribbon,pos=mesh.geometry.attributes.position,base=mesh.userData.basePositions;
    for(let i=0;i<pos.count;i++) {
      const x=base[i*3],y=base[i*3+1],z=base[i*3+2];
      if(data.skirt)pos.array[i*3+1]=y+Math.sin(phase*(4+speed*.18)-z*11)*Math.max(0,Math.abs(x)-.32)*.22;
      else pos.array[i*3]=x+Math.sin(phase*(3.1+speed*.13)-z*8)*Math.max(0,y-.12)*.23;
    }
    pos.needsUpdate=true;
  }
  if(data.flappingFins) {
    const mesh=data.flappingFins,positions=mesh.geometry.attributes.position,base=mesh.userData.basePositions;
    const frequency=type==='ray'?1.5:1.15,amplitude=type==='ray'?.2:.16;
    for(let i=0;i<positions.count;i++) {
      const x=base[i*3],y=base[i*3+1],z=base[i*3+2];
      positions.array[i*3+1]=y+Math.sin(phase*frequency-Math.abs(x)*1.8+z*.7)*Math.max(0,Math.abs(x)-.22)*amplitude;
    }
    positions.needsUpdate=true;
  }
  if(data.legMesh) {
    const dummy=data.legDummy;
    for(let i=0;i<data.legs.length;i++) {
      const side=i<4?-1:1,phaseOffset=data.legs[i],legIndex=i%4;
      dummy.position.set(side*.37,-.04,-.25+legIndex*.17);
      dummy.rotation.y=(side<0?Math.PI:0)+Math.sin(phase*(2+speed)+phaseOffset)*.16;
      dummy.rotation.z=Math.cos(phase*(2+speed)+phaseOffset)*.1;
      dummy.scale.setScalar(1);dummy.updateMatrix();data.legMesh.setMatrixAt(i,dummy.matrix);
    }
    data.legMesh.instanceMatrix.needsUpdate=true;
  }
}

export function createBackgroundSchools() {
  const geometry=continuousBody(PROFILES.fish,0x627f8a,0xb2c7c7,{rows:16,sides:8});
  const body=new THREE.Mesh(geometry);
  const tail=foil([[0,0,.6],[0,.32,1.02],[0,0,.85],[0,-.32,1.02]],0x718e97,'x',.008);
  const mesh=new THREE.InstancedMesh(merge([body,tail]),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.58,metalness:.05}),420);
  mesh.name='distant-shoals';mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false;
  const schools=[[-32,39,-28],[39,34,-31],[-67,44,20],[25,20,48],[66,30,15],[-20,27,65],[10,44,-65]];
  const fish=Array.from({length:300},(_,i)=>({school:i%schools.length,a:i*2.399,r:1.2+Math.sqrt((i*73%89)/89)*10,h:Math.sin(i*1.78)*3,scale:.13+(i%7)*.018}));
  const tint=new THREE.Color();
  for(let i=0;i<fish.length;i++){
    tint.setHSL(.49+((i*17)%9)*.007,.16+((i*11)%7)*.014,.72+((i*5)%8)*.014);
    mesh.setColorAt(i,tint);
  }
  mesh.instanceColor.needsUpdate=true;
  mesh.userData.schools=schools;mesh.userData.fish=fish;mesh.userData.dummy=new THREE.Object3D();mesh.userData.lastUpdate=-1;
  return mesh;
}

export function animateBackgroundSchools(mesh,time,low=false) {
  // Analytic positions are cheap enough to refresh every display frame. The
  // former 30 Hz low-quality path held the same matrices across two frames and
  // made distant fish visibly march instead of swim.
  mesh.userData.lastUpdate=time;
  const {schools,fish,dummy}=mesh.userData;
  for(let i=0;i<fish.length;i++) {
    const f=fish[i],center=schools[f.school],schoolPhase=time*.105+f.school*.8;
    const centerX=center[0]+Math.sin(time*.043+f.school*1.7)*4.5;
    const centerY=center[1]+Math.sin(time*.087+f.school)*.65;
    const centerZ=center[2]+Math.cos(time*.037+f.school*1.3)*4.5;
    const orbitSpeed=.045+(i%6)*.0045,a=f.a+time*orbitSpeed;
    const breathing=1+Math.sin(time*.21+f.a*1.7)*.075;
    const x=centerX+Math.cos(a)*f.r*breathing+Math.sin(time*.31+f.a)*.32;
    const y=centerY+f.h+Math.sin(time*.5+f.a)*.28;
    const z=centerZ+Math.sin(a)*f.r*.72*breathing+Math.cos(time*.27+f.a*1.2)*.26;
    const tangentX=-Math.sin(a)*f.r*orbitSpeed;
    const tangentZ=Math.cos(a)*f.r*.72*orbitSpeed;
    const heading=Math.atan2(-tangentX,-tangentZ)+Math.sin(time*.78+f.a*1.9)*.035;
    dummy.position.set(x,y,z);
    dummy.rotation.set(
      Math.sin(time*.52+f.a)*.035,
      heading+Math.sin(schoolPhase+f.a*.21)*.025,
      Math.cos(time*.47+f.a)*.018,
    );
    dummy.scale.set(f.scale,f.scale,f.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate=true;
}
