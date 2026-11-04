'use strict';
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite'),{promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
function createAuth({dataDir=process.env.OMA_DATA_DIR||path.join(__dirname,'data'),publicSetup=false}={}){
 fs.mkdirSync(dataDir,{recursive:true});
 const db=new DatabaseSync(path.join(dataDir,'accounts.sqlite'));
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL,legacy INTEGER NOT NULL DEFAULT 0,disabled INTEGER NOT NULL DEFAULT 0,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);`);
 const publicUser=u=>u?({id:u.id,username:u.username,name:u.name,role:u.role,legacy:!!u.legacy,disabled:!!u.disabled}):null;
 const count=()=>db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
 const setupCodeFile=path.join(dataDir,'setup-code');
 const setupCodePattern=/^[a-f0-9]{48}$/;
 let setupCode='';
 if(publicSetup&&!count()){
  try{setupCode=fs.readFileSync(setupCodeFile,'utf8').trim();}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(!setupCodePattern.test(setupCode)){
   setupCode=crypto.randomBytes(24).toString('hex');
   fs.writeFileSync(setupCodeFile,setupCode+'\n',{mode:0o600,flush:true});
  }
 }
 const digest=t=>crypto.createHash('sha256').update(t).digest('hex');
 const failures=new Map();let hashing=0;
 async function hash(password,salt=crypto.randomBytes(16).toString('hex')){
  if(typeof password!=='string'||password.length<10||password.length>128)throw Object.assign(Error('Use a password between 10 and 128 characters.'),{status:400});
  if(hashing>=2)throw Object.assign(Error('Please try again in a moment.'),{status:429});
  hashing++;try{return salt+':'+(await scrypt(password,salt,64,{N:32768,r:8,p:3,maxmem:64*1024*1024})).toString('hex')}finally{hashing--}
 }
 async function verify(password,encoded){
  if(typeof password!=='string'||password.length<10||password.length>128)return false;
  const value=await hash(password,encoded.split(':')[0]);return crypto.timingSafeEqual(Buffer.from(value),Buffer.from(encoded));
 }
 function current(req){const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('oma_session='))?.slice(12);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>? AND disabled=0').get(digest(token),Date.now())||null;
 }
 function cookie(res,token,age,secure){res.setHeader('Set-Cookie',`oma_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`)}
 function session(res,id,secure){const token=crypto.randomBytes(32).toString('hex');db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),id,Date.now()+7*86400000);cookie(res,token,7*86400,secure)}
 async function input(req){let b='';for await(const c of req){b+=c;if(b.length>8000)throw Object.assign(Error('Request too large.'),{status:413})}try{return JSON.parse(b||'{}')}catch{throw Error('Invalid request.')}}
 function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))}
 async function add(p,legacy=false){const username=String(p.username||'').trim().toLowerCase(),name=String(p.name||'').trim();if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))throw Error('Use a username of 3–32 letters, numbers, dots, underscores or hyphens.');if(!name||name.length>80)throw Error('Enter a display name of up to 80 characters.');if(count()>=20)throw Error('This personal installation supports up to 20 accounts.');if(db.prepare('SELECT id FROM users WHERE username=?').get(username))throw Error('That username is already in use.');const password=await hash(p.password),id=crypto.randomUUID();if(legacy&&count())throw Error('The administrator account has already been created.');db.prepare('INSERT INTO users(id,username,name,password,role,legacy,created) VALUES(?,?,?,?,?,?,?)').run(id,username,name,password,legacy?'admin':'user',legacy?1:0,Date.now());return db.prepare('SELECT * FROM users WHERE id=?').get(id)}
 async function handle(req,res,pathname,{secure=false}={}){if(!pathname.startsWith('/api/auth/'))return false;
  try{
   const user=current(req);
   if(pathname==='/api/auth/session'&&req.method==='GET'){
    const setupRequired=count()===0;
    send(res,200,{setupRequired,setupCodeRequired:setupRequired&&secure,user:publicUser(user)});return true;
   }
   if(pathname==='/api/auth/setup'&&req.method==='POST'){
    if(count())throw Object.assign(Error('Sign in with an existing account.'),{status:403});
    const p=await input(req);
    if(secure){
     const code=typeof p.setupCode==='string'?p.setupCode.trim():'';
     if(!setupCodePattern.test(code)||!setupCode||!crypto.timingSafeEqual(Buffer.from(code),Buffer.from(setupCode))){
      throw Object.assign(Error('Enter the setup code from your Docker server.'),{status:403});
     }
    }
    const u=await add(p,true);
    setupCode='';
    if(publicSetup){
     try{fs.rmSync(setupCodeFile,{force:true});}
     catch(error){console.warn('Could not remove the expired setup code:',error.code);}
    }
    session(res,u.id,secure);send(res,201,{user:publicUser(u)});return true;
   }
   if(pathname==='/api/auth/login'&&req.method==='POST'){
    const p=await input(req),username=String(p.username||'').trim().toLowerCase(),key=req.socket.remoteAddress+'|'+username,now=Date.now(),attempt=failures.get(key);
    if(attempt&&attempt.until>now&&attempt.n>=5)throw Object.assign(Error('Too many attempts. Try again in 15 minutes.'),{status:429});
    if(failures.size>2000)failures.clear();failures.set(key,{n:(attempt?.until>now?attempt.n:0)+1,until:now+900000});
    const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);
    const dummy='00000000000000000000000000000000:'+ '0'.repeat(128);
    const ok=await verify(p.password,u?.password||dummy);
    if(!u||u.disabled||!ok)throw Object.assign(Error('Username or password is incorrect.'),{status:401});failures.delete(key);session(res,u.id,secure);send(res,200,{user:publicUser(u)});return true
   }
   if(!user)throw Object.assign(Error('Sign in to O/L.'),{status:401});
   if(pathname==='/api/auth/logout'&&req.method==='POST'){const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('oma_session='))?.slice(12);if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));cookie(res,'',0,secure);send(res,200,{ok:true});return true}
   if(pathname==='/api/auth/password'&&req.method==='POST'){const p=await input(req);if(!await verify(p.currentPassword,user.password))throw Error('The current password is incorrect.');const value=await hash(p.password);db.prepare('UPDATE users SET password=? WHERE id=?').run(value,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);session(res,user.id,secure);send(res,200,{ok:true});return true}
   if(user.role!=='admin')throw Object.assign(Error('Only the administrator can manage users.'),{status:403});
   if(pathname==='/api/auth/users'&&req.method==='GET'){send(res,200,{users:db.prepare('SELECT * FROM users ORDER BY created').all().map(publicUser)});return true}
   if(pathname==='/api/auth/users'&&req.method==='POST'){send(res,201,{user:publicUser(await add(await input(req)))});return true}
   if(pathname==='/api/auth/users/update'&&req.method==='POST'){
    const p=await input(req),target=db.prepare('SELECT * FROM users WHERE id=?').get(String(p.id));if(!target)throw Error('User not found.');if(target.id===user.id||target.role==='admin')throw Error('Use your own account settings to change your password.');
    if(typeof p.disabled==='boolean')db.prepare('UPDATE users SET disabled=? WHERE id=?').run(p.disabled?1:0,target.id);
    if(p.password!==undefined)db.prepare('UPDATE users SET password=? WHERE id=?').run(await hash(p.password),target.id);
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);send(res,200,{ok:true});return true
   }
   send(res,404,{error:'Unknown account action.'});return true;
  }catch(e){send(res,e.status||400,{error:e.message});return true}
 }
 const workspaceUsers=()=>db.prepare('SELECT id,legacy FROM users').all();
 return {handle,current,publicUser,workspaceUsers,close:()=>db.close()};
}
module.exports={createAuth};
