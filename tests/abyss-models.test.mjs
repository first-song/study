import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from '../node_modules/three/build/three.module.js';
import { SPECIES } from '../src/biology.js';
import { MARINE_SPECIES, createMarineAnimal, animateMarineAnimal } from '../src/marine-models.js';
import { createAssimilatedOrgans, animateAssimilatedOrgans, createApexBody, animateApexBody } from '../src/assimilated-models.js';

function dispose(model) {
  const materials=new Set();
  model.traverse(object=>{object.geometry?.dispose();if(object.material)materials.add(object.material);});
  for(const material of materials)material.dispose();
}

function geometryIsFinite(model) {
  let count=0;
  model.traverse(object=>{
    if(!object.geometry)return;
    count++;
    for(const attribute of Object.values(object.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite),`${object.name} geometry is finite`);
  });
  assert.ok(count>0);assert.ok(!new Box3().setFromObject(model).isEmpty());
}

test('new deep-sea animals have distinct continuous silhouettes and species anatomy',()=>{
  const types=['lanternfish','cuttlefish','oarfish'],models=[];
  try {
    for(const type of types) {
      assert.ok(SPECIES[type]&&MARINE_SPECIES.has(type));
      const model=createMarineAnimal({type,seed:71,radius:1});models.push(model);
      geometryIsFinite(model);assert.ok(model.userData.bodyMesh.geometry.userData.continuousSections>=50);
    }
    const [lantern,cuttle,oar]=models;
    const sizes=models.map(model=>new Box3().setFromObject(model).getSize(new Vector3()));
    assert.ok(sizes[1].x/sizes[1].z>sizes[0].x/sizes[0].z*1.3,'cuttlefish has a broad mantle instead of a scaled fish trunk');
    assert.ok(sizes[2].z/sizes[2].x>7,'oarfish reads as a long narrow ribbon');
    assert.ok(lantern.getObjectByName('ventral-photophore-rows'));
    assert.ok(!lantern.getObjectByName('assimilated-lure-lamp'),'lanternfish photophores are distinct from a head lure');
    assert.ok(cuttle.getObjectByName('continuous-skirt-fins'));
    assert.ok(cuttle.getObjectByName('short-grasping-arms'));
    assert.ok(oar.getObjectByName('red-dorsal-ribbon-and-crown'));
    assert.notDeepEqual(lantern.userData.bodyMesh.geometry.attributes.position.array,cuttle.userData.bodyMesh.geometry.attributes.position.array);
  } finally {models.forEach(dispose);}
});

test('skirt and dorsal ribbon propulsion moves fin vertices while light organs pulse',()=>{
  for(const type of ['lanternfish','cuttlefish','oarfish']) {
    const model=createMarineAnimal({type,seed:11,radius:1});
    try {
      const fin=model.userData.skirt||model.userData.ribbon;
      animateMarineAnimal(model,1,4,1/60,.1);
      const initial=fin?.geometry.attributes.position.array.slice(),glow=model.userData.photophores?.material.emissiveIntensity;
      animateMarineAnimal(model,2,4,1/60,-.1);
      if(fin)assert.notDeepEqual(fin.geometry.attributes.position.array,initial,`${type} animates actual fin vertices`);
      if(model.userData.photophores)assert.notEqual(model.userData.photophores.material.emissiveIntensity,glow);
      geometryIsFinite(model);
    } finally {dispose(model);}
  }
});

test('assimilation expresses all five physical organs only when acquired',()=>{
  const empty=createAssimilatedOrgans({assimilations:{}},4);
  assert.equal(empty.children.length,0);dispose(empty);
  const expected={lureLamp:'assimilated-lure-lamp',pressure:'lamellar-pressure-gills',jet:'paired-jet-siphons',carapace:'overlapping-dorsal-carapace',electroreception:'electroreceptor-pores'};
  for(const [trait,name] of Object.entries(expected)) {
    const player={assimilations:{[trait]:1},vx:4,vy:1,vz:0},model=createAssimilatedOrgans(player,4);
    try {
      assert.ok(model.getObjectByName(name),`${trait} has an identifiable organ`);
      for(const [other,otherName] of Object.entries(expected))if(other!==trait)assert.ok(!model.getObjectByName(otherName),`${trait} does not add unrelated organs`);
      animateAssimilatedOrgans(model,4,player);geometryIsFinite(model);
    } finally {dispose(model);}
  }
  const full=createAssimilatedOrgans({assimilations:Object.fromEntries(Object.keys(expected).map(key=>[key,2]))},5);
  try {animateAssimilatedOrgans(full,8,{vx:12});geometryIsFinite(full);} finally {dispose(full);}
});

test('apex form has a continuous head and trunk, paired hydrofoils and active tail motion',()=>{
  const model=createApexBody({level:11});
  try {
    assert.ok(model.userData.bodyMesh.geometry.userData.continuousSections>100);
    assert.ok(model.getObjectByName('apex-paired-hydrofoils'));
    assert.ok(model.getObjectByName('apex-flexible-dorsal-crest'));
    const box=new Box3().setFromObject(model).getSize(new Vector3());
    assert.ok(box.z>4&&box.x>3,'late form has a long trunk and wide fins');
    animateApexBody(model,1,{vx:5});const first=model.userData.fins.geometry.attributes.position.array.slice();
    animateApexBody(model,2,{vx:5});assert.notDeepEqual(first,model.userData.fins.geometry.attributes.position.array);
    assert.equal(model.userData.timeUniform.value,2);geometryIsFinite(model);
  } finally {dispose(model);}
});
