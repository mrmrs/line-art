const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const ln = require('@lnjs/core');
const load = name => require(join(process.env.AUDIT_TEST_OUTPUT, name));
const { DEFAULT_COMPOSITION } = load('composition-types.js');
const { packComposition, footprint, footprintParts, footprintArea, validateComposition } = load('composition.js');

const instance = patch => ({ id: 'fixture', motif: 'frame', x: 80, y: 80, size: 90,
  aspect: 1, depth: .1, angle: .21, tilt: 0, pinned: true, ...patch });
const params = patch => ({ ...DEFAULT_COMPOSITION, widthMm: 160, heightMm: 160, marginMm: 5,
  clearanceMm: .5, density: .65, minSizeMm: 2, maxSizeMm: 35, maxInstances: 150,
  motifs: ['prism', 'frame', 'steps'], nesting: true, construction: 'free', recursionDepth: 0, instances: [], ...patch });

// Independent geometry oracle: evaluate the documented transform directly,
// then construct actual projected solid components without production matrices.
// ln.js uses clockwise-positive rotations; this convention is intentional.
const boxes = {
  prism: [[-1,-1,-1,1,1,1]],
  frame: [[-1,-1,-1,-.6,1,1],[.6,-1,-1,1,1,1],[-.6,-1,-1,.6,-.6,1],[-.6,.6,-1,.6,1,1]],
  steps: [[-1,-1,-1,1,1,-.35],[-.65,-1,-.35,1,.65,.3],[-.3,-1,.3,1,.3,1]],
};
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function hull(points) {
  const ordered = [...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const chain = seq => { const out=[]; for(const p of seq) { while(out.length>1 && cross(out.at(-2),out.at(-1),p)<=0) out.pop(); out.push(p); } return out.slice(0,-1); };
  return [...chain(ordered),...chain(ordered.toReversed())];
}
function projected(i,x,y,z) {
  x *= i.size*Math.sqrt(i.aspect)/2; y *= i.size/Math.sqrt(i.aspect)/2; z *= i.size*i.depth/2;
  if(i.construction==='shared') {
    const worldX=x*Math.cos(i.angle)+y*Math.sin(i.angle);
    const worldY=-x*Math.sin(i.angle)+y*Math.cos(i.angle);
    return [i.x+(-worldX+worldY)/Math.sqrt(2),
      i.y+(-worldX-worldY)/Math.sqrt(6)+z*Math.sqrt(2/3)];
  }
  const y1=y*Math.cos(i.tilt)+z*Math.sin(i.tilt), z1=-y*Math.sin(i.tilt)+z*Math.cos(i.tilt);
  const x2=x*Math.cos(-.48)-z1*Math.sin(-.48);
  return [i.x+x2*Math.cos(i.angle)+y1*Math.sin(i.angle),i.y-x2*Math.sin(i.angle)+y1*Math.cos(i.angle)];
}
function actualParts(i) {
  if (!boxes[i.motif]) return footprintParts(i,true); // Curves get dedicated support tests below.
  const innerX=i.construction==='shared'?1-.4/i.aspect:.6;
  const components=i.motif==='frame'
    ?[[-1,-1,-1,-innerX,1,1],[innerX,-1,-1,1,1,1],[-innerX,-1,-1,innerX,-.6,1],[-innerX,.6,-1,innerX,1,1]]
    :boxes[i.motif];
  return components.map(b=>hull([b[0],b[3]].flatMap(x=>[b[1],b[4]].flatMap(y=>[b[2],b[5]].map(z=>projected(i,x,y,z))))));
}
function pointDistance(p,a,b) {
  const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
function inside(p,poly) {
  let yes=false;
  for(let j=0,k=poly.length-1;j<poly.length;k=j++) if((poly[j][1]>p[1])!==(poly[k][1]>p[1]) && p[0]<(poly[k][0]-poly[j][0])*(p[1]-poly[j][1])/(poly[k][1]-poly[j][1])+poly[j][0]) yes=!yes;
  return yes;
}
function separation(a,b) {
  if(inside(a[0],b)||inside(b[0],a)) return 0;
  let distance=Infinity;
  for(let j=0;j<a.length;j++) for(let k=0;k<b.length;k++) {
    const u=a[j],v=a[(j+1)%a.length],w=b[k],z=b[(k+1)%b.length];
    if(cross(u,v,w)*cross(u,v,z)<0 && cross(w,z,u)*cross(w,z,v)<0) return 0;
    distance=Math.min(distance,pointDistance(u,w,z),pointDistance(v,w,z),pointDistance(w,u,v),pointDistance(z,u,v));
  }
  return distance;
}
function assertLayout(p, instances) {
  const solids=instances.map(actualParts);
  const quiet=p.quiet.map(q=>[[q.x,q.y],[q.x+q.width,q.y],[q.x+q.width,q.y+q.height],[q.x,q.y+q.height]]);
  for(let j=0;j<solids.length;j++) for(const part of solids[j]) {
    for(const [x,y] of part) assert.ok(x>=p.marginMm-1e-7 && y>=p.marginMm-1e-7 && x<=p.widthMm-p.marginMm+1e-7 && y<=p.heightMm-p.marginMm+1e-7,'solid outside paper margin');
    for(const other of [...solids.slice(j+1).flat(),...quiet]) assert.ok(separation(part,other)>=p.clearanceMm-1e-7,`clearance violation for ${instances[j].id}: ${separation(part,other)} vs ${p.clearanceMm}; part=${JSON.stringify(part)} other=${JSON.stringify(other)}`);
  }
}

test('concave nesting accepts a real frame aperture and rejects projected rail collisions', () => {
  const frame=instance({}), child=instance({id:'inside',motif:'prism',size:12,angle:-.3});
  const p=params({instances:[frame,child],maxInstances:2});
  assert.ok(inside([child.x,child.y],footprint(frame)),'fixture must overlap the outer envelope');
  const result=packComposition(p,true);
  assert.deepEqual(result.instances,[frame,child]);
  assert.deepEqual(packComposition({...p,recursionDepth:1},true).instances,[frame,child],
    'turning recursion on must preserve an existing unowned nested composition');
  assertLayout(p,result.instances);
  assert.throws(()=>packComposition({...p,nesting:false},true),/conflict|kept/i);
  const rail=projected(frame,.8,0,0);
  assert.throws(()=>packComposition({...p,instances:[frame,{...child,x:rail[0],y:rail[1]}]},true),/conflict|kept/i);
  assert.deepEqual(p.instances,[frame,child],'failure mutated resolved inputs');
});

test('occupied area counts projected component union instead of overlap or a filled aperture', () => {
  const frame=instance({angle:.7,tilt:.3,depth:.25});
  const parts=actualParts(frame);
  // Integrate cross-sections independently. This catches double-counted rail
  // overlaps as well as incorrectly filled frame apertures.
  const all=parts.flat(),lo=Math.min(...all.map(p=>p[0])),hi=Math.max(...all.map(p=>p[0]));
  const slices=3000,dx=(hi-lo)/slices;
  let area=0;
  for(let j=0;j<slices;j++) {
    const x=lo+(j+.5)*dx;
    const intervals=parts.flatMap(poly=>{
      const ys=[];
      for(let k=0;k<poly.length;k++) { const a=poly[k],b=poly[(k+1)%poly.length]; if((a[0]<=x&&b[0]>x)||(b[0]<=x&&a[0]>x)) ys.push(a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0])); }
      return ys.length?[[Math.min(...ys),Math.max(...ys)]]:[];
    }).sort((a,b)=>a[0]-b[0]);
    let low=0,high=-Infinity,length=0;
    for(const [a,b] of intervals) { if(a>high) { if(high>=low) length+=high-low; low=a;high=b; } else high=Math.max(high,b); }
    if(high>=low)length+=high-low;
    area+=length*dx;
  }
  assert.ok(Math.abs(footprintArea(frame,true)-area)<.01,'projected union area mismatch');
  assert.ok(footprintArea(frame,true)<footprintArea(frame,false)*.9,'aperture did not reduce occupied area');
});

test('rotated, anisotropic concave layouts satisfy independent solid clearance and quiet regions', () => {
  for(const seed of [1,19,417]) {
    const p=params({seed,widthMm:130,heightMm:170,aspect:6,depth:seed===19?1.5:.15,
      coherence:0,minSizeMm:3,maxSizeMm:38,maxInstances:90,
      quiet:[{id:'void',x:52,y:65,width:20,height:30}]});
    const a=packComposition(p),b=packComposition(p);
    assert.deepEqual(a,b,'seeded packing or repair is not repeatable');
    assert.ok(a.instances.length>15,'fixture failed to exercise a populated layout');
    assert.ok(a.instances.length<=p.maxInstances);
    assertLayout(p,a.instances);
  }
});

test('recursive frame assemblies have deterministic ancestry, bounded scale and safe geometry', () => {
  const root=instance({id:'root',size:110,depth:.1,angle:.1,tilt:0});
  const p=params({seed:137,instances:[root],motifs:['frame'],recursionDepth:4,recursionScale:.5,
    maxInstances:20,clearanceMm:.4,minSizeMm:2,maxSizeMm:110,density:.8});
  const a=packComposition(p,true),b=packComposition(p,true);
  assert.deepEqual(a,b);
  const byId=new Map(a.instances.map(i=>[i.id,i]));
  const children=a.instances.filter(i=>i.parentId);
  assert.ok(children.length>=2,'large frame must produce a useful recursive assembly');
  assert.ok(children.some(i=>i.generation>=2),'fixture did not reach a second generation');
  for(const child of children) {
    const parent=byId.get(child.parentId);
    assert.ok(parent,'descendant has missing parent');
    assert.equal(child.generation,(parent.generation??0)+1);
    assert.ok(child.generation<=p.recursionDepth);
    assert.ok(child.size<=parent.size*p.recursionScale+1e-8);
    assert.ok(child.size>=p.minSizeMm);
    assert.ok(child.id.startsWith(`${parent.id}/r`));
  }
  assert.equal(new Set(a.instances.map(i=>i.id)).size,a.instances.length);
  assert.ok(a.instances.length<=p.maxInstances);
  assertLayout(p,a.instances);
  validateComposition({...p,instances:a.instances});
});

test('pinning a descendant retains its complete ancestry and refill preserves resolved members', () => {
  const root=instance({id:'root',size:110,depth:.1,angle:0,tilt:0});
  const p=params({instances:[root],motifs:['frame'],recursionDepth:3,recursionScale:.5,
    maxInstances:15,minSizeMm:2,maxSizeMm:110,clearanceMm:.4,density:.8});
  const original=packComposition(p,true).instances.map(i=>({...i,pinned:false}));
  const descendant=original.filter(i=>i.parentId).sort((a,b)=>b.generation-a.generation)[0];
  assert.ok(descendant,'fixture needs a descendant');
  descendant.pinned=true;
  const snapshot=structuredClone(original);
  const next=packComposition({...p,seed:200,instances:original});
  const byId=new Map(original.map(i=>[i.id,i]));
  let member=descendant;
  while(member) {
    assert.deepEqual(next.instances.find(i=>i.id===member.id),member,'kept ancestry changed');
    member=byId.get(member.parentId);
  }
  const refill=packComposition({...p,seed:201,instances:original},true);
  for(const item of original) assert.deepEqual(refill.instances.find(i=>i.id===item.id),item);
  assert.deepEqual(original,snapshot,'solver mutated retained lineage');
  assertLayout(p,refill.instances);
});

test('recursive imports reject orphaned, cyclic and inconsistent lineage before work', () => {
  const root=instance({id:'root'}),child=instance({id:'child',size:5,parentId:'root',generation:1});
  const malformed=[
    [{...child,parentId:'missing'}],
    [{...root,id:''}],
    [{...root,parentId:'child',generation:2},child],
    [root,{...child,generation:2}],
    [root,{...child,generation:1.5}],
    [root,{...child,parentId:'child'}],
    [root,{...child,x:155,y:155}],
    [{...root,motif:'prism'},child],
  ];
  for(const instances of malformed) assert.throws(()=>validateComposition(params({instances})),/assembly|generation|parent|lineage|cycle|recurs|instance/i);
  for(const patch of [{nesting:'yes'},{recursionDepth:6},{recursionDepth:1.1},{recursionScale:.01},{recursionScale:NaN}]) assert.throws(()=>validateComposition(params(patch)));
});

test('global instance limit and physical minimum stop recursive growth', () => {
  const root=instance({id:'root',size:100,depth:.1,angle:0,tilt:0});
  const p=params({instances:[root],motifs:['frame'],recursionDepth:5,recursionScale:.7,minSizeMm:2,
    maxSizeMm:100,maxInstances:1});
  assert.deepEqual(packComposition(p,true).instances,[root]);
  const result=packComposition({...p,maxInstances:4},true);
  assert.ok(result.instances.length<=4);
  assert.ok(result.instances.every(i=>i.size>=2));
  assertLayout(p,result.instances);
  assert.throws(()=>packComposition({...p,maxInstances:1,instances:[root,instance({id:'too-many',size:5,x:140,y:140})]},true),/limit|kept/i);
});

test('legacy compositions retain the old reserved-envelope semantics without new settings', () => {
  const p=params({instances:[instance({}),instance({id:'inside',size:5,motif:'prism'})],maxInstances:2});
  delete p.nesting;delete p.recursionDepth;delete p.recursionScale;
  validateComposition(p);
  assert.throws(()=>packComposition(p,true),/conflict|kept/i);
  const empty={...p,instances:[],maxInstances:20};
  assert.deepEqual(packComposition(empty),packComposition({...empty,nesting:false,recursionDepth:0,recursionScale:.5}));
});

test('assembly selection expands ancestors and siblings while branch deletion leaves valid survivors', () => {
  const {selectAssemblies,removeBranches}=load('composition-selection.js');
  const nodes=[instance({id:'a'}),instance({id:'a/1',parentId:'a',generation:1}),
    instance({id:'a/2',parentId:'a',generation:1}),instance({id:'a/1/1',parentId:'a/1',generation:2}),instance({id:'b'})];
  const snapshot=structuredClone(nodes);
  assert.deepEqual(selectAssemblies(nodes,['a/1/1']),['a','a/1','a/2','a/1/1']);
  assert.deepEqual(selectAssemblies(nodes,['a/1','b','a/2']),nodes.map(i=>i.id));
  assert.deepEqual(selectAssemblies(nodes,['missing']),[]);
  assert.deepEqual(removeBranches(nodes,['a/1']).map(i=>i.id),['a','a/2','b']);
  assert.deepEqual(removeBranches(nodes,['a']).map(i=>i.id),['b']);
  assert.deepEqual(removeBranches(nodes,['missing']),nodes);
  assert.deepEqual(nodes,snapshot);
});

test('clearance-guided repair materially fills residual pockets without moving the baseline', () => {
  const p=params({seed:42,density:.85,maxSizeMm:40,maxInstances:500});
  const baseline=packComposition(p,false,undefined,{repair:false});
  const repaired=packComposition(p);
  assert.deepEqual(repaired.instances.slice(0,baseline.instances.length),baseline.instances);
  assert.ok(repaired.repairAdded>=50,'repair did not find the known residual pockets');
  assert.ok(repaired.coverage-baseline.coverage>.04,'repair coverage gain regressed');
  assert.equal(repaired.repairAdded,repaired.instances.length-baseline.instances.length);
  assert.equal(baseline.repairAttempts,0);
  assert.ok(repaired.repairAttempts>0 && repaired.repairAttempts<=640*8*6,'repair work exceeded its explicit budget');
  assertLayout(p,repaired.instances);
  console.log(`Gap repair: ${baseline.instances.length} → ${repaired.instances.length} forms; ${(100*baseline.coverage).toFixed(2)}% → ${(100*repaired.coverage).toFixed(2)}% occupied area; ${repaired.repairAttempts} bounded attempts`);
});

test('curved support envelopes contain the actual sliced sphere for extreme orientations', () => {
  for(const motif of ['orb','cut-orb']) for(const tilt of [-2,.5,2]) for(const aspect of [1,6]) {
    const i=instance({motif,size:60,aspect,depth:1.5,angle:.73,tilt});
    const polygon=footprintParts(i,true)[0];
    for(let zIndex=0;zIndex<=80;zIndex++) {
      const z=-1+(motif==='cut-orb'?1.35:2)*zIndex/80;
      const radius=Math.sqrt(Math.max(0,1-z*z));
      for(let n=0;n<96;n++) {
        const a=n*Math.PI/48,point=projected(i,radius*Math.cos(a),radius*Math.sin(a),z);
        assert.ok(polygon.every((u,j)=>cross(u,polygon[(j+1)%polygon.length],point)>=-1e-7),'true sphere surface escaped conservative support');
      }
    }
  }
});

test('diagonal clearance uses Euclidean distance and duplicate polygon vertices cannot hide collisions', () => {
  const {polygonsConflict}=load('composition.js');
  const a=[[0,0],[1,0],[1,1],[0,1]], b=[[1.8,1.8],[2.8,1.8],[2.8,2.8],[1.8,2.8]];
  assert.equal(polygonsConflict(a,b,1),false,'diagonal gap is sqrt(.8²+.8²)>1');
  assert.equal(polygonsConflict(a,b,1.2),true);
  const repeated=[[0,0],[0,0],[1,0],[1,1],[0,1]];
  assert.equal(polygonsConflict(repeated,[[.2,.2],[.8,.2],[.8,.8],[.2,.8]],.1),true);
});

test('recursive branch random channels stay stable when an unrelated distant root is added', () => {
  const {populateRecursiveAssemblies,validateAssemblyLineage}=load('composition-recursion.js');
  const {footprintCavities}=load('composition.js');
  const root=instance({id:'stable-root',size:110,depth:.1,angle:.1,tilt:0});
  const distant=instance({id:'distant',x:400,y:400,size:40,depth:.1,angle:.7,tilt:.1});
  const p=params({widthMm:500,heightMm:500,motifs:['frame','prism'],recursionDepth:4,
    recursionScale:.5,maxInstances:100,minSizeMm:2,maxSizeMm:110,clearanceMm:.4});
  function grow(roots) {
    const accepted=[...roots];
    const fits=i=>actualParts(i).every(part=>accepted.every(other=>actualParts(other).every(q=>separation(part,q)>=p.clearanceMm-1e-8)));
    const result=populateRecursiveAssemblies(p,accepted,{footprint,cavities:footprintCavities,fits,
      accept:i=>{if(!fits(i))return false;accepted.push(i);return true;}});
    validateAssemblyLineage(accepted,{footprint,cavities:footprintCavities});
    assert.ok(result.attempts<=24000);
    return result.added.filter(i=>i.id.startsWith('stable-root/'));
  }
  const alone=grow([root]),withOther=grow([distant,root]);
  assert.ok(alone.length>=2);
  assert.deepEqual(alone,withOther);
});

test('recursive mode reserves apertures so later darts and repair cannot create unowned descendants', () => {
  const p=params({seed:137,widthMm:210,heightMm:297,marginMm:12,density:.85,
    motifs:['frame'],depth:.2,aspect:1.6,minSizeMm:2,maxSizeMm:90,
    maxInstances:300,recursionDepth:1,recursionScale:.5,clearanceMm:.6});
  const result=packComposition(p);
  assert.ok(result.instances.some(i=>i.parentId),'fixture requires recursion');
  assert.ok(result.repairAttempts>0,'fixture must reach repair after recursive placement');
  const envelopes=result.instances.map(i=>hull(actualParts(i).flat()));
  for(let j=0;j<result.instances.length;j++) {
    const root=result.instances[j];
    if(root.parentId)continue;
    for(let k=0;k<result.instances.length;k++) if(j!==k) {
      let ancestor=result.instances[k];
      while(ancestor.parentId)ancestor=result.instances.find(i=>i.id===ancestor.parentId);
      if(ancestor.id===root.id)continue; // A parent legitimately surrounds its own descendants.
      assert.ok(!inside([root.x,root.y],envelopes[k]),`unowned root ${root.id} entered frame ${result.instances[k].id}`);
    }
  }
  assertLayout(p,result.instances);
});

test('small global budgets leave room for recursive children before unrelated roots', () => {
  const {COMPOSITION_PRESETS}=load('composition-types.js');
  const recipe=COMPOSITION_PRESETS.find(p=>p.name==='Recursive arcades');
  assert.ok(recipe);
  for(const maxInstances of [5,10]) {
    const p={...DEFAULT_COMPOSITION,...recipe.values,maxInstances};
    const result=packComposition(p);
    assert.ok(result.instances.length<=maxInstances);
    assert.ok(result.instances.some(i=>i.parentId),`instance cap ${maxInstances} starved recursive growth`);
    assertLayout(p,result.instances);
  }
});

test('regenerating around a kept assembly still gives new root frames recursive children', () => {
  const {COMPOSITION_PRESETS}=load('composition-types.js');
  const recipe=COMPOSITION_PRESETS.find(p=>p.name==='Recursive arcades');
  for(const maxInstances of [30,90]) {
  const p={...DEFAULT_COMPOSITION,...recipe.values,maxInstances};
  const initial=packComposition(p).instances;
  const firstChild=initial.find(i=>i.parentId);
  assert.ok(firstChild);
  const byId=new Map(initial.map(i=>[i.id,i]));
  let root=firstChild;while(root.parentId)root=byId.get(root.parentId);
  const keptIds=new Set([root.id]);
  for(let pass=0;pass<5;pass++)for(const i of initial)if(i.parentId&&keptIds.has(i.parentId))keptIds.add(i.id);
  const kept=initial.filter(i=>keptIds.has(i.id)).map(i=>({...i,pinned:true}));
  const next=packComposition({...p,seed:2026,instances:kept});
  for(const i of kept)assert.deepEqual(next.instances.find(x=>x.id===i.id),i);
  assert.ok(next.instances.some(i=>i.parentId&&!keptIds.has(i.parentId)),
    `new root frames were starved of children after the kept assembly consumed the first recursion pass (cap ${maxInstances})`);
  }
});

test('shared construction uses one right-handed isometric frame through every quarter turn', () => {
  const {instanceMatrix}=load('composition.js');
  const sharedAxes=[[-1/Math.sqrt(2),-1/Math.sqrt(6),1/Math.sqrt(3)],
    [1/Math.sqrt(2),-1/Math.sqrt(6),1/Math.sqrt(3)],
    [0,Math.sqrt(2/3),1/Math.sqrt(3)]];
  const dot=(a,b)=>a.reduce((sum,x,j)=>sum+x*b[j],0);
  const v=(x,y,z)=>new ln.Vector(x,y,z);
  for(const quarter of [-4,-3,-2,-1,0,1,2,3,4]) for(const aspect of [1,6]) {
    const i=instance({construction:'shared',size:30,aspect,depth:1.5,angle:quarter*Math.PI/2,tilt:0});
    const matrix=instanceMatrix(i);
    const scales=[i.size*Math.sqrt(aspect)/2,i.size/Math.sqrt(aspect)/2,i.size*i.depth/2];
    const axes=[v(1,0,0),v(0,1,0),v(0,0,1)].map((axis,j)=>{
      const transformed=matrix.mulPosition(axis);
      return [transformed.x/scales[j],transformed.y/scales[j],transformed.z/scales[j]];
    });
    for(let j=0;j<3;j++) {
      assert.ok(Math.abs(dot(axes[j],axes[j])-1)<1e-12,'isometric basis changes world length');
      assert.ok(Math.abs(Math.hypot(axes[j][0],axes[j][1])-Math.sqrt(2/3))<1e-12,'axis foreshortening differs');
      for(let k=j+1;k<3;k++)assert.ok(Math.abs(dot(axes[j],axes[k]))<1e-12,'world axes are not orthogonal');
      assert.ok(sharedAxes.some(target=>Math.abs(Math.abs(dot(axes[j],target))-1)<1e-12),'quarter turn escaped the shared world axes');
    }
    const det=axes[0][0]*(axes[1][1]*axes[2][2]-axes[1][2]*axes[2][1])
      -axes[1][0]*(axes[0][1]*axes[2][2]-axes[0][2]*axes[2][1])
      +axes[2][0]*(axes[0][1]*axes[1][2]-axes[0][2]*axes[1][1]);
    assert.ok(Math.abs(det-1)<1e-12,'shared construction mirrored the solids');
    assert.ok(Math.abs(axes[2][0])<1e-12 && axes[2][1]>0,'vertical world edges no longer point up on paper');
    for(const p of [[1,0,0],[0,1,0],[0,0,1],[.3,-.7,.8]]) {
      const actual=matrix.mulPosition(v(...p));
      const expected=projected(i,...p);
      assert.ok(Math.hypot(actual.x+i.x-expected[0],actual.y+i.y-expected[1])<1e-10,'matrix disagrees with independent world-yaw projection');
    }
  }
});

test('shared construction applies to root placement and gap repair while preserving solid clearance', () => {
  const p=params({construction:'shared',seed:42,widthMm:150,heightMm:180,density:.85,
    minSizeMm:3,maxSizeMm:35,maxInstances:350,aspect:6,coherence:0,depth:.3});
  const result=packComposition(p);
  assert.ok(result.repairAdded>0,'fixture must exercise repair orientations');
  assert.deepEqual(result,packComposition(p));
  for(const i of result.instances) {
    assert.equal(i.construction,'shared');
    assert.ok(Math.abs(i.angle/(Math.PI/2)-Math.round(i.angle/(Math.PI/2)))<1e-9,'root or repair introduced off-axis rotation');
    assert.equal(i.tilt,0,'noise introduced a second construction plane');
  }
  assertLayout(p,result.instances);
});

test('shared recursive descendants inherit their parent construction frame exactly', () => {
  const {COMPOSITION_PRESETS}=load('composition-types.js');
  const p={...DEFAULT_COMPOSITION,...COMPOSITION_PRESETS.find(r=>r.name==='Recursive arcades').values,
    construction:'shared',maxInstances:70};
  const result=packComposition(p);
  const byId=new Map(result.instances.map(i=>[i.id,i]));
  const descendants=result.instances.filter(i=>i.parentId);
  assert.ok(descendants.length>3,'shared projection needs useful recursive apertures');
  for(const child of descendants) {
    const parent=byId.get(child.parentId);
    assert.equal(child.construction,parent.construction);
    assert.equal(child.angle,parent.angle);
    assert.equal(child.tilt,parent.tilt);
  }
  assertLayout(p,result.instances);
  validateComposition({...p,instances:result.instances});
});

test('legacy resolved matrices remain unchanged when shared construction becomes the recipe default', () => {
  const {instanceMatrix}=load('composition.js');
  const legacy=instance({id:'legacy',angle:.73,tilt:.61,size:30,aspect:2.4,depth:.4});
  const free={...legacy,construction:'free'};
  const expected=[];
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]) {
    const point=new ln.Vector(x,y,z),a=instanceMatrix(legacy).mulPosition(point),b=instanceMatrix(free).mulPosition(point);
    assert.deepEqual(a,b,'marking an old form free changed its matrix');
    const p=projected(legacy,x,y,z);
    assert.ok(Math.hypot(a.x+legacy.x-p[0],a.y+legacy.y-p[1])<1e-10);
    expected.push([a.x,a.y,a.z]);
  }
  const p=params({construction:'shared',instances:[legacy],maxInstances:1});
  const result=packComposition(p,true);
  assert.deepEqual(result.instances,[legacy],'new default silently reoriented a retained form');
  assert.deepEqual(instanceMatrix(result.instances[0]),instanceMatrix(legacy));
  assert.ok(expected.length===8);
  const {serializeScene,parseScene}=load('scene-file.js');
  const {DEFAULT_TRANSFORM,DEFAULT_SLICING,DEFAULT_RENDER_SETTINGS}=load('types.js');
  const {CAMERA_PRESETS}=load('cameras.js');
  const scene={nodes:[{id:'packed',type:'packed-composition',name:'Legacy',params:p,visible:true,
    transform:DEFAULT_TRANSFORM,slicing:DEFAULT_SLICING}],cameras:CAMERA_PRESETS,
    renderSettings:DEFAULT_RENDER_SETTINGS,viewMode:'single',activeCameraIndex:0};
  assert.deepEqual(parseScene(serializeScene(scene)).nodes[0].params.instances,[legacy]);
});

test('construction validation rejects unsupported modes and malformed shared orientations', () => {
  for(const construction of ['unknown',0,null]) {
    assert.throws(()=>validateComposition(params({construction})),/construction|orientation/i);
    assert.throws(()=>validateComposition(params({instances:[instance({construction})]})),/construction|orientation/i);
  }
  assert.throws(()=>validateComposition(params({instances:[instance({construction:'shared',angle:.1,tilt:0})]})),/quarter|angle|orientation|construction/i);
  assert.doesNotThrow(()=>validateComposition(params({instances:[instance({construction:'free',angle:.1,tilt:.5})]})));
});

test('shared frames preserve equal physical rail thickness across aspect ratios', () => {
  const {compositionShapes}=load('composition-geometry.js');
  const {COMPOSITION_SCALE}=load('composition.js');
  for(const aspect of [1,2.4,6]) {
    const i=instance({construction:'shared',angle:Math.PI/2,tilt:0,aspect,size:40,depth:.2});
    const p=params({instances:[i]});
    const shapes=compositionShapes(p);
    assert.equal(shapes.length,4);
    const left=shapes[0],bottom=shapes[2];
    const a=left.matrix.mulPosition(left.shape.min);
    const b=left.matrix.mulPosition(new ln.Vector(left.shape.max.x,left.shape.min.y,left.shape.min.z));
    const c=bottom.matrix.mulPosition(bottom.shape.min);
    const d=bottom.matrix.mulPosition(new ln.Vector(bottom.shape.min.x,bottom.shape.max.y,bottom.shape.min.z));
    const xThickness=a.distance(b)/COMPOSITION_SCALE,yThickness=c.distance(d)/COMPOSITION_SCALE;
    assert.ok(Math.abs(xThickness-yThickness)<1e-9,'aspect ratio stretched one rail family');
    assert.ok(Math.abs(xThickness-.2*i.size/Math.sqrt(aspect))<1e-9,'rendered rail differs from paper geometry');
    const expected=actualParts(i),occupied=footprintParts(i,true);
    for(let j=0;j<expected.length;j++)for(const point of expected[j])
      assert.ok(occupied[j].every((u,k)=>cross(u,occupied[j][(k+1)%occupied[j].length],point)>=-1e-7),'packing footprint omitted a rendered rail');
  }
});

test('shared engraving follows the same world-facing surface through every quarter turn', () => {
  const {compositionShapes}=load('composition-geometry.js');
  const worldX=new ln.Vector(-1/Math.sqrt(2),-1/Math.sqrt(6),1/Math.sqrt(3));
  for(const motif of ['prism','frame','steps'])for(const quarter of [0,1,2,3]) {
    const i=instance({motif,construction:'shared',angle:quarter*Math.PI/2,tilt:0,size:40,aspect:2.4,depth:.4});
    for(const shape of compositionShapes(params({instances:[i],detail:5}))) {
      const box=shape.shape;
      const corners=[box.min.x,box.max.x].flatMap(x=>[box.min.y,box.max.y].flatMap(y=>[box.min.z,box.max.z].map(z=>new ln.Vector(x,y,z))));
      const facing=Math.max(...corners.map(p=>shape.matrix.mulPosition(p).dot(worldX)));
      const engraving=box.paths().slice(12);
      assert.equal(engraving.length,5);
      for(const path of engraving)for(const p of path)
        assert.ok(Math.abs(shape.matrix.mulPosition(p).dot(worldX)-facing)<1e-9,
          `${motif} engraving switched world faces at quarter turn ${quarter}`);
    }
  }
  const legacy=instance({motif:'prism',construction:'free',angle:1.1,tilt:.61,size:40,aspect:2.4});
  const shape=compositionShapes(params({instances:[legacy]}))[0];
  for(const path of shape.shape.paths().slice(12))for(const p of path)
    assert.equal(p.x,shape.shape.max.x,'legacy local-face decoration changed');
});
