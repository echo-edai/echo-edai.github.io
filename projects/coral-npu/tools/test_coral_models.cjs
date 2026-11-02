/* Tests for the bounded, explanatory models in models.js.
 * These are not Coral RTL, ISA-conformance, timing or performance tests.
 * Run: node web/coralnpu/tools/test_coral_models.cjs
 */
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../models.js');

const workspace = path.resolve(__dirname, '../../..');
const upstream = path.join(workspace, 'CoralNPU/hardware/coralnpu');
const parametersPath = path.join(upstream, 'hdl/chisel/src/coralnpu/Parameters.scala');
const bankPath = path.join(upstream, 'hdl/chisel/src/coralnpu/BankedDtcm.scala');
const coreAxiPath = path.join(upstream, 'hdl/chisel/src/coralnpu/CoreAxi.scala');
const hasUpstream = [parametersPath, bankPath, coreAxiPath].every(p => fs.existsSync(p));

test('vector: VLEN/SEW/LMUL determine logical capacity, not a physical lane count', () => {
  const examples = [
    [{sew:32, lmul:1}, 4], [{sew:16, lmul:1}, 8],
    [{sew:8, lmul:1}, 16], [{sew:32, lmul:4}, 16],
    [{sew:8, lmul:4}, 64],
  ];
  for (const [options, expected] of examples) {
    const p = M.vectorPlan({...options, vl:999});
    assert.equal(p.vlmax, expected);
    assert.equal(p.vl, expected);
    assert.equal(p.lanes.length, expected);
    assert.equal(p.registers, options.lmul);
  }
});

test('vector: only in-range, unmasked elements produce arithmetic results', () => {
  const mask = Object.freeze([true, false, true, false, true, true, true, true]);
  const p = M.vectorPlan({sew:16, vl:3, mask});
  assert.deepEqual(p.lanes.filter(e => e.active).map(e => e.i), [0,2]);
  assert.equal(p.lanes[0].result, 2); // A[0]=1, B[0]=1.
  assert.equal(p.lanes[2].result, 8); // A[2]=3, B[2]=5.
  assert.equal(p.lanes[1].result, null);
  assert.equal(p.lanes[1].masked, true);
  assert.equal(p.lanes[3].tail, true);
  assert.equal(p.lanes[3].result, null);
  assert.equal(p.lanes[4].active, false, 'tail remains inactive even when its mask is true');
});

test('vector: empty vl and capacity clipping do not fabricate active elements', () => {
  assert.ok(M.vectorPlan({vl:0}).lanes.every(e => e.tail && !e.active && e.result === null));
  assert.equal(M.vectorPlan({vl:-1}).vl, 0);
  assert.equal(M.vectorPlan({sew:32, lmul:2, vl:100}).vl, 8);
});

test('integer normalization: fractional vl cannot produce a contradictory active count', () => {
  const p = M.vectorPlan({vl:1.5});
  assert.equal(p.vl,1);
  assert.equal(p.lanes.filter(e=>e.active).length,1);
  assert.equal(M.clamp('17.9',1,128),17,'shared UI normalization floors fractional dimensions');
  assert.equal(M.clamp(-1.5,0,64),0);
});

test('vector: exhaustive supported integer controls preserve tail/mask partitions', () => {
  for (const sew of [8,16,32]) for (const lmul of [1,2,4]) {
    const max = 128 / sew * lmul;
    for (let vl=0; vl<=max; vl++) {
      const p = M.vectorPlan({sew,lmul,vl,mask:Array.from({length:max},(_,i)=>i%3!==1)});
      const active = Array.from({length:vl},(_,i)=>i).filter(i=>i%3!==1);
      assert.deepEqual(p.lanes.filter(e=>e.active).map(e=>e.i), active);
      assert.equal(p.lanes.filter(e=>e.tail).length, max-vl);
      assert.ok(p.lanes.every(e => e.result === null || e.active));
    }
  }
});

test('bank: consecutive words spread, equal-stride words conflict', () => {
  const spread = M.bankPlan([0,4,8,12], 4);
  assert.deepEqual(spread.mapping, [0,1,2,3]);
  assert.equal(spread.grants.length, 4);
  assert.deepEqual(spread.pending, []);
  const conflict = M.bankPlan([0,16,32,48], 4);
  assert.deepEqual(conflict.mapping, [0,0,0,0]);
  assert.deepEqual(conflict.grants.map(g=>g.id), [0]);
  assert.deepEqual(conflict.pending, [1,2,3]);
});

test('bank: bytes within one word share a bank', () => {
  const p = M.bankPlan([0,1,3,4],4);
  assert.deepEqual(p.mapping, [0,0,0,1]);
  assert.deepEqual(p.grants.map(g=>g.id), [0,3]);
  assert.deepEqual(p.pending, [1,2]);
});

test('bank: a closed request batch drains exactly once without per-bank double grants', () => {
  for (const banks of [4,8]) {
    const addresses = Array.from({length:64},(_,i)=>((i*7)%19)*4);
    const original = addresses.slice();
    let pending = null;
    const served = [];
    for (let cycle=0; cycle<64; cycle++) {
      const p = M.bankPlan(addresses,banks,4,pending);
      assert.equal(new Set(p.grants.map(g=>g.bank)).size,p.grants.length);
      assert.equal(p.conflicts,p.pending.length);
      served.push(...p.grants.map(g=>g.id));
      pending = p.pending;
      if (!pending.length) break;
    }
    assert.deepEqual(served.slice().sort((a,b)=>a-b),Array.from({length:64},(_,i)=>i));
    assert.equal(new Set(served).size,64);
    assert.deepEqual(addresses,original,'model does not mutate caller addresses');
    assert.deepEqual(M.bankPlan(addresses,banks,4,[]).grants,[],'an empty pending batch must stay drained');
  }
});

test('bank: same-bank requests preserve original lower-id priority across retry cycles', () => {
  const addresses = [0,32,64,96];
  let pending = null;
  for (let expected=0; expected<4; expected++) {
    const p = M.bankPlan(addresses,8,4,pending);
    assert.deepEqual(p.grants.map(g=>g.id),[expected]);
    pending = p.pending;
  }
  assert.deepEqual(pending,[]);
});

test('tile: default example counts a padded output grid and all K chunks', () => {
  const p = M.tilePlan();
  assert.deepEqual([p.rows,p.cols,p.depth,p.steps],[3,4,8,96]);
  assert.equal(p.operations,655360,'nominal multiply-plus-add operation count');
  assert.equal(p.operandBytes,1024,'two A/B buffers, each 512 bytes total');
  assert.equal(p.accumulatorBytes,1024,'16x16, four-byte accumulators');
  assert.equal(p.footprint,2048);
  assert.equal(p.logicalUtilization,5/6);
  assert.equal(p.fits,true);
});

test('tile: double buffering duplicates operands, not the accumulator', () => {
  const single = M.tilePlan({doubleBuffer:false,bytes:2});
  const double = M.tilePlan({doubleBuffer:true,bytes:2});
  assert.equal(double.operandBytes,2*single.operandBytes);
  assert.equal(double.accumulatorBytes,single.accumulatorBytes);
  assert.equal(double.footprint-single.footprint,single.operandBytes);
  assert.equal(double.steps,single.steps,'buffering is a capacity estimate, not a cycle speedup model');
});

test('tile: exact capacity boundary fits, one smaller KiB budget does not', () => {
  assert.equal(M.tilePlan({tcmKB:2}).fits,true);
  assert.equal(M.tilePlan({tcmKB:1}).fits,false);
  assert.equal(M.tilePlan({tcmKB:2}).capacity,2048);
});

test('tile: increasing K changes work without changing a fixed local tile footprint', () => {
  const a = M.tilePlan({k:16});
  const b = M.tilePlan({k:32});
  assert.equal(b.steps,2*a.steps);
  assert.equal(b.operations,2*a.operations);
  assert.equal(a.footprint,b.footprint);
});

test('tile: independent enumeration of edge elements agrees with utilization', () => {
  const p = M.tilePlan({m:17,n:17,k:17});
  assert.deepEqual([p.rows,p.cols,p.depth,p.steps],[2,2,2,8]);
  let useful=0,allocated=0;
  for(let row=0;row<p.rows;row++)for(let col=0;col<p.cols;col++) {
    for(let i=0;i<p.tm;i++)for(let j=0;j<p.tn;j++) {
      allocated++;
      if(row*p.tm+i<p.m && col*p.tn+j<p.n) useful++;
    }
  }
  assert.equal(useful,289);
  assert.equal(allocated,1024);
  assert.equal(p.logicalUtilization,useful/allocated);
});

test('address: each window is half-open and reports byte offsets', () => {
  for (const highmem of [false,true]) {
    const regions = M.addressRegion(0,highmem).regions;
    for (const r of regions) {
      assert.equal(M.addressRegion(r.start,highmem).selected,r.name);
      assert.equal(M.addressRegion(r.start,highmem).offset,0);
      assert.equal(M.addressRegion(r.start+r.size-1,highmem).selected,r.name);
      assert.equal(M.addressRegion(r.start+r.size-1,highmem).offset,r.size-1);
      assert.notEqual(M.addressRegion(r.start+r.size,highmem).selected,r.name);
    }
  }
});

test('address: default gaps, highmem adjacency, and final byte of RV32 are distinct', () => {
  assert.equal(M.addressRegion(0x2000).offset,null);
  assert.equal(M.addressRegion(0x10000).selected,'DTCM');
  assert.equal(M.addressRegion(0x18000).offset,null);
  assert.equal(M.addressRegion(0x30000).selected,'CSR');
  assert.equal(M.addressRegion(0x100000,true).selected,'DTCM');
  assert.equal(M.addressRegion(0x200000,true).selected,'CSR');
  assert.equal(M.addressRegion(0x201000,true).offset,null);
  assert.equal(M.addressRegion(0xffffffff).offset,null);
});

test('address: templates agree with checked-out Parameters; CoreAxi uses that map', {skip:!hasUpstream}, () => {
  const text = fs.readFileSync(parametersPath,'utf8');
  const names = {IMEM:'ITCM',DMEM:'DTCM',Peripheral:'CSR'};
  const defaultBlock = text.split('val default = Seq(')[1].split('def highmem(')[0];
  const actual = [...defaultBlock.matchAll(/new MemoryRegion\((0x[0-9a-f]+),\s*(0x[0-9a-f]+),\s*MemoryRegionType\.(\w+)\)/gi)]
    .map(m=>({name:names[m[3]],start:Number(m[1]),size:Number(m[2])}));
  assert.equal(actual.length,3,'read three real default regions, not a silent empty match');
  assert.deepEqual(M.addressRegion(0).regions,actual);
  const itcmKB = Number(text.match(/val itcmSizeKBytesHighmem\s*=\s*(\d+)/)[1]);
  const dtcmKB = Number(text.match(/val dtcmSizeKBytesHighmem\s*=\s*(\d+)/)[1]);
  const highmemBlock = text.split('def highmem(')[1].split('object Parameters')[0];
  const highmem = [...highmemBlock.matchAll(/new MemoryRegion\((0x[0-9a-f]+),\s*(itcmSizeKBytes \* 1024|dtcmSizeKBytes \* 1024|0x[0-9a-f]+),\s*MemoryRegionType\.(\w+)\)/gi)]
    .map(m=>({name:names[m[3]],start:Number(m[1]),size:m[2].startsWith('itcm')?itcmKB*1024:m[2].startsWith('dtcm')?dtcmKB*1024:Number(m[2])}));
  assert.equal(highmem.length,3,'read three actual highmem base/size expressions');
  assert.deepEqual(M.addressRegion(0,true).regions,highmem);
  const wrapper = fs.readFileSync(coreAxiPath,'utf8');
  assert.match(wrapper,/val memoryRegions\s*=\s*p\.m/);
  assert.match(wrapper,/val inItcm = memoryRegions\(0\)\.contains\(core\.io\.ibus\.addr\)/);
  // This is a source-level cross-check, not elaboration or a bus-transaction test.
});

test('bank: teaching word interleaving explicitly differs from the real emitter range decode', {skip:!hasUpstream}, () => {
  const text = fs.readFileSync(bankPath,'utf8');
  assert.match(text,/var numBanks\s*=\s*8/);
  assert.match(text,/val bankSizeBytes = dtcmSize \/ numBanks/);
  assert.match(text,/val bank_sel = offset\(log2Ceil\(dtcmSize\) - 1, log2Ceil\(bankSizeBytes\)\)/);
  const addresses = [0x10000,0x10004,0x10008,0x1000c];
  assert.deepEqual(M.bankPlan(addresses,8).mapping,[0,1,2,3]);
  const rangeMapping = addresses.map(address => Math.floor((address-0x10000)/4096));
  assert.deepEqual(rangeMapping,[0,0,0,0]);
  assert.notDeepEqual(M.bankPlan(addresses,8).mapping,rangeMapping);
});

test('XY: representative routes include endpoints, move X first, then Y', () => {
  assert.deepEqual(M.xyRoute(0,15),[0,1,2,3,7,11,15]);
  assert.deepEqual(M.xyRoute(15,0),[15,14,13,12,8,4,0]);
  assert.deepEqual(M.xyRoute(5,5),[5]);
  assert.deepEqual(M.xyRoute(1,7,3),[1,4,7]);
});

test('XY: all 256 routes have Manhattan length, legal neighbors and no loops', () => {
  const size=4;
  for(let source=0;source<size*size;source++)for(let destination=0;destination<size*size;destination++) {
    const p=M.xyRoute(source,destination,size);
    const distance=Math.abs(source%size-destination%size)+Math.abs(Math.floor(source/size)-Math.floor(destination/size));
    assert.equal(p[0],source);
    assert.equal(p.at(-1),destination);
    assert.equal(p.length-1,distance);
    assert.equal(new Set(p).size,p.length);
    let enteredY=false;
    for(let i=1;i<p.length;i++) {
      const dx=Math.abs(p[i]%size-p[i-1]%size),dy=Math.abs(Math.floor(p[i]/size)-Math.floor(p[i-1]/size));
      assert.equal(dx+dy,1);
      assert.ok(p[i]>=0&&p[i]<size*size);
      if(dy) enteredY=true;
      if(enteredY) assert.equal(dx,0,'no X turn after the Y phase starts');
    }
  }
});
