const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const project=process.argv[2],data=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'cup-auth-test-')),origin='http://127.0.0.1:4174';
const child=spawn(process.execPath,[path.join(project,'server.cjs')],{env:{...process.env,PORT:'4174',CUP_DATA_DIR:data},stdio:['ignore','pipe','pipe']});
let cookie='';async function call(route,body,auth=true,source=origin){const response=await fetch(origin+route,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:source}:{}),...(auth&&cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});let json;try{json=await response.json()}catch{}return {status:response.status,json,headers:response.headers}}
(async()=>{await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('Server quit')))});
assert.equal((await call('/api/state')).json.admin,false);assert.equal((await call('/api/state')).json.viewer,null);
for(const action of ['seed','remove','generate','regenerate','reset','start','result','game','note','modes','friend'])assert.equal((await call('/api/action',{action,revision:0},false)).status,401);
assert.equal((await call('/data/auth.json')).status,404);assert.equal((await call('/data/admin-access.txt')).status,404);
assert.equal((await call('/api/login',{password:'wrong'},false)).status,401);
const access=fs.readFileSync(path.join(data,'admin-access.txt'),'utf8'),password=access.match(/1\) Login: organizer1\nPassword: (\S+)|1\) Логин: organizer1\nПароль: (\S+)/)?.slice(1).find(Boolean),password2=access.match(/2\) Login: organizer2\nPassword: (\S+)|2\) Логин: organizer2\nПароль: (\S+)/)?.slice(1).find(Boolean);assert(password);assert(password2);
let login=await call('/api/login',{login:'organizer1',password},false);assert.equal(login.status,200);assert.equal(login.json.viewer.role,'organizer');assert(login.headers.get('set-cookie').includes('HttpOnly'));assert(login.headers.get('set-cookie').includes('SameSite=Strict'));cookie=login.headers.get('set-cookie').split(';')[0];
assert.equal((await call('/api/action',{action:'reset',revision:0},true,'https://untrusted.example')).status,403);
let current=(await call('/api/state')).json.state;
assert.equal((await call('/api/register',{name:'Bad',nick:'Bad',tag:'#BAD',friendLink:'javascript:alert(1)'},false)).status,400);
assert.equal((await call('/api/register',{name:'Bad',nick:'Bad',tag:'#BAD',friendLink:'https://link.clashroyale.com.evil.example/'},false)).status,400);
assert.equal((await call('/api/register',{name:'Bad',nick:'Bad',tag:'#BAD'},false)).status,400);
for(let i=0;i<13;i++){const r=await call('/api/register',{login:`player${i}`,password:'participant-pass-123',name:`Name ${i}`,nick:`Nick ${i}`,tag:`#TEST${i}`,friendCode:`FRIEND${i}`},false);assert.equal(r.status,200);assert.equal(r.json.viewer.role,'participant');current=r.json.state}
const adminCookie=cookie,participantLogin=await call('/api/login',{login:'player0',password:'participant-pass-123'},false);cookie=participantLogin.headers.get('set-cookie').split(';')[0];assert.equal((await call('/api/action',{action:'reset',revision:current.revision})).status,401);let profile=await call('/api/profile',{name:'Updated Name',nick:'Updated Nick',tag:'#TEST0',friendCode:'NEWCODE'});assert.equal(profile.status,200);assert.equal(profile.json.state.players[0].nick,'Updated Nick');current=profile.json.state;cookie=adminCookie;
assert.equal((await call('/api/state',undefined,false)).json.state.players[0].friendCode,'NEWCODE');
assert.equal((await call('/api/action',{action:'modes',pool:[],revision:current.revision})).status,400);
current=(await call('/api/action',{action:'modes',pool:['triple'],revision:current.revision})).json.state;
assert.equal((await call('/api/register',{name:'Duplicate',nick:'Dup',tag:'#TEST0'},false)).status,400);
assert.equal((await call('/api/action',{action:'generate',revision:0})).status,409);
let result=await call('/api/action',{action:'generate',revision:current.revision});assert.equal(result.status,200);current=result.json.state;
assert.equal((await call('/api/register',{name:'Late',nick:'Late',tag:'#LATE'},false)).status,400);
let count=0;for(let r=0;r<current.rounds.length;r++){
for(let i=0;i<current.rounds[r].length;i++){if(current.rounds[r][i].status==='bye')continue;assert.equal((await call('/api/action',{action:'game',r,i,winner:0,revision:current.revision})).status,400);const res=await call('/api/action',{action:'start',r,i,revision:current.revision});assert.equal(res.status,200);current=res.json.state;assert.equal(current.rounds[r][i].mode,'triple');assert.equal((await call('/api/action',{action:'start',r,i,revision:current.revision})).status,400);assert.equal((await call('/api/action',{action:'game',r,i,winner:0,revision:current.revision})).status,400)}
await new Promise(resolve=>setTimeout(resolve,4100));
for(let i=0;i<current.rounds[r].length;i++){if(current.rounds[r][i].status==='bye')continue;const target=r===current.rounds.length-1?3:2;assert.equal((await call('/api/action',{action:'result',r,i,a:target,b:target,revision:current.revision})).status,400);for(let j=0;j<target;j++){const res=await call('/api/action',{action:'game',r,i,winner:0,revision:current.revision});assert.equal(res.status,200);current=res.json.state}assert.equal(current.rounds[r][i].status,'done');assert.equal(current.rounds[r][i].games.length,target);const res=await call('/api/action',{action:'note',r,i,note:'Результат подтверждён',revision:current.revision});assert.equal(res.status,200);current=res.json.state;count++}}
assert.equal(count,12);assert(current.rounds.at(-1)[0].winner);assert.equal((await call('/api/state',undefined,false)).json.state.rounds.at(-1)[0].note,'Результат подтверждён');
assert.equal((await call('/api/state',undefined,false)).json.state.log.length,0);
await call('/api/logout',{});assert.equal((await call('/api/action',{action:'reset',revision:current.revision})).status,401);
login=await call('/api/login',{login:'organizer1',password},false);cookie=login.headers.get('set-cookie').split(';')[0];const next='test-only-long-password-123';assert.equal((await call('/api/password',{current:password,password:next})).status,200);assert.equal((await call('/api/state')).json.admin,false);assert.equal((await call('/api/login',{login:'organizer1',password},false)).status,401);assert.equal((await call('/api/login',{login:'organizer1',password:next},false)).status,200);assert.equal((await call('/api/login',{login:'organizer2',password:password2},false)).status,200);
for(let i=0;i<8;i++)assert.equal((await call('/api/login',{password:'bad'},false)).status,401);assert.equal((await call('/api/login',{password:'bad'},false)).status,429);
const saved=JSON.parse(fs.readFileSync(path.join(data,'tournament.json'),'utf8'));assert.equal(saved.rounds.at(-1)[0].winner,current.rounds.at(-1)[0].winner);
console.log('PASS: friendship validation; public match data; protected actions; mode pool; fixed roulette; reveal delay; BO3/BO5 per-game progression; comments; 13-player champion; authentication regression.');
})().catch(err=>{console.error(err);process.exitCode=1}).finally(()=>child.kill());
