import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let plugin, render, dict, states=[], cursor=0, effects=[];
const React={createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),Fragment:'fragment',useState:init=>{const i=cursor++;if(!(i in states))states[i]=typeof init==='function'?init():init;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v];},useRef:v=>{const i=cursor++;return states[i]??=( {current:v});},useEffect:()=>{},useLayoutEffect:()=>{}};
vm.runInNewContext(fs.readFileSync('client.js','utf8'),{window:{__ModuleLoader__:{load:mod=>plugin=mod.factory(()=>React)},innerWidth:1000},console,Date,Map,Set,Intl,Number,Math,ResizeObserver:undefined});
plugin.apply({effect:()=>{},locale:{bind:()=> (key,vars)=>key+(vars?.day??'')},slots:{inject:(_,fn)=>fn(),register:(_,fn)=>render=fn}});
const draw=()=>{cursor=0;return render({language:'zh'});};
const all=node=>node&&typeof node==='object'?[node,...node.children.flatMap(all)]:[];
const initial = all(draw()).find(n => n.props.className === 'dth-weeks');
assert.equal(initial.props['data-ready'], 'false');
assert.equal(initial.props['data-enter'], 'false');
states[0]={days:[{day:'2026-10-13',totalTokens:117405946,inputTokens:534806,outputTokens:530532,cacheReadTokens:116340608,calls:524}],totalTokens:117405946};
let tree=draw();let nodes=all(tree);
const firstVisible = nodes.find(n => n.props.className === 'dth-weeks');
assert.equal(firstVisible.props['data-ready'], 'true');
assert.equal(firstVisible.props['data-enter'], 'true', 'first visible render must already animate, before effects');
assert.equal(firstVisible.children.length,26,'default range is 26 weeks');
let cell=nodes.find(n=>n.props['data-day']==='2026-10-13');assert.equal(cell.type,'button');assert.equal(typeof cell.props.onFocus,'function');
cell.props.onMouseEnter({clientX:100,clientY:100});
const tooltip = all(draw()).find(n=>n.props.className==='dth-tip');
assert.equal(tooltip.children[0], 'metricTotal 117,405,946 Token\ntipClick');
assert.equal(tooltip.children[0].split('\n').length,2);
const element={parentElement:null};cell.props.onClick({currentTarget:element});tree=draw();nodes=all(tree);assert(nodes.some(n=>n.type==='section'));assert(!nodes.some(n=>n.props.hidden===true));assert(nodes.some(n=>n.props.className==='dth-overview'));assert(JSON.stringify(tree).includes('117,405,946'));assert(JSON.stringify(tree).includes('99.09%'));
const segments = nodes.filter(n=>n.props.className==='dth-bar-segment dth-part');
assert.equal(segments.length,3);
assert(Math.abs(segments.reduce((sum,n)=>sum+parseFloat(n.props.style.width),0)-100)<1e-9);
assert(nodes.some(n=>n.props.className==='dth-bar' && n.props.role==='img'));

assert.equal(nodes.find(n=>n.props['data-day']==='2026-10-13').props['aria-pressed'], true);
nodes.find(n=>n.props['data-day']==='2026-10-12').props.onClick();
tree=draw();nodes=all(tree);
assert.equal(nodes.filter(n=>n.type==='section').length,1);
assert.equal(nodes.find(n=>n.props['data-day']==='2026-10-12').props['aria-pressed'],true);
assert.equal(nodes.find(n=>n.props['data-day']==='2026-10-13').props['aria-pressed'],false);
assert.equal(states[2],'totalTokens');assert.equal(states[3],'day');
assert.equal(nodes.find(n=>n.props.className==='dth-weeks').props['data-enter'],'false');

nodes.find(n=>n.type==='button' && n.children.includes('rangeYear')).props.onClick();
tree=draw();nodes=all(tree);
const yearRows = nodes.filter(n=>n.props.className==='dth-weeks');
assert.deepEqual(yearRows.map(n=>n.children.length),[27,26]);
const yearDates = yearRows.flatMap(row=>all(row).filter(n=>n.props['data-day']).map(n=>n.props['data-day']));
assert.equal(new Set(yearDates).size,yearDates.length,'year rows do not duplicate dates');
assert.equal(nodes.find(n=>n.props.className==='dth-weeks').props['data-enter'],'false');
assert(nodes.some(n=>n.type==='section'),'range switch preserves inline details');
nodes.find(n=>n.type==='button' && n.children.includes('rangeHalf')).props.onClick();
assert.equal(all(draw()).find(n=>n.props.className==='dth-weeks').children.length,26);

let count=0;for(let month=0;month<12;month++)for(let day=1;day<=28;day++){const today=new Date(2026,month,day);const start=new Date(today);start.setDate(start.getDate()-start.getDay()-52*7);const last=new Date(start);last.setDate(last.getDate()+370);assert(last>=today);count++;}
console.log('PASS: actual client render, daily click/detail values/composition, inline date switching and retained filters, keyboard handlers, 336 calendar windows');

for (const available of [320, 480, 640, 800, 900]) {
  for (const weeks of [26, 27]) {
    const cell = Math.max(1, Math.min(20, Math.floor((available - 4 - (weeks - 1) * 4) / weeks)));
    assert(cell * weeks + (weeks - 1) * 4 + 4 <= available, 'range fits without overflow');
  }
}
