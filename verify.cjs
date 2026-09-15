const fs=require('node:fs'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const run=new Function('self',fs.readFileSync('terrain-worker.js','utf8')+'; return generate;')({});
const digest=r=>createHash('sha256').update(Buffer.from(r.data)).digest('hex');
const html=fs.readFileSync('index.html','utf8');
for(const match of html.matchAll(/(?:src|href)="([.\w/-]+\.(?:js|css))"/g))assert(fs.existsSync(match[1]),'Local asset must exist');
for(const label of ['10×','100×','Original'])assert(!html.includes(label),'Remove chat-specific size labels');
const p={seed:'STRATA-0042',size:96,sea:13,relief:55,height:24,dynamics:35,preset:'islands',caves:true,cutaway:false};
const a=run(p),b=run(p);assert.equal(digest(a),digest(b),'Seed must be repeatable');assert.notEqual(digest(a),digest(run({...p,seed:'OTHER'})),'Seed must change geometry');
for(const preset of ['islands','alpine','canyon','mixed']){const r=run({...p,preset});assert(r.faces>0);assert.equal(r.data.byteLength,r.faces*72);assert.equal(r.height.length,p.size*p.size);console.log(preset+': '+r.ms+' ms, '+r.faces+' merged quads');}
const solid=run({...p,caves:false}),cut=run({...p,cutaway:true});assert(solid.count>a.count,'Caves remove occupied voxels');assert(cut.count<a.count,'Cutaway reduces displayed volume');
console.log('PASS: deterministic seed, seed variation, presets, finite geometry, cave carving, cutaway.');
assert.throws(()=>run({...p,size:100000}),/Invalid/);
assert.throws(()=>run({...p,height:100000}),/Invalid/);
assert.throws(()=>run({...p,dynamics:-1}),/Invalid/);
const gradient=r=>{let sum=0;for(let z=1;z<r.size;z++)for(let x=1;x<r.size;x++){const i=z*r.size+x;sum+=Math.abs(r.height[i]-r.height[i-1])+Math.abs(r.height[i]-r.height[i-r.size]);}return sum/(2*(r.size-1)**2);};
const gentle=run({...p,size:384,preset:'mixed',dynamics:0}),rugged=run({...p,size:384,preset:'mixed',dynamics:100});
assert(gradient(rugged)>gradient(gentle)*1.2,'Dynamics must increase local terrain variation');
const low=run({...p,size:192,preset:'mixed',relief:0,height:8}),deep=run({...p,size:192,preset:'mixed',relief:0,height:72}),mountains=run({...p,size:192,preset:'mixed',relief:100,height:8});
for(let i=0;i<low.height.length;i++){assert.equal(deep.height[i]-low.height[i],64,'Height must translate surface without changing landforms');assert.equal(deep.water[i]-low.water[i],64,'Height must translate water with land');assert.equal(deep.surfaceMap[i],low.surfaceMap[i],'Height must preserve biomes');}
assert(gradient(mountains)>gradient(low),'Elevation must change landform relief');
const camera=new Function(fs.readFileSync('camera.js','utf8').replace(/^export /gm,'')+';return {cameraBasis,projectDirection,cameraHeading};')();
const near=(a,b)=>assert(Math.abs(a-b)<1e-8);
near(camera.cameraHeading(0),0);near(camera.cameraHeading(-Math.PI/2),90);near(camera.cameraHeading(Math.PI),180);
const north=camera.projectDirection([0,0,-1],camera.cameraBasis(0,Math.PI/4));near(north.x,0);assert(north.y<0);
const eastView=camera.projectDirection([0,0,-1],camera.cameraBasis(-Math.PI/2,0));near(eastView.x,-1);
const pitched=camera.projectDirection([0,1,0],camera.cameraBasis(.3,.7));near(pitched.y,-Math.cos(.7));
console.log('PASS: independent thickness, relief, dynamics, compass yaw/pitch and cardinal headings.');
console.log(JSON.stringify({gentleGradient:gradient(gentle),ruggedGradient:gradient(rugged),flatGradient:gradient(low),mountainGradient:gradient(mountains)}));
if(process.argv.includes('--large')){
  const r=run({...p,size:1280,preset:'mixed'},message=>console.log(message));
  assert.equal(r.height.length,1280*1280);assert.equal(r.data.byteLength,r.faces*72);
  assert(new Set(r.surfaceMap).size>8,'Mixed world should contain varied climate materials');
  const positions=new Int16Array(r.data);for(let i=0;i<positions.length;i+=6){assert(Math.abs(positions[i])<=640);assert(positions[i+1]>=-15&&positions[i+1]<=r.maxHeight+8-15);assert(Math.abs(positions[i+2])<=640);}
  console.log(JSON.stringify({size:r.size,ms:r.ms,quads:r.faces,voxels:r.count,meshMB:r.data.byteLength/1048576,climateMaterials:new Set(r.surfaceMap).size}));
}
