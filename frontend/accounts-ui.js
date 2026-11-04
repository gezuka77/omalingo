let authUser=null,authReady=false;
const accountStorage={
 getItem(key){const value=localStorage.getItem('oma-user-'+authUser?.id+':'+activeStudyLanguage+':'+key);return value===null&&activeStudyLanguage==='fi'?(localStorage.getItem('oma-user-'+authUser?.id+':'+key)??(authUser?.legacy?localStorage.getItem(key):null)):value;},
 setItem(key,value){if(authUser)localStorage.setItem('oma-user-'+authUser.id+':'+activeStudyLanguage+':'+key,value);},
 removeItem(key){if(authUser){localStorage.removeItem('oma-user-'+authUser.id+':'+activeStudyLanguage+':'+key);if(activeStudyLanguage==='fi'){localStorage.removeItem('oma-user-'+authUser.id+':'+key);if(authUser.legacy)localStorage.removeItem(key)};}}
};
function removeLegacyBrowserChat(){
 const copies=['oma-reader-v1','oma-reader-v2','oma-pending-v2','oma-browser-recovery'];
 const prefix='oma-user-'+authUser.id+':';
 for(let index=0;index<localStorage.length;index++){
  const key=localStorage.key(index);
  const name=key?.startsWith(prefix)?key.split(':').at(-1):authUser.legacy?key:null;
  if(!copies.includes(name))continue;
  try{
   const value=JSON.parse(localStorage.getItem(key));
   const state=name==='oma-pending-v2'?value?.state:value;
   const library=C.withoutChat(state);
   if(library!==state)localStorage.setItem(key,JSON.stringify(name==='oma-pending-v2'?{...value,state:library}:library));
  }catch{}
 }
}
async function authRequest(path,body){const r=await fetch(base+'/api/auth/'+path,{credentials:'include',method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const value=await r.json();if(!r.ok)throw Error(value.error||'The account service could not respond.');return value;}
function omaServiceCandidates(){
 if(location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)){
  return ['',...['3219','3220','3221'].map(port=>'http://'+location.hostname+':'+port)];
 }
 return [''];
}
async function startAuthenticatedOma(){
 let found=false;for(const candidate of omaServiceCandidates())try{const r=await fetch(candidate+'/api/health',{credentials:'include',signal:AbortSignal.timeout(1800)}),h=await r.json();if(r.ok&&h.appVersion===4&&h.resourceCatalogVersion>=2&&h.authentication){base=candidate;found=true;break;}}catch{}
 if(!found){
  const message=location.protocol==='https:'?'Check the Oma Lingo server, then try again.':'Start O/L with Open-Oma.cmd, then refresh this page to sign in.';
  document.body.innerHTML='<main class="auth-screen"><section class="auth-card"><h1>Oma Lingo could not connect</h1><p>'+message+'</p><button onclick="location.reload()">Try again</button></section></main>';return;
 }
 const result=await authRequest('session');
 if(!result.user){showSignIn(result.setupRequired,result.setupCodeRequired);return;}
 authUser=result.user;removeLegacyBrowserChat();if(!await prepareLearning())return;authReady=true;await init();startImportMonitor();const accountButton=document.createElement('button');accountButton.id='current-account';accountButton.title=authUser.name+' · Account';accountButton.setAttribute('aria-label','Account: '+authUser.name);accountButton.innerHTML='<svg width=20 height=20 viewBox="0 0 24 24" fill=none stroke=currentColor stroke-width=1.7 aria-hidden=true><circle cx=12 cy=8 r=4></circle><path d="M4 21v-2a8 8 0 0 1 16 0v2"></path></svg><span>'+E(authUser.name)+'</span>';accountButton.onclick=()=>openSettings('account');$('header>.row')?.append(accountButton);syncAdaptiveUI();adaptiveObserver.observe($('#main'),{childList:true,subtree:true});
}
function showSignIn(setup=false,setupCodeRequired=false){
 const setupCodeField=setupCodeRequired?`<label>Docker setup code<input name="setupCode" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" required></label><details><summary>Where do I find the setup code?</summary><p>Run this in your Oma Lingo Compose folder on the Docker host.</p><code>docker compose exec -T omalingo cat /var/lib/omalingo/setup-code</code></details>`:'';
 document.body.className='auth-page';document.body.innerHTML=`<main class="auth-screen"><section class="auth-card"><div class="auth-brand">${omaBrandMark}<span>${OMA_BRAND_NAME}</span></div><h1>${setup?'Create your administrator account':'Welcome back'}</h1><p>${setup?'Choose your administrator username and password. You can add other users after signing in.':'Sign in to your own learning library.'}</p><form id="auth-form">${setupCodeField}${setup?'<label>Your name<input name="name" autocomplete="name" maxlength="80" required></label>':''}<label>Username<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="32" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}" required></label><label>Password<input name="password" type="password" autocomplete="${setup?'new-password':'current-password'}" minlength="10" maxlength="128" required></label>${setup?'<label>Confirm password<input name="confirm" type="password" autocomplete="new-password" required></label><small>Use at least 10 characters. Keep this administrator password somewhere safe.</small>':''}<p id="auth-error" role="alert"></p><button class="primary" type="submit">${setup?'Create account':'Sign in'}</button></form>${setup?'':'<small>Accounts are created by this O/L installation’s administrator. Ask them if you need an account or a password reset.</small>'}</section></main>`;
 $('#auth-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),button=e.currentTarget.querySelector('button');$('#auth-error').textContent='';button.disabled=true;try{if(setup&&f.get('password')!==f.get('confirm'))throw Error('The passwords do not match.');await authRequest(setup?'setup':'login',Object.fromEntries(f));localStorage.setItem('oma-auth-change',String(Date.now()));location.reload();}catch(error){$('#auth-error').textContent=error.message;button.disabled=false;}};
}
async function signOutOma(){
 try{await flush();}catch(error){toast('Could not save your latest changes. '+error.message);return;}
 await authRequest('logout',{});localStorage.setItem('oma-auth-change',String(Date.now()));connected=false;clearTimeout(saveTimer);pauseMedia();pronunciation?.pause();location.reload();
}
async function accountSettings(){
 settingsShell();const host=$('#settings-content');host.innerHTML=`<section class="settings-card"><h2>${E(authUser.name)}</h2><p>${E(authUser.username)} · ${authUser.role==='admin'?'Administrator':'User'}</p><button id="account-sign-out">Sign out</button></section><section class="settings-card"><h2>Change password</h2><form id="account-password-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>New password<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><label>Confirm new password<input name="confirm" type="password" autocomplete="new-password" required></label><button class="primary">Change password</button><p role="status" id="account-password-status"></p></form></section>${authUser.role==='admin'?'<section class="settings-card"><h2>Users</h2><p>Each user has a separate library, progress and API connections.</p><div id="account-user-list">Loading users…</div></section><section class="settings-card"><h2>Add a user</h2><form id="account-create-form"><label>Display name<input name="name" autocomplete="off" maxlength="80" required></label><label>Username<input name="username" autocomplete="off" autocapitalize="none" minlength="3" maxlength="32" required></label><label>Initial password<input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><button class="primary">Create user</button><p id="account-create-status" role="status"></p></form></section>':''}`;
 bind('account-sign-out',signOutOma);
 const submit=(id,action,status)=>{$('#'+id).onsubmit=async e=>{e.preventDefault();const button=e.currentTarget.querySelector('button'),values=Object.fromEntries(new FormData(e.currentTarget));button.disabled=true;try{if(values.confirm!==undefined&&values.confirm!==values.password)throw Error('The passwords do not match.');await authRequest(action,values);e.target.reset();$('#'+status).textContent=action==='users'?'User created. They can now sign in.':'Password changed. Other sessions have been signed out.';if(action==='users')await refreshUsers();}catch(error){$('#'+status).textContent=error.message;}finally{button.disabled=false;}}};
 submit('account-password-form','password','account-password-status');
 if(authUser.role!=='admin')return;
 submit('account-create-form','users','account-create-status');
 async function refreshUsers(){const result=await authRequest('users');$('#account-user-list').innerHTML=result.users.map(u=>`<div class="account-user"><div><strong>${E(u.name)}</strong><small>${E(u.username)} · ${u.role==='admin'?'Administrator':u.disabled?'Disabled':'Active'}</small></div>${u.role==='admin'?'':`<button data-toggle-user="${E(u.id)}" data-disabled="${!u.disabled}">${u.disabled?'Enable':'Disable'}</button><button data-reset-user="${E(u.id)}">Reset password</button>`}</div>`).join('');
  $$('[data-toggle-user]').forEach(b=>b.onclick=act(async()=>{await authRequest('users/update',{id:b.dataset.toggleUser,disabled:b.dataset.disabled==='true'});await refreshUsers();}));
  $$('[data-reset-user]').forEach(b=>b.onclick=()=>modal('Reset password',`<form id="reset-user-form"><label>New password<input type="password" name="password" autocomplete="new-password" minlength="10" maxlength="128" required></label><p>This signs the user out on all devices.</p><button class="primary">Set password</button><p id="reset-user-status" role="status"></p></form>`,()=>{$('#reset-user-form').onsubmit=async e=>{e.preventDefault();try{await authRequest('users/update',{id:b.dataset.resetUser,password:new FormData(e.target).get('password')});$('#dialog').close();toast('Password reset.');}catch(error){$('#reset-user-status').textContent=error.message;}};}));
 }
 try{await refreshUsers();}catch(error){$('#account-user-list').textContent=error.message;}
}

window.addEventListener('storage',event=>{if(event.key==='oma-auth-change'&&authReady){connected=false;clearTimeout(saveTimer);pauseMedia();location.reload();}});
