const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
// Never load .env, accept a remote URL, or use the application's database connector.
process.env.JWT_SECRET = 'isolated-load-test-only';
process.env.DB_CACHE_TTL_MS = '15000';
process.env.DB_CACHE_MAX_ENTRIES = '250';
process.env.MONGOMS_DOWNLOAD_DIR = path.join(__dirname, '..', 'node_modules', '.cache', 'mongodb-binaries');
delete process.env.MONGO_URI;
delete process.env.RENDER_GIT_COMMIT;
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const Admin = require('../src/models/Admin');
const Panel = require('../src/models/Panel');
const Subject = require('../src/models/Subject');
const Section = require('../src/models/Section');
const Group = require('../src/models/Group');
const Rubric = require('../src/models/Rubric');
const Evaluation = require('../src/models/Evaluation');
const Settings = require('../src/models/Settings');
const AuditLog = require('../src/models/AuditLog');
const { clearResponseCache } = require('../src/middleware/cache.middleware');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const percentile = (values, p) => values.length ? Math.round([...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]) : 0;
let mongo, server, baseUrl;
const actors = [], admins = [], successfulWrites = new Set();
function sign(user) { return jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' }); }
async function seed() {
  const password = await bcrypt.hash('GeneratedLoadTest!2026', 4);
  for (let i=0; i<10; i++) {
    const subject = await Subject.create({code:'LOAD'+i,title:'Synthetic subject '+i});
    const [instructor] = await Admin.insertMany([{name:'Synthetic instructor '+i,email:'load-admin-'+i+'@evalsys.com',password,role:'admin',assignedSubjects:[subject._id]}]);
    const rubric = await Rubric.create({title:'Synthetic rubric',subject:subject._id,createdBy:instructor._id,criteria:[{key:'quality',label:'Quality',maxScore:10,levels:[{label:'Score',minScore:0,maxScore:10}]}]});
    const panels = await Panel.insertMany(Array.from({length:20},(_,j)=>({name:'Synthetic panel '+i+'-'+j,email:'load-panel-'+i+'-'+j+'@evalsys.com',password,createdBy:instructor._id,mustChangePassword:false})));
    for(let b=0;b<4;b++) {
      const assigned=panels.slice(b*5,b*5+5);
      const section=await Section.create({name:'Synthetic block '+b,block:'LOAD-'+i+'-'+b,subject:subject._id,createdBy:instructor._id,assignedPanels:assigned.map(p=>p._id)});
      const groups=await Group.insertMany(Array.from({length:10},(_,g)=>({name:'Synthetic group '+g,section:section._id,createdBy:instructor._id,members:Array.from({length:4},(_,m)=>({firstName:'Student'+m,lastName:'Synthetic'}))})));
      await Evaluation.insertMany(assigned.flatMap(panel=>groups.map(group=>({group:group._id,panel:panel._id,rubric:rubric._id,subject:subject._id,scores:{quality:7},total:7,isSubmitted:true}))));
      assigned.forEach(panel=>actors.push({id:String(panel._id),token:sign(panel),subject:String(subject._id),rubric:String(rubric._id),groups:groups.map(g=>String(g._id))}));
      if(b===0) admins.push({token:sign(instructor),subject:String(subject._id),section:String(section._id)});
    }
  }
  await Settings.create({});
}
async function request(actor, label, method, route, body, stats) {
  const start=performance.now();
  try {
    const response=await fetch(baseUrl+route,{method,headers:{Authorization:'Bearer '+actor.token,'x-subject-id':actor.subject,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});
    const text=await response.text();
    const sample={label,ms:performance.now()-start,status:response.status};
    stats.samples.push(sample);
    if(!response.ok) {stats.errors.push({label,status:response.status,body:text.slice(0,160)});return false;}
    if(method==='POST') successfulWrites.add(actor.id+':'+route.split('/').pop());
    return true;
  } catch(error) {stats.samples.push({label,ms:performance.now()-start,status:0});stats.errors.push({label,status:0,body:error.message});return false;}
}
function summarize(name, users, stats, start) {
  const duration=(performance.now()-start)/1000;
  const values=stats.samples.map(s=>s.ms);
  return {name,users,seconds:Number(duration.toFixed(2)),requests:values.length,errors:stats.errors.length,rps:Number((values.length/duration).toFixed(1)),p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),p99Ms:percentile(values,.99),maxMs:Math.round(Math.max(0,...values)),nodeRssMiB:Math.round(process.memoryUsage().rss/1024/1024),endpoints:Object.fromEntries([...new Set(stats.samples.map(s=>s.label))].map(label=>{const s=stats.samples.filter(s=>s.label===label);return [label,{requests:s.length,errors:s.filter(s=>s.status<200||s.status>=300).length,p95Ms:percentile(s.map(s=>s.ms),.95)}]})),errorExamples:stats.errors.slice(0,5)};
}
async function stage(users) {
  clearResponseCache();
  const stats={samples:[],errors:[]};const start=performance.now();const stop=start+15000;
  await Promise.all(Array.from({length:users},async(_,index)=>{
    await sleep(index%10*20);
    const admin=index%10===9;const actor=admin?admins[Math.floor(index/10)%admins.length]:actors[index];
    let cycle=0;
    while(performance.now()<stop) {
      if(admin) await request(actor,'section results','GET','/api/evaluations/section/'+actor.section+'/results',null,stats);
      else {
        const group=actor.groups[cycle%actor.groups.length];
        await request(actor,'group list','GET','/api/groups',null,stats);
        await Promise.all([
          request(actor,'active rubric','GET','/api/rubrics/active',null,stats),
          request(actor,'own evaluation','GET','/api/evaluations/group/'+group+'/mine',null,stats)
        ]);
        await request(actor,'submit grade','POST','/api/evaluations/group/'+group,{rubricId:actor.rubric,scores:{quality:8},comments:'Synthetic load test'},stats);
      }
      cycle++;
      await sleep(1000);
    }
  }));
  const result=summarize('mixed grading (1s between cycles)',users,stats,start);
  console.log(JSON.stringify(result));return result;
}
async function burst() {
  const stats={samples:[],errors:[]};const start=performance.now();
  await Promise.all(actors.map(actor=>request(actor,'submit grade','POST','/api/evaluations/group/'+actor.groups[9],{rubricId:actor.rubric,scores:{quality:8},comments:'Synthetic simultaneous burst'},stats)));
  const result=summarize('simultaneous grade submissions',200,stats,start);console.log(JSON.stringify(result));return result;
}
async function main() {
  try {
    mongo=await MongoMemoryServer.create({instance:{dbName:'evalsys_load_test_temporary'}});
    const uri=mongo.getUri();assert.ok(/^mongodb:\/\/127\.0\.0\.1:/.test(uri),'Only isolated loopback MongoDB is allowed');
    await mongoose.connect(uri,{maxPoolSize:10,serverSelectionTimeoutMS:5000,socketTimeoutMS:45000,family:4});
    await Promise.all([Admin,Panel,Subject,Section,Group,Rubric,Evaluation,Settings,AuditLog].map(model=>model.init()));
    await seed();
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    baseUrl='http://127.0.0.1:'+server.address().port;
    console.log('ISOLATED_READY: 10 instructors, 200 panels, 40 blocks, 400 groups, 2000 evaluations; MongoDB pool 10.');
    const results=[];
    for(const users of [10,25,50,100,200]) results.push(await stage(users));
    results.push(await burst());
    const duplicates=await Evaluation.aggregate([{$group:{_id:{group:'$group',panel:'$panel'},count:{$sum:1}}},{$match:{count:{$gt:1}}}]);
    const saved=await Evaluation.find({comments:{$in:['Synthetic load test','Synthetic simultaneous burst']}}).select('group panel total scores isSubmitted').lean();
    const savedKeys=new Set(saved.map(e=>String(e.panel)+':'+String(e.group)));
    const missing=[...successfulWrites].filter(key=>!savedKeys.has(key));
    const invalid=saved.filter(e=>e.total!==8||e.scores.quality!==8||!e.isSubmitted);
    const integrity={successfulUniqueWrites:successfulWrites.size,verifiedSavedWrites:saved.length,missing:missing.length,duplicates:duplicates.length,invalid:invalid.length,evaluationCount:await Evaluation.countDocuments()};
    assert.equal(integrity.missing,0);assert.equal(integrity.duplicates,0);assert.equal(integrity.invalid,0);assert.equal(integrity.evaluationCount,2000);
    const report={timestamp:new Date().toISOString(),environment:{platform:os.platform(),node:process.version,cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,totalRamGiB:Number((os.totalmem()/1024**3).toFixed(1)),mongoPool:10},fixture:{instructors:10,panels:200,sections:40,groups:400,evaluations:2000},results,integrity,limitations:['Local API, local MongoDB and load generator share one computer/process; not a Render/Atlas capacity benchmark.','Short 15-second stages; not a sustained soak test or browser-rendering test.','Preauthenticated users; login spikes, uploads, exports and production network latency are excluded.','Each panel sends 4 requests per grading cycle with a 1-second pause; 10% of simulated users view instructor results.']};
    await fs.writeFile(path.join(__dirname,'load-test-results.json'),JSON.stringify(report,null,2)+'\n');
    const lines=['# Isolated load test results','', 'Run: '+report.timestamp,'','Production data was not accessed. The test created a temporary local MongoDB instance and bound the API to loopback. No .env files or production database connector were used.','', '## Workload','', '10 instructors, 200 panels, 40 blocks, 400 groups and 2,000 seeded evaluations. MongoDB pool: 10, matching the application. Production response caching enabled. Users browse groups, load rubric and existing scores, submit scores; 10% view instructor results. One-second pause between cycles. Tokens were generated before measurement.','', '| Scenario | Users | Requests | Errors | Requests/s | Median ms | P95 ms | P99 ms |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
    results.forEach(r=>lines.push('| '+r.name+' | '+r.users+' | '+r.requests+' | '+r.errors+' | '+r.rps+' | '+r.p50Ms+' | '+r.p95Ms+' | '+r.p99Ms+' |'));
    lines.push('','P95 means 95% of measured requests completed within this time. Burst throughput covers the duration of the single burst, not sustainable throughput.','','## Integrity','','Verified '+integrity.verifiedSavedWrites+' saved grade records against successful writes. Missing: '+integrity.missing+'; duplicates: '+integrity.duplicates+'; incorrect scores: '+integrity.invalid+'. Total evaluation count remained 2,000.','','## Environment and limits','',report.environment.cpu+'; '+report.environment.logicalCpus+' logical CPUs; '+report.environment.totalRamGiB+' GiB RAM; Node '+report.environment.node+'.','',...report.limitations.map(s=>'- '+s),'','Detailed per-endpoint metrics: back-end/test/load-test-results.json. The temporary database and API are stopped after completion.');
    await fs.writeFile(path.join(__dirname,'..','..','LOAD_TEST_RESULTS.md'),lines.join('\n')+'\n');
    console.log('INTEGRITY '+JSON.stringify(integrity));
  } finally {
    if(server) {server.closeIdleConnections();await new Promise(resolve=>server.close(resolve));}
    await mongoose.disconnect();if(mongo)await mongo.stop();
    console.log('CLEANUP: isolated API and temporary MongoDB stopped.');
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
