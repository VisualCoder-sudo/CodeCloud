import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential, sendEmailVerification, reload } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, writeBatch, setDoc, getDoc, onSnapshot, serverTimestamp, increment, arrayUnion, arrayRemove, orderBy, limit, startAt, endAt } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const app=initializeApp({apiKey:"AIzaSyCQLI6-YVviG3cS0vbmud4oco8oGV01ySg",authDomain:"codecloud-270fe.firebaseapp.com",projectId:"codecloud-270fe",storageBucket:"codecloud-270fe.firebasestorage.app",messagingSenderId:"155488205416",appId:"1:155488205416:web:a029e34bb4a3a1a63bd9dd",measurementId:"G-L7FDMHKVW2"});
const auth=getAuth(app), db=getFirestore(app);

let currentUser=null, allRepos=[], showAllRepos=false, activeRepoId=null;
let unsubFiles=null, unsubRepos=null, isFirstLoad=true;
let repoModalMode='create', repoModalTargetId=null;
const REPO_LIMIT=15;

const CLOUDINARY_CLOUD='dshqexmz3', CLOUDINARY_PRESET='codecloud_avatars';
async function uploadToCloudinary(file){
    const fd=new FormData();fd.append('file',file);fd.append('upload_preset',CLOUDINARY_PRESET);
    if(currentUser) fd.append('public_id','avatar_'+currentUser.uid);
    fd.append('overwrite','true');fd.append('invalidate','true');
    const res=await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,{method:'POST',body:fd});
    const data=await res.json();
    if(data.error) throw new Error('Cloudinary: '+data.error.message);
    if(!data.secure_url) throw new Error('No URL returned — check Cloudinary preset is Unsigned');
    return data.secure_url+'?v='+Date.now();
}
function setAvatarPhoto(url){
    if(!url)return;
    const nav=document.getElementById('nav-avatar');
    if(nav){nav.innerHTML='';const img=document.createElement('img');img.src=url;img.alt='';nav.appendChild(img);}
}

function requireVerified(action='do this'){
    if(currentUser && currentUser.emailVerified) return true;
    toast(`Verify your email first to ${action}.`,'warn');
    document.getElementById('verify-banner').classList.add('show');
    return false;
}

onAuthStateChanged(auth,user=>{
    if(!user){window.location.href='auth.html';return;}
    currentUser=user;
    document.getElementById('auth-gate').style.display='none';
    document.getElementById('app-shell').style.display='flex';
    document.getElementById('nav-avatar').textContent=(user.displayName||user.email||'U').charAt(0).toUpperCase();
    document.getElementById('dd-name').textContent=user.displayName||'User';
    if(!user.emailVerified){
        document.getElementById('verify-banner').classList.add('show');
        const nr=document.getElementById('btn-new-repo');
        if(nr){nr.title='Verify your email to create repositories';nr.style.opacity='0.5';nr.style.cursor='not-allowed';}
    }
    getDoc(doc(db,'users',user.uid)).then(async snap=>{
        if(!snap.exists()){
            const handle=(user.displayName||user.email||'user')
                .toLowerCase().replace(/\s+/g,'.').replace(/[^a-z0-9._-]/g,'').slice(0,20);
            await setDoc(doc(db,'users',user.uid),{
                username:user.displayName||user.email||'User',
                handle,
                email:user.email||'',
                photoURL:user.photoURL||'',
                createdAt:serverTimestamp()
            },{merge:true});
            if(user.photoURL) setAvatarPhoto(user.photoURL);
        } else {
            if(snap.data().photoURL) setAvatarPhoto(snap.data().photoURL);
        }
    });
    startRepoListener();goHome();
});

window.doSignOut=async()=>{closeDD();await signOut(auth);window.location.href='auth.html';};
window.resendVerification=async()=>{
    const st=document.getElementById('verify-banner-status');
    try{
        await reload(currentUser);
        if(currentUser.emailVerified){
            document.getElementById('verify-banner').classList.remove('show');
            const nr=document.getElementById('btn-new-repo');
            if(nr){nr.title='';nr.style.opacity='';nr.style.cursor='';}
            toast('Email verified! All features unlocked.','success');
            return;
        }
        await sendEmailVerification(currentUser);
        st.textContent='✓ Email sent!';setTimeout(()=>st.textContent='',5000);
    }catch(e){st.textContent=e.message;}
};

function toggleDD(){document.getElementById('dd-menu').classList.toggle('open');}
function closeDD(){document.getElementById('dd-menu').classList.remove('open');}
window.toggleDD=toggleDD;window.closeDD=closeDD;
document.addEventListener('click',e=>{
    if(!e.target.closest('.dropdown-wrap'))closeDD();
    if(!e.target.closest('.nav-search-wrap'))closeSearchResults();
});

document.getElementById('open-pass-modal').addEventListener('click',()=>{
    openPasswordChangeModal();
});

function toast(msg,type='info'){
    const colors={info:'var(--accent)',success:'var(--success)',danger:'var(--danger)',warn:'var(--warn)'};
    const icons={info:'◈',success:'✓',danger:'✕',warn:'⚠'};
    const t=document.createElement('div');
    t.style.cssText=`position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--bg-raised);border:1px solid var(--border-mid);border-left:3px solid ${colors[type]};border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:12px;color:var(--text-primary);box-shadow:0 8px 32px rgba(0,0,0,0.5);animation:toastIn 0.2s ease;pointer-events:none;`;
    const ic=document.createElement('span');ic.style.color=colors[type];ic.textContent=icons[type];
    const tx=document.createElement('span');tx.textContent=msg;
    t.append(ic,tx);document.body.appendChild(t);
    setTimeout(()=>{t.style.animation='toastOut 0.2s ease forwards';setTimeout(()=>t.remove(),220);},3000);
}

function pulseLive(){
    const b=document.getElementById('live-badge');if(!b)return;
    b.style.opacity='1';b.style.boxShadow='0 0 0 2px rgba(16,185,129,0.3)';
    clearTimeout(b._t);b._t=setTimeout(()=>{b.style.opacity='0.4';b.style.boxShadow='';},900);
}

const getExt=name=>{const p=(name||'').split('.');return p.length>1?p.pop().toLowerCase():'';};
function extClass(ext){const m={js:'ext-js',ts:'ext-js',jsx:'ext-js',tsx:'ext-js',py:'ext-py',html:'ext-html',css:'ext-css',scss:'ext-css',json:'ext-json',md:'ext-md',txt:'ext-md'};return m[ext]||'ext-other';}
function updateLineNumbers(ta,c){const l=(ta.value||' ').split('\n').length;c.textContent=Array.from({length:l},(_,i)=>i+1).join('\n');}
function isOwnerOf(repo){return repo.uid===currentUser.uid||(Array.isArray(repo.owners)&&repo.owners.includes(currentUser.uid));}

let searchTimer=null;
const searchInput=document.getElementById('nav-search-input');
const searchResultsEl=document.getElementById('search-results');
function closeSearchResults(){searchResultsEl.classList.remove('open');}

searchInput.addEventListener('input',()=>{
    clearTimeout(searchTimer);
    const val=searchInput.value.trim();
    if(!val){closeSearchResults();return;}
    searchTimer=setTimeout(()=>doSearch(val),300);
});
searchInput.addEventListener('focus',()=>{if(searchInput.value.trim())doSearch(searchInput.value.trim());});

async function doSearch(q){
    searchResultsEl.classList.add('open');
    searchResultsEl.innerHTML='<div class="search-empty">Searching…</div>';
    const ql=q.toLowerCase();
    const [repoSnap,userSnap,userSnap2]=await Promise.all([
        getDocs(query(collection(db,'repositories'),where('isPublic','==',true),orderBy('name'),startAt(q),endAt(q+'\uf8ff'),limit(5))),
        getDocs(query(collection(db,'users'),orderBy('handle'),startAt(ql),endAt(ql+'\uf8ff'),limit(5))),
        getDocs(query(collection(db,'users'),orderBy('username'),startAt(q),endAt(q+'\uf8ff'),limit(5)))
    ]);
    const repos=repoSnap.docs.map(d=>({id:d.id,...d.data()}));
    const usersMap={};[...userSnap.docs,...userSnap2.docs].forEach(d=>{usersMap[d.id]={id:d.id,...d.data()};});
    const users=Object.values(usersMap);
    searchResultsEl.innerHTML='';
    if(!repos.length&&!users.length){searchResultsEl.innerHTML='<div class="search-empty">No results found</div>';return;}
    if(users.length){
        const sec=document.createElement('div');sec.className='search-result-section';
        const lbl=document.createElement('div');lbl.className='search-result-label';lbl.textContent='Users';sec.appendChild(lbl);
        users.forEach(u=>{
            const item=document.createElement('div');item.className='search-result-item';
            const icon=document.createElement('div');icon.className='search-result-icon';
            if(u.photoURL){const img=document.createElement('img');img.src=u.photoURL;icon.appendChild(img);}
            else icon.textContent=(u.username||'?').charAt(0).toUpperCase();
            const info=document.createElement('div');
            const n=document.createElement('div');n.className='search-result-name';n.textContent=u.username||'Unknown';
            const m=document.createElement('div');m.className='search-result-meta';m.textContent=u.handle?'@'+u.handle:'';
            info.append(n,m);item.append(icon,info);
            item.onclick=()=>{closeSearchResults();searchInput.value='';openPublicProfile(u.id);};
            sec.appendChild(item);
        });
        searchResultsEl.appendChild(sec);
    }
    if(repos.length){
        if(users.length){const d=document.createElement('div');d.className='search-divider';searchResultsEl.appendChild(d);}
        const sec=document.createElement('div');sec.className='search-result-section';
        const lbl=document.createElement('div');lbl.className='search-result-label';lbl.textContent='Public Repositories';sec.appendChild(lbl);
        repos.forEach(r=>{
            const item=document.createElement('div');item.className='search-result-item';
            const icon=document.createElement('div');icon.className='search-result-icon';
            const ri=document.createElement('img');ri.src='Repo.png';ri.style.height='14px';ri.style.width='auto';ri.onerror=()=>{icon.textContent='📁';};icon.appendChild(ri);
            const info=document.createElement('div');
            const n=document.createElement('div');n.className='search-result-name';n.textContent=r.name;
            const m=document.createElement('div');m.className='search-result-meta';m.textContent=(r.description||'')+(r.starCount?' · ★'+r.starCount:'');
            info.append(n,m);item.append(icon,info);
            item.onclick=()=>{closeSearchResults();searchInput.value='';openRepoById(r.id);};
            sec.appendChild(item);
        });
        searchResultsEl.appendChild(sec);
    }
}

async function openRepoById(id){
    const snap=await getDoc(doc(db,'repositories',id));
    if(!snap.exists()){toast('Repo not found','danger');return;}
    const r={id:snap.id,...snap.data()};
    if(isOwnerOf(r))openRepo(r.id,r.name);
    else if(r.isPublic)openPublicRepoView(r.id,r.name,r);
    else toast('This repository is private','warn');
}

async function isStarred(repoId){
    const snap=await getDoc(doc(db,'stars',currentUser.uid+'_'+repoId));
    return snap.exists();
}
async function toggleStar(repoId,btn,countEl){
    if(!requireVerified('star repositories')) return;
    const starId=currentUser.uid+'_'+repoId;
    const starred=await isStarred(repoId);
    if(starred){
        await deleteDoc(doc(db,'stars',starId));
        await updateDoc(doc(db,'repositories',repoId),{starCount:increment(-1)});
        btn.classList.remove('starred');btn.querySelector('.star-icon').textContent='☆';
        countEl.textContent=Math.max(0,(parseInt(countEl.textContent)||0)-1);
        toast('Unstarred','info');
    }else{
        await setDoc(doc(db,'stars',starId),{uid:currentUser.uid,repoId,starredAt:serverTimestamp()});
        await updateDoc(doc(db,'repositories',repoId),{starCount:increment(1)});
        btn.classList.add('starred');btn.querySelector('.star-icon').textContent='★';
        countEl.textContent=(parseInt(countEl.textContent)||0)+1;
        toast('Starred!','success');
    }
}

const LANG_COLORS={js:'#f59e0b',jsx:'#61dafb',ts:'#3178c6',tsx:'#3178c6',html:'#ef4444',css:'#a78bfa',scss:'#cf649a',py:'#3b82f6',java:'#ed8b00',cpp:'#00599c',c:'#a8b9cc',cs:'#239120',go:'#00add8',rs:'#dea584',php:'#777bb4',rb:'#cc342d',swift:'#f05138',json:'#10b981',yaml:'#cb171e',yml:'#cb171e',sql:'#e38c00',md:'#6b7280',txt:'#94a3b8',sh:'#4ead28'};
function updateCodeShowcase(fileDocs){
    const container=document.getElementById('repo-code-showcase');if(!container)return;
    if(!fileDocs.length){container.innerHTML='';return;}
    const stats={};let total=0;
    fileDocs.forEach(f=>{const d=f.data?f.data():f,ext=getExt(d.fileName)||'other',len=(d.code||'').length;stats[ext]=(stats[ext]||0)+len;total+=len;});
    if(!total){container.innerHTML='';return;}
    const sorted=Object.keys(stats).sort((a,b)=>stats[b]-stats[a]);
    const wrap=document.createElement('div');wrap.className='code-showcase anim-in';
    const bar=document.createElement('div');bar.className='showcase-bar';
    const legend=document.createElement('div');legend.className='showcase-legend';
    sorted.forEach(ext=>{
        const perc=((stats[ext]/total)*100).toFixed(1),color=LANG_COLORS[ext]||'#3d5470';
        const seg=document.createElement('div');seg.className='bar-segment';seg.style.cssText=`width:${perc}%;background:${color};`;seg.title=`${ext.toUpperCase()}: ${perc}%`;bar.appendChild(seg);
        const item=document.createElement('div');item.className='legend-item';
        const dot=document.createElement('span');dot.className='legend-dot';dot.style.background=color;
        const el=document.createElement('span');el.style.color='var(--text-primary)';el.textContent=ext.toUpperCase();
        const pl=document.createElement('span');pl.style.color='var(--text-muted)';pl.textContent=perc+'%';
        item.append(dot,el,pl);legend.appendChild(item);
    });
    wrap.append(bar,legend);container.innerHTML='';container.appendChild(wrap);
}

function goHome(){
    activeRepoId=null;if(unsubFiles){unsubFiles();unsubFiles=null;}
    document.querySelectorAll('.repo-item').forEach(el=>el.classList.remove('active'));
    const mv=document.getElementById('main-view');mv.innerHTML='';
    const wrap=document.createElement('div');wrap.className='anim-in';
    
    const hero=document.createElement('div');hero.className='dash-hero';
    const eyebrow=document.createElement('div');eyebrow.className='dash-eyebrow';eyebrow.textContent='// CodeCloud v2.0';
    const title=document.createElement('div');title.className='dash-title';
    const strong=document.createElement('strong');strong.textContent='Your cloud workspace';
    title.appendChild(strong);title.appendChild(document.createTextNode('\nfor every project.'));
    const sub=document.createElement('div');sub.className='dash-sub';sub.textContent='Create, manage, and edit repositories in the cloud. Upload files, write code, and commit changes — all from your browser.';
    const acts=document.createElement('div');acts.className='dash-actions';
    const b1=document.createElement('button');b1.className='btn-new-repo2';b1.textContent='New Repository';b1.onclick=()=>openRepoModal('create');
    const b2=document.createElement('button');b2.className='btn-ghost';b2.textContent='My Gists';b2.onclick=openGists;
    acts.append(b1,b2);hero.append(eyebrow,title,sub,acts);
    
    const starSec=document.createElement('div');starSec.className='dash-section';
    const stTitle=document.createElement('div');stTitle.className='dash-section-title';stTitle.textContent='Starred Repositories';
    const stGrid=document.createElement('div');stGrid.className='starred-grid';stGrid.id='starred-grid';
    starSec.append(stTitle,stGrid);

    const newsSec=document.createElement('div');newsSec.className='dash-section';
    newsSec.style.marginTop='40px'; 
    const newsTitle=document.createElement('div');newsTitle.className='dash-section-title';newsTitle.textContent='Platform News';
    const newsGrid=document.createElement('div');newsGrid.className='news-grid';newsGrid.id='news-grid';
    newsGrid.style.cssText = 'display:flex; flex-direction:column; gap:16px; margin-top:12px;';
    newsSec.append(newsTitle,newsGrid);

    wrap.append(hero,starSec,newsSec);
    mv.appendChild(wrap);
    
    loadStarredRepos(stGrid);
    loadNews(newsGrid);
}
window.goHome=goHome;

async function loadNews(container) {
    try {
        const q = query(collection(db, 'News'), orderBy('DateCreated', 'desc'), limit(10));
        const snap = await getDocs(q);
        
        if (snap.empty) {
            const emptyState = document.createElement('div');
            emptyState.style.cssText = 'color:var(--text-muted);font-family:var(--mono);font-size:12px;padding:8px 0;';
            emptyState.textContent = 'No news available at the moment.';
            container.appendChild(emptyState);
            return;
        }
        
        snap.forEach(docSnap => {
            const data = docSnap.data();
            
            const article = document.createElement('div');
            article.style.cssText = 'background:var(--bg-surface); border:1px solid var(--border-dim); border-radius:8px; padding:16px; display:flex; flex-direction:column; gap:12px;';
            
            const nameEl = document.createElement('div');
            nameEl.style.cssText = 'font-weight:600; font-size:16px; color:var(--text-primary);';
            nameEl.textContent = data.Name || 'Untitled Update';
            
            const contentEl = document.createElement('div');
            contentEl.style.cssText = 'font-size:14px; color:var(--text-secondary); line-height:1.5;';
            contentEl.innerHTML = data.HTML || '';
            
            const dateEl = document.createElement('div');
            dateEl.style.cssText = 'font-family:var(--mono); font-size:11px; color:var(--text-muted); margin-top:8px; border-top:1px solid var(--border-dim); padding-top:12px;';
            
            let dateStr = 'Unknown Date';
            if (data.DateCreated) {
                const dateObj = data.DateCreated.toDate ? data.DateCreated.toDate() : new Date(data.DateCreated);
                dateStr = dateObj.toLocaleDateString('en-US', { 
                    month: 'long', day: 'numeric', year: 'numeric', 
                    hour: '2-digit', minute: '2-digit' 
                });
            }
            dateEl.textContent = `Posted on ${dateStr}`;
            
            article.append(nameEl, contentEl, dateEl);
            container.appendChild(article);
        });
    } catch (error) {
        console.error("Error loading news:", error);
        const errState = document.createElement('div');
        errState.style.cssText = 'color:var(--danger);font-family:var(--mono);font-size:12px;';
        errState.textContent = 'Failed to load news.';
        container.appendChild(errState);
    }
}

async function loadStarredRepos(grid){
    const snap=await getDocs(query(collection(db,'stars'),where('uid','==',currentUser.uid)));
    if(snap.empty){const e=document.createElement('div');e.style.cssText='color:var(--text-muted);font-family:var(--mono);font-size:11px;padding:8px 0;';e.textContent='No starred repos yet. Find a public repo to star it.';grid.appendChild(e);return;}
    const ids=snap.docs.map(d=>d.data().repoId);
    const results=await Promise.all(ids.slice(0,8).map(id=>getDoc(doc(db,'repositories',id))));
    results.forEach(r=>{
        if(!r.exists())return;
        const data={id:r.id,...r.data()};
        const card=document.createElement('div');card.className='starred-card';
        const name=document.createElement('div');name.className='starred-card-name';
        const star=document.createTextNode('★ ');name.appendChild(star);
        const nt=document.createElement('span');nt.textContent=data.name;name.appendChild(nt);
        const meta=document.createElement('div');meta.className='starred-card-meta';meta.textContent=data.description||'public repository';
        card.append(name,meta);
        card.onclick=()=>isOwnerOf(data)?openRepo(data.id,data.name):openPublicRepoView(data.id,data.name,data);
        grid.appendChild(card);
    });
}

window.openProfile=async()=>{
    if(unsubFiles){unsubFiles();unsubFiles=null;}
    const mv=document.getElementById('main-view');
    mv.innerHTML='<div style="padding:40px;color:var(--text-muted);font-family:var(--mono);font-size:12px;">Loading...</div>';
    const snap=await getDoc(doc(db,'users',currentUser.uid));
    const data=snap.exists()?snap.data():{username:currentUser.displayName||'Developer',handle:''};
    const letter=(data.username||'U').charAt(0).toUpperCase();
    document.getElementById('nav-avatar').textContent=letter;if(data.photoURL)setAvatarPhoto(data.photoURL);
    mv.innerHTML='';
    const layout=document.createElement('div');layout.className='profile-layout anim-in';
    const psidebar=document.createElement('div');psidebar.className='profile-sidebar';
    const avatar=document.createElement('div');avatar.className='profile-avatar';
    if(data.photoURL){const img=document.createElement('img');img.src=data.photoURL;img.alt='';avatar.appendChild(img);}else avatar.textContent=letter;
    const overlay=document.createElement('div');overlay.className='avatar-upload-overlay';
    overlay.innerHTML='<span style="font-size:18px;">📷</span><span>Change photo</span>';
    avatar.appendChild(overlay);
    const photoInput=document.createElement('input');photoInput.type='file';photoInput.accept='image/*';photoInput.hidden=true;avatar.appendChild(photoInput);
    avatar.onclick=()=>photoInput.click();
    photoInput.onchange=async e=>{
        if(!requireVerified('update your photo')){e.target.value='';return;}
        const file=e.target.files[0];if(!file)return;
        if(file.size>5*1024*1024){toast('Image must be under 5 MB','warn');return;}
        avatar.classList.add('avatar-uploading');
        try{
            const url=await uploadToCloudinary(file);
            await setDoc(doc(db,'users',currentUser.uid),{photoURL:url},{merge:true});
            avatar.innerHTML='';const img=document.createElement('img');img.src=url;img.alt='';avatar.appendChild(img);
            const ov2=document.createElement('div');ov2.className='avatar-upload-overlay';ov2.innerHTML='<span style="font-size:18px;">📷</span><span>Change photo</span>';
            avatar.appendChild(ov2);avatar.onclick=()=>photoInput.click();setAvatarPhoto(url);toast('Profile photo updated','success');
        }catch(err){toast(err.message||'Upload failed','danger');console.error(err);}
        finally{avatar.classList.remove('avatar-uploading');}e.target.value='';
    };
    const pname=document.createElement('div');pname.className='profile-name';pname.textContent=data.username||'Developer';
    const rawHandle=(data.handle||'').replace('@','').trim();
    const phandle=document.createElement('a');phandle.className='handle-link';
    phandle.textContent=rawHandle?'@'+rawHandle:'Set a handle in Settings';phandle.style.fontStyle=rawHandle?'normal':'italic';
    phandle.onclick=e=>{e.preventDefault();rawHandle?openPublicProfile(currentUser.uid):openSettings();};
    const editBtn=document.createElement('button');editBtn.className='btn-ghost';editBtn.style.cssText='width:100%;font-size:12px;';editBtn.textContent='Edit Profile';editBtn.onclick=openSettings;
    psidebar.append(avatar,pname,phandle,editBtn);
    const pmain=document.createElement('div');pmain.className='profile-main';
    const stitle=document.createElement('div');stitle.className='section-title';stitle.textContent='Repositories';
    pmain.appendChild(stitle);
    const grid=document.createElement('div');grid.className='pinned-grid';
    if(!allRepos.length){const e=document.createElement('p');e.style.cssText='color:var(--text-muted);font-size:13px;font-family:var(--mono);';e.textContent='No repositories yet.';grid.appendChild(e);}
    else allRepos.slice(0,6).forEach(r=>{
        const card=document.createElement('div');card.className='pinned-card';
        const cn=document.createElement('div');cn.className='pinned-card-name';cn.textContent=r.name;
        const cm=document.createElement('div');cm.className='pinned-card-meta';cm.textContent=(r.isPublic?'🌐 public':'🔒 private')+(r.description?' · '+r.description:'');
        card.append(cn,cm);card.onclick=()=>openRepo(r.id,r.name);grid.appendChild(card);
    });
    pmain.appendChild(grid);layout.append(psidebar,pmain);mv.appendChild(layout);
};

async function openPublicProfile(uid){
    if(unsubFiles){unsubFiles();unsubFiles=null;}
    const mv=document.getElementById('main-view');
    mv.innerHTML='<div style="padding:40px;color:var(--text-muted);font-family:var(--mono);font-size:12px;">Loading...</div>';
    const snap=await getDoc(doc(db,'users',uid));
    if(!snap.exists()){mv.innerHTML='<div style="padding:40px;color:var(--text-muted);font-family:var(--mono);">User not found.</div>';return;}
    const data=snap.data();
    const isOwn=(uid===currentUser.uid);
    const letter=(data.username||'?').charAt(0).toUpperCase();
    const handle=(data.handle||'').replace('@','').trim()||(data.username||'').toLowerCase().replace(/[^a-z0-9._-]/g,'').slice(0,20);
    let repos=[];
    if(isOwn)repos=allRepos;
    else{const rs=await getDocs(query(collection(db,'repositories'),where('uid','==',uid),where('isPublic','==',true)));repos=rs.docs.map(d=>({id:d.id,...d.data()}));}
    const gSnap=await getDocs(query(collection(db,'gists'),where('uid','==',uid)));
    const gists=gSnap.docs.map(d=>({id:d.id,...d.data()}));
    let joinedStr='';
    if(data.createdAt){const d=data.createdAt.toDate?data.createdAt.toDate():new Date(data.createdAt);joinedStr='Joined '+d.toLocaleDateString('en-US',{month:'long',year:'numeric'});}
    mv.innerHTML='';
    const layout=document.createElement('div');layout.className='pub-profile-layout anim-in';
    const back=document.createElement('div');back.className='pub-profile-back';back.textContent='← Back';back.onclick=goHome;layout.appendChild(back);
    const hero=document.createElement('div');hero.className='pub-profile-hero';
    const av=document.createElement('div');av.className='pub-profile-avatar';
    if(data.photoURL){const img=document.createElement('img');img.src=data.photoURL;img.alt='';av.appendChild(img);}else av.textContent=letter;
    const info=document.createElement('div');info.className='pub-profile-info';
    const nameEl=document.createElement('div');nameEl.className='pub-profile-name';nameEl.textContent=data.username||'User';
    const handleEl=document.createElement('div');handleEl.className='pub-profile-handle';handleEl.textContent=handle?'@'+handle:'';
    if(data.bio){const bioEl=document.createElement('div');bioEl.style.cssText='font-size:13px;color:var(--text-secondary);margin:4px 0 8px;';bioEl.textContent=data.bio;info.appendChild(bioEl);}
    const statRow=document.createElement('div');
    statRow.style.cssText='display:flex;gap:8px;margin:8px 0 8px;flex-wrap:wrap;';
    const statDefs=[
        {v:repos.length, l:'repos', id:'prof-stat-repos'},
        {v:'—', l:'files', id:'prof-stat-files'},
        {v:'—', l:'stars', id:'prof-stat-stars'},
    ];
    statDefs.forEach(({v,l,id})=>{
        const pill=document.createElement('div');
        pill.style.cssText='display:inline-flex;align-items:baseline;gap:5px;background:var(--bg-surface);border:1px solid var(--border-dim);border-radius:6px;padding:5px 12px;';
        const val=document.createElement('span');val.id=id;val.textContent=v;
        val.style.cssText='font-family:var(--mono);font-size:16px;font-weight:700;color:var(--text-primary);';
        const lbl=document.createElement('span');lbl.textContent=l;
        lbl.style.cssText='font-family:var(--mono);font-size:10px;color:var(--text-muted);';
        pill.append(val,lbl);statRow.appendChild(pill);
    });
    if(isOwn){
        onSnapshot(query(collection(db,'files'),where('uid','==',uid)),snap=>{
            const el=document.getElementById('prof-stat-files');if(el)el.textContent=snap.size;
        });
        onSnapshot(query(collection(db,'stars'),where('uid','==',currentUser.uid)),snap=>{
            const el=document.getElementById('prof-stat-stars');if(el)el.textContent=snap.size;
        });
    } else {
        getDocs(query(collection(db,'files'),where('uid','==',uid))).then(s=>{
            const el=document.getElementById('prof-stat-files');if(el)el.textContent=s.size;
        });
        getDocs(query(collection(db,'stars'),where('uid','==',uid))).then(s=>{
            const el=document.getElementById('prof-stat-stars');if(el)el.textContent=s.size;
        });
    }
    const joinEl=document.createElement('div');joinEl.className='pub-profile-joined';joinEl.textContent=joinedStr;
    info.append(nameEl,handleEl,statRow,joinEl);
    if(isOwn){const editBtn=document.createElement('button');editBtn.className='btn-ghost';editBtn.style.cssText='font-size:12px;margin-top:10px;';editBtn.textContent='Edit Profile';editBtn.onclick=openSettings;info.appendChild(editBtn);}
    hero.append(av,info);layout.appendChild(hero);
    const repoT=document.createElement('div');repoT.className='pub-section-title';repoT.textContent='Repositories ('+repos.length+')';layout.appendChild(repoT);
    if(!repos.length){const e=document.createElement('div');e.className='pub-empty';e.textContent=isOwn?'No repos yet.':'No public repos.';layout.appendChild(e);}
    else{
        const g=document.createElement('div');g.className='pub-repos-grid';
        repos.slice(0,8).forEach(r=>{
            const card=document.createElement('div');card.className='pub-repo-card';card.style.cursor='pointer';
            const rn=document.createElement('div');rn.className='pub-repo-name';rn.textContent=r.name;
            const rm=document.createElement('div');rm.className='pub-repo-meta';rm.textContent=(r.isPublic?'🌐':'🔒')+(r.starCount?' · ★'+r.starCount:'')+(r.description?' · '+r.description:'');
            card.append(rn,rm);
            card.onclick=()=>isOwn?openRepo(r.id,r.name):openPublicRepoView(r.id,r.name,r);
            g.appendChild(card);
        });layout.appendChild(g);
    }
    const gistT=document.createElement('div');gistT.className='pub-section-title';gistT.style.marginTop='28px';gistT.textContent='Gists ('+gists.length+')';layout.appendChild(gistT);
    if(!gists.length){const e=document.createElement('div');e.className='pub-empty';e.textContent=isOwn?'No gists yet.':'No gists.';layout.appendChild(e);}
    else{
        const gl=document.createElement('div');gl.style.cssText='display:flex;flex-direction:column;gap:8px;';
        gists.slice(0,6).forEach(g=>{
            const ext=getExt(g.fileName||'');
            const card=document.createElement('div');card.className='pub-repo-card';card.style.cursor='pointer';
            card.onclick=()=>window.open(`${location.origin}${location.pathname.replace('console.html','gist.html')}?id=${g.id}`,'_blank');
            const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:4px;';
            const badge=document.createElement('span');badge.className=`file-ext ${extClass(ext)}`;badge.textContent=ext||'txt';
            const gt=document.createElement('span');gt.className='pub-repo-name';gt.style.marginBottom='0';gt.textContent=g.title||'Untitled';
            row.append(badge,gt);
            const meta=document.createElement('div');meta.className='pub-repo-meta';meta.textContent=(g.code||'').split('\n').length+' lines · click to view';
            card.append(row,meta);gl.appendChild(card);
        });layout.appendChild(gl);
    }
    mv.appendChild(layout);
}
window.openPublicProfile=openPublicProfile;

window.openSettings=async()=>{
    if(unsubFiles){unsubFiles();unsubFiles=null;}
    const mv=document.getElementById('main-view');
    mv.innerHTML='<div style="padding:40px;color:var(--text-muted);font-family:var(--mono);font-size:12px;">Loading...</div>';
    const snap=await getDoc(doc(db,'users',currentUser.uid));
    const data=snap.exists()?snap.data():{username:'',handle:''};
    mv.innerHTML='';
    const layout=document.getElementById('settings-layout');layout.className='settings-layout anim-in';
    layout.querySelector('#s-name').value=data.username||'';
    layout.querySelector('#s-bio').value=data.bio||'';
    layout.querySelector('#s-handle').value=(data.handle||'').replace('@','');
    layout.querySelector('.form-input[disabled]').value=currentUser.email||'';
    layout.querySelector('#btn-logout-settings').onclick=window.doSignOut;
    let handleCheckTimer=null,handleIsAvailable=true;
    const handleInput=layout.querySelector('#s-handle'),handleStatus=layout.querySelector('#handle-status');
    const currentHandle=(data.handle||'').replace('@','').toLowerCase();
    if(handleStatus){handleStatus.textContent='';handleStatus.className='handle-status';}
    if(handleInput&&handleStatus){
        handleInput.oninput=null;
        handleInput.addEventListener('input',()=>{
            const val=handleInput.value.trim().replace('@','').toLowerCase();
            clearTimeout(handleCheckTimer);
            if(!val){handleStatus.textContent='';handleStatus.className='handle-status';handleIsAvailable=false;return;}
            if(val===currentHandle){handleStatus.textContent='current';handleStatus.className='handle-status own';handleIsAvailable=true;return;}
            if(!/^[a-z0-9._-]{2,20}$/.test(val)){handleStatus.textContent='invalid';handleStatus.className='handle-status taken';handleIsAvailable=false;return;}
            handleStatus.textContent='checking…';handleStatus.className='handle-status checking';
            handleCheckTimer=setTimeout(async()=>{
                const q=query(collection(db,'users'),where('handle','==',val));
                const s=await getDocs(q);const taken=s.docs.some(d=>d.id!==currentUser.uid);
                handleStatus.textContent=taken?'✕ taken':'✓ available';handleStatus.className='handle-status '+(taken?'taken':'available');handleIsAvailable=!taken;
            },500);
        });
    }
    mv.appendChild(layout);
};

window.openGists=async()=>{
    if(!currentUser.emailVerified){toast('Please verify your email to use Gists.','warn');return;}
    if(unsubFiles){unsubFiles();unsubFiles=null;}
    const mv=document.getElementById('main-view');mv.innerHTML='';
    const layout=document.createElement('div');layout.className='gists-layout anim-in';
    const hdr=document.createElement('div');hdr.className='gists-header';
    const gt=document.createElement('div');gt.className='gists-title';gt.textContent='My Gists';
    const nb=document.createElement('button');nb.className='btn-new-gist';nb.textContent='+ New Gist';nb.onclick=openNewGistModal;
    hdr.append(gt,nb);layout.appendChild(hdr);
    const listEl=document.createElement('div');listEl.className='gist-list';listEl.id='gist-list-container';layout.appendChild(listEl);
    mv.appendChild(layout);renderGistList(listEl);
};
function renderGistList(container){
    onSnapshot(query(collection(db,'gists'),where('uid','==',currentUser.uid)),snap=>{
        container.innerHTML='';
        if(snap.empty){const e=document.createElement('div');e.className='gist-empty';e.textContent='No gists yet.\nCreate one and share it with a private link.';container.appendChild(e);return;}
        snap.forEach(g=>{
            const data=g.data();const ext=getExt(data.fileName||'');
            const card=document.createElement('div');card.className='gist-card';
            const ch=document.createElement('div');ch.className='gist-card-header';
            const cl=document.createElement('div');cl.className='gist-card-left';
            const ctitle=document.createElement('div');ctitle.className='gist-card-title';ctitle.textContent=data.title||'Untitled';
            const cmeta=document.createElement('div');cmeta.className='gist-card-meta';
            const badge=document.createElement('span');badge.className=`file-ext ${extClass(ext)}`;badge.textContent=ext||'txt';
            const lcount=document.createElement('span');lcount.textContent=`${(data.code||'').split('\n').length} lines`;
            const dateStr=data.createdAt?new Date(data.createdAt.toDate?data.createdAt.toDate():data.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
            const dateSpan=document.createElement('span');dateSpan.textContent=dateStr;
            const authorSpan=document.createElement('a');authorSpan.className='gist-author-handle';
            authorSpan.textContent='@'+(data.authorHandle||(data.authorName||'unknown').toLowerCase().replace(/\s+/g,'.'));
            authorSpan.onclick=e=>{e.stopPropagation();if(data.authorUid)openPublicProfile(data.authorUid);};
            cmeta.append(badge,lcount,authorSpan,dateSpan);cl.append(ctitle,cmeta);
            const ca=document.createElement('div');ca.className='gist-card-actions';
            const shareBtn=document.createElement('button');shareBtn.className='gist-action-btn share';shareBtn.textContent='🔗 Copy Link';
            shareBtn.onclick=()=>{const url=`${location.origin}${location.pathname.replace('console.html','gist.html')}?id=${g.id}`;navigator.clipboard.writeText(url).then(()=>{shareBtn.textContent='✓ Copied!';toast('Link copied','success');setTimeout(()=>shareBtn.textContent='🔗 Copy Link',2000);});};
            const delBtn=document.createElement('button');delBtn.className='gist-action-btn del';delBtn.textContent='Delete';
            delBtn.onclick=async()=>{if(confirm(`Delete gist "${data.title||'Untitled'}"?`)){await deleteDoc(doc(db,'gists',g.id));toast('Gist deleted','danger');}};
            ca.append(shareBtn,delBtn);ch.append(cl,ca);card.appendChild(ch);
            if(data.code){const preview=document.createElement('div');preview.className='gist-preview';preview.textContent=(data.code||'').slice(0,300);card.appendChild(preview);}
            container.appendChild(card);
        });
    });
}
function openNewGistModal(){
    ['gist-title','gist-filename','gist-desc','gist-code'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('gist-file-name').textContent='';
    document.getElementById('gist-modal').style.display='flex';
    setTimeout(()=>document.getElementById('gist-title').focus(),50);
}
document.getElementById('gist-file-input').onchange=e=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
        document.getElementById('gist-code').value=ev.target.result;
        document.getElementById('gist-file-name').textContent='Loaded: '+file.name;
        if(!document.getElementById('gist-filename').value) document.getElementById('gist-filename').value=file.name;
        if(!document.getElementById('gist-title').value) document.getElementById('gist-title').value=file.name;
    };reader.readAsText(file);e.target.value='';
};
document.getElementById('gist-modal-cancel').onclick=()=>document.getElementById('gist-modal').style.display='none';
document.getElementById('gist-modal').onclick=e=>{if(e.target===document.getElementById('gist-modal'))document.getElementById('gist-modal').style.display='none';};
document.getElementById('gist-modal-confirm').onclick=async()=>{
    if(!requireVerified('create gists')) return;
    const title=document.getElementById('gist-title').value.trim();
    const filename=document.getElementById('gist-filename').value.trim();
    const code=document.getElementById('gist-code').value;
    if(!title){document.getElementById('gist-title').classList.add('shake');setTimeout(()=>document.getElementById('gist-title').classList.remove('shake'),400);return;}
    if(!code.trim()){document.getElementById('gist-code').style.borderColor='var(--danger)';setTimeout(()=>document.getElementById('gist-code').style.borderColor='',2000);return;}
    document.getElementById('gist-modal').style.display='none';
    const authorSnap=await getDoc(doc(db,'users',currentUser.uid));
    const authorHandle=authorSnap.exists()?(authorSnap.data().handle||'').replace('@',''):'';
    const ref=await addDoc(collection(db,'gists'),{uid:currentUser.uid,title,fileName:filename||title,description:document.getElementById('gist-desc').value.trim(),authorName:currentUser.displayName||currentUser.email||'Anonymous',authorHandle,authorUid:currentUser.uid,code,createdAt:serverTimestamp()});
    toast('Gist created!','success');
    const url=`${location.origin}${location.pathname.replace('console.html','gist.html')}?id=${ref.id}`;
    navigator.clipboard.writeText(url).then(()=>toast('Share link copied','info')).catch(()=>{});
};

window.openRepo=async(id,name)=>{
    if(unsubFiles){unsubFiles();unsubFiles=null;}
    activeRepoId=id;
    document.querySelectorAll('.repo-item').forEach(el=>el.classList.toggle('active',el.dataset.id===id));
    const mv=document.getElementById('main-view');
    mv.innerHTML='<div style="padding:40px;color:var(--text-muted);font-family:var(--mono);font-size:12px;">Loading...</div>';
    const repoSnap=await getDoc(doc(db,'repositories',id));
    const repoData=repoSnap.exists()?repoSnap.data():{};
    const isPrimary=repoData.uid===currentUser.uid;
    const ws=document.createElement('div');ws.className='workspace anim-in';
    const headerDiv=document.createElement('div');
    const breadcrumb=document.createElement('div');breadcrumb.className='ws-breadcrumb';
    const homeSpan=document.createElement('span');homeSpan.style.cursor='pointer';homeSpan.textContent='~';homeSpan.onclick=goHome;
    breadcrumb.append(homeSpan,Object.assign(document.createElement('span'),{className:'crumb-sep',textContent:'/'}),Object.assign(document.createElement('span'),{className:'crumb-active',id:'ws-crumb',textContent:name}));
    const titleRow=document.createElement('div');titleRow.className='ws-repo-title';titleRow.style.marginTop='8px';
    const nameSpan=document.createElement('span');nameSpan.id='ws-repo-name';nameSpan.textContent=name;
    const visBadge=document.createElement('span');visBadge.className='ws-badge '+(repoData.isPublic?'badge-public':'badge-private');visBadge.textContent=repoData.isPublic?'public':'private';visBadge.id='ws-vis-badge';
    const idBadge=document.createElement('span');idBadge.className='ws-badge badge-id';idBadge.style.fontSize='9px';idBadge.textContent=id.slice(0,8)+'...';
    titleRow.append(nameSpan,visBadge,idBadge);
    if(isPrimary){
        const renBtn=document.createElement('button');renBtn.className='btn-icon';renBtn.textContent='✎ Rename';renBtn.onclick=()=>openRepoModal('rename',id,name);
        const settingsBtn=document.createElement('button');settingsBtn.className='btn-icon';settingsBtn.textContent='⚙ Settings';settingsBtn.onclick=()=>openRepoSettings(id,name,repoData);
        titleRow.append(renBtn,settingsBtn);
    }
    const showcaseDiv=document.createElement('div');showcaseDiv.id='repo-code-showcase';
    if(!currentUser.emailVerified){
        const unvNotice=document.createElement('div');
        unvNotice.style.cssText='margin-top:8px;padding:7px 12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:7px;font-family:var(--mono);font-size:11px;color:#fbbf24;display:flex;align-items:center;gap:8px;';
        unvNotice.innerHTML='⚠ Read-only — <a onclick="resendVerification()" style="color:#fbbf24;cursor:pointer;text-decoration:underline;">verify your email</a> to edit files, upload, or commit changes.';
        headerDiv.appendChild(unvNotice);
    }
    headerDiv.append(breadcrumb,titleRow,showcaseDiv);
    const grid=document.createElement('div');grid.className='ws-grid';
    const filePanel=document.createElement('div');filePanel.className='panel';
    const fpHeader=document.createElement('div');fpHeader.className='panel-header';
    const fpTitle=document.createElement('span');fpTitle.className='panel-title';fpTitle.textContent='Files';
    const fpRight=document.createElement('div');fpRight.style.cssText='display:flex;gap:6px;align-items:center;';
    const livePill=document.createElement('div');livePill.className='live-pill';livePill.id='live-badge';livePill.style.cssText='opacity:0.4;transition:opacity 0.3s,box-shadow 0.3s;';
    const liveDot=document.createElement('div');liveDot.className='live-pill-dot';livePill.append(liveDot,document.createTextNode('live'));
    const hiddenUpload=document.createElement('input');hiddenUpload.type='file';hiddenUpload.hidden=true;hiddenUpload.accept='.js,.ts,.jsx,.tsx,.py,.html,.css,.scss,.json,.txt,.md,.sh,.go,.rs,.java,.cpp,.c,.cs,.rb,.php,.sql,.yaml,.yml';
    const uploadBtn=document.createElement('button');uploadBtn.className='btn-upload';uploadBtn.textContent='↑ Upload';uploadBtn.onclick=()=>{if(!requireVerified('upload files'))return;hiddenUpload.click();};
    const newFileBtn=document.createElement('button');newFileBtn.className='btn-upload';newFileBtn.textContent='＋ New';
    newFileBtn.onclick=()=>{if(!requireVerified('create files'))return;openNewFileModal(id,name,currentFileIdRef);};
    fpRight.append(livePill,hiddenUpload,uploadBtn,newFileBtn);fpHeader.append(fpTitle,fpRight);
    const fileListBody=document.createElement('div');fileListBody.className='file-list';
    filePanel.append(fpHeader,fileListBody);
    const edPanel=document.createElement('div');edPanel.className='panel editor-panel';
    const tabBar=document.createElement('div');tabBar.className='editor-tab-bar';
    const tabLabel=document.createElement('div');tabLabel.className='editor-tab active';tabLabel.textContent='no file selected';tabBar.appendChild(tabLabel);
    const toolbar=document.createElement('div');toolbar.className='editor-toolbar';
    const filepath=document.createElement('span');filepath.className='editor-filepath';filepath.textContent='Select a file to begin editing';
    const btnSave=document.createElement('button');btnSave.className='btn-save';btnSave.textContent='Commit';
    toolbar.append(filepath,btnSave);
    const numsWrap=document.createElement('div');numsWrap.className='editor-numbers-wrap';numsWrap.style.cssText='flex:1;overflow:hidden;display:flex;';
    const lineNums=document.createElement('div');lineNums.className='line-numbers';lineNums.textContent='1';
    const codeEditor=document.createElement('textarea');codeEditor.className='code-textarea';codeEditor.disabled=true;codeEditor.setAttribute('wrap','off');codeEditor.placeholder='// Select a file from the explorer to start editing...';
    numsWrap.append(lineNums,codeEditor);
    const statusBar=document.createElement('div');statusBar.className='editor-status-bar';
    const statusLang=document.createElement('span');statusLang.className='status-item';statusLang.textContent='—';
    const statusLines=document.createElement('span');statusLines.className='status-item';statusLines.textContent='0 lines';
    const statusEnc=document.createElement('span');statusEnc.className='status-item highlight';statusEnc.textContent='UTF-8';
    statusBar.append(statusLang,statusLines,statusEnc);edPanel.append(tabBar,toolbar,numsWrap,statusBar);
    grid.append(filePanel,edPanel);ws.append(headerDiv,grid);mv.innerHTML='';mv.appendChild(ws);
    let currentFileId=null;
    const currentFileIdRef={get:()=>currentFileId,set:(v)=>{currentFileId=v;}};
    const updateStatus=()=>{const l=codeEditor.value.split('\n').length;statusLines.textContent=`${l} line${l!==1?'s':''}`;updateLineNumbers(codeEditor,lineNums);};
    codeEditor.addEventListener('input',updateStatus);
    codeEditor.addEventListener('scroll',()=>{lineNums.scrollTop=codeEditor.scrollTop;});
    codeEditor.addEventListener('keydown',e=>{if(e.key==='Tab'){e.preventDefault();const s=codeEditor.selectionStart,en=codeEditor.selectionEnd;codeEditor.value=codeEditor.value.substring(0,s)+'  '+codeEditor.value.substring(en);codeEditor.selectionStart=codeEditor.selectionEnd=s+2;updateStatus();}});
    const q=query(collection(db,'files'),where('repoId','==',id));
    unsubFiles=onSnapshot(q,snap=>{
        pulseLive();const prev=fileListBody.scrollTop;fileListBody.innerHTML='';
        const allDocs=[];snap.forEach(f=>allDocs.push(f));updateCodeShowcase(allDocs);
        if(snap.empty){const e=document.createElement('div');e.className='file-empty';e.textContent='Directory empty.\nUpload your first file →';fileListBody.appendChild(e);return;}
        snap.forEach(f=>{
            const data=f.data();const ext=getExt(data.fileName);
            const row=document.createElement('div');row.className='file-row'+(f.id===currentFileId?' active':'');
            const rowLeft=document.createElement('div');rowLeft.className='file-row-left';
            const extBadge=document.createElement('span');extBadge.className=`file-ext ${extClass(ext)}`;extBadge.textContent=ext||'txt';
            const fname=document.createElement('span');fname.className='file-name';fname.textContent=data.fileName;
            rowLeft.append(extBadge,fname);
            const delBtn=document.createElement('button');delBtn.className='file-del';delBtn.title='Delete';delBtn.textContent='×';
            row.append(rowLeft,delBtn);
            row.onclick=()=>{currentFileId=f.id;currentFileIdRef.set(f.id);fileListBody.querySelectorAll('.file-row').forEach(r=>r.classList.remove('active'));row.classList.add('active');tabLabel.textContent=data.fileName;filepath.textContent=`/${name}/${data.fileName}`;codeEditor.value=data.code||'';codeEditor.disabled=false;btnSave.style.display='inline-block';statusLang.textContent=ext.toUpperCase()||'TXT';updateStatus();};
            delBtn.onclick=async e=>{e.stopPropagation();if(!requireVerified('delete files'))return;if(confirm(`Delete "${data.fileName}"?`)){await deleteDoc(doc(db,'files',f.id));if(currentFileId===f.id){currentFileId=null;codeEditor.value='';codeEditor.disabled=true;btnSave.style.display='none';tabLabel.textContent='no file selected';filepath.textContent='Select a file to begin editing';statusLang.textContent='—';updateLineNumbers(codeEditor,lineNums);}toast(`Deleted ${data.fileName}`,'danger');}};
            fileListBody.appendChild(row);
        });fileListBody.scrollTop=prev;
    });
    btnSave.onclick=async()=>{if(!requireVerified('commit changes')) return;if(!currentFileId)return;btnSave.textContent='Saving...';await updateDoc(doc(db,'files',currentFileId),{code:codeEditor.value});btnSave.textContent='✓ Saved';toast('Changes committed','success');setTimeout(()=>btnSave.textContent='Commit',1800);};
    hiddenUpload.onchange=e=>{
        const file=e.target.files[0];if(!file)return;
        const reader=new FileReader();
        reader.onload=async ev=>{const ext=getExt(file.name);await addDoc(collection(db,'files'),{repoId:id,uid:currentUser.uid,fileName:file.name,code:ev.target.result,createdAt:serverTimestamp()});toast(`Uploaded ${file.name}`,'info');};
        reader.readAsText(file);e.target.value='';
    };
};

async function openPublicRepoView(id,name,repoData){
    if(unsubFiles){unsubFiles();unsubFiles=null;}
    const mv=document.getElementById('main-view');
    mv.innerHTML='<div style="padding:40px;color:var(--text-muted);font-family:var(--mono);font-size:12px;">Loading...</div>';
    const ws=document.createElement('div');ws.className='workspace anim-in';
    const headerDiv=document.createElement('div');
    const breadcrumb=document.createElement('div');breadcrumb.className='ws-breadcrumb';
    const homeSpan=document.createElement('span');homeSpan.style.cursor='pointer';homeSpan.textContent='~';homeSpan.onclick=goHome;
    breadcrumb.append(homeSpan,Object.assign(document.createElement('span'),{className:'crumb-sep',textContent:'/'}),Object.assign(document.createElement('span'),{className:'crumb-active',textContent:name}));
    const titleRow=document.createElement('div');titleRow.className='ws-repo-title';titleRow.style.marginTop='8px';
    const nameSpan=document.createElement('span');nameSpan.textContent=name;
    const pubBadge=document.createElement('span');pubBadge.className='ws-badge badge-public';pubBadge.textContent='public';
    const starred=await isStarred(id);
    const starBtn=document.createElement('button');starBtn.className='btn-star'+(starred?' starred':'');
    const starIcon=document.createElement('span');starIcon.className='star-icon';starIcon.textContent=starred?'★':'☆';
    const starCount=document.createElement('span');starCount.className='star-count';starCount.textContent=repoData.starCount||0;
    starBtn.append(starIcon,document.createTextNode('Star '),starCount);
    starBtn.onclick=()=>toggleStar(id,starBtn,starCount);
    titleRow.append(nameSpan,pubBadge,starBtn);
    if(repoData.description){const desc=document.createElement('div');desc.style.cssText='font-size:13px;color:var(--text-secondary);margin-top:6px;';desc.textContent=repoData.description;headerDiv.appendChild(desc);}
    const showcaseDiv=document.createElement('div');showcaseDiv.id='repo-code-showcase';
    headerDiv.append(breadcrumb,titleRow,showcaseDiv);
    const grid=document.createElement('div');grid.className='ws-grid';
    const filePanel=document.createElement('div');filePanel.className='panel';
    const fpHeader=document.createElement('div');fpHeader.className='panel-header';
    const fpTitle=document.createElement('span');fpTitle.className='panel-title';fpTitle.textContent='Files';fpHeader.appendChild(fpTitle);
    const fileListBody=document.createElement('div');fileListBody.className='file-list';filePanel.append(fpHeader,fileListBody);
    const edPanel=document.createElement('div');edPanel.className='panel editor-panel';
    const notice=document.createElement('div');notice.className='readonly-notice';notice.textContent='👁 Read-only — this is a public repository';
    const tabBar=document.createElement('div');tabBar.className='editor-tab-bar';
    const tabLabel=document.createElement('div');tabLabel.className='editor-tab active';tabLabel.textContent='no file selected';tabBar.appendChild(tabLabel);
    const toolbar=document.createElement('div');toolbar.className='editor-toolbar';
    const filepath=document.createElement('span');filepath.className='editor-filepath';filepath.textContent='Select a file to view';toolbar.appendChild(filepath);
    const numsWrap=document.createElement('div');numsWrap.className='editor-numbers-wrap';numsWrap.style.cssText='flex:1;overflow:hidden;display:flex;';
    const lineNums=document.createElement('div');lineNums.className='line-numbers';lineNums.textContent='1';
    const codeEditor=document.createElement('textarea');codeEditor.className='code-textarea';codeEditor.disabled=true;codeEditor.setAttribute('wrap','off');codeEditor.placeholder='// Select a file to view its contents…';
    numsWrap.append(lineNums,codeEditor);edPanel.append(notice,tabBar,toolbar,numsWrap);grid.append(filePanel,edPanel);ws.append(headerDiv,grid);mv.innerHTML='';mv.appendChild(ws);
    const filesSnap=await getDocs(query(collection(db,'files'),where('repoId','==',id)));
    updateCodeShowcase(filesSnap.docs);
    if(filesSnap.empty){const e=document.createElement('div');e.className='file-empty';e.textContent='This repository has no files.';fileListBody.appendChild(e);}
    else filesSnap.forEach(f=>{
        const data=f.data();const ext=getExt(data.fileName);
        const row=document.createElement('div');row.className='file-row';
        const rowLeft=document.createElement('div');rowLeft.className='file-row-left';
        const extBadge=document.createElement('span');extBadge.className=`file-ext ${extClass(ext)}`;extBadge.textContent=ext||'txt';
        const fname=document.createElement('span');fname.className='file-name';fname.textContent=data.fileName;
        rowLeft.append(extBadge,fname);row.appendChild(rowLeft);
        row.onclick=()=>{fileListBody.querySelectorAll('.file-row').forEach(r=>r.classList.remove('active'));row.classList.add('active');tabLabel.textContent=data.fileName;filepath.textContent=`/${name}/${data.fileName}`;codeEditor.value=data.code||'';updateLineNumbers(codeEditor,lineNums);};
        fileListBody.appendChild(row);
    });
}
window.openPublicRepoView=openPublicRepoView;

async function openRepoSettings(id,name,repoData){
    if(!requireVerified('access repo settings')) return;
    if(unsubFiles){unsubFiles();unsubFiles=null;}
    const mv=document.getElementById('main-view');
    mv.innerHTML='<div style="padding:40px;color:var(--text-muted);font-family:var(--mono);font-size:12px;">Loading settings...</div>';
    const owners=repoData.owners||[repoData.uid];
    const collabProfiles=await Promise.all(owners.map(uid=>getDoc(doc(db,'users',uid))));
    mv.innerHTML='';
    const layout=document.createElement('div');layout.className='repo-settings-layout anim-in';
    const title=document.createElement('div');title.className='repo-settings-title';title.textContent=name+' — Settings';
    const sub=document.createElement('div');sub.className='repo-settings-sub';sub.textContent='Manage visibility, collaborators, and ownership of this repository.';
    layout.append(title,sub);
    function makeSec(t){const s=document.createElement('div');s.className='settings-section';const h=document.createElement('div');h.className='settings-section-title';h.textContent=t;s.appendChild(h);return s;}
    function makeField(label,type,val,placeholder,isTextarea=false){
        const g=document.createElement('div');g.className='settings-field';
        const l=document.createElement('label');l.textContent=label;g.appendChild(l);
        if(isTextarea){const ta=document.createElement('textarea');ta.value=val;ta.placeholder=placeholder;g.appendChild(ta);}
        else{const inp=document.createElement('input');inp.type=type||'text';inp.value=val;inp.placeholder=placeholder;g.appendChild(inp);}
        return g;
    }
    const genSec=makeSec('⚙ General');
    const nameField=makeField('Repository Name','text',name,'repository-name');
    const descField=makeField('Description',null,repoData.description||'','Describe your repository…',true);
    genSec.append(nameField,descField);
    const visRow=document.createElement('div');visRow.className='toggle-row';
    const visInfo=document.createElement('div');
    const visLabel=document.createElement('div');visLabel.className='toggle-label';visLabel.textContent='Public repository';
    const visDesc=document.createElement('div');visDesc.className='toggle-desc';visDesc.textContent='Anyone can view this repo and its files';
    visInfo.append(visLabel,visDesc);
    const visToggle=document.createElement('label');visToggle.className='toggle-switch';
    const visCheck=document.createElement('input');visCheck.type='checkbox';visCheck.checked=!!repoData.isPublic;
    const visSlider=document.createElement('span');visSlider.className='toggle-slider';
    visToggle.append(visCheck,visSlider);visRow.append(visInfo,visToggle);genSec.appendChild(visRow);
    const saveGenBtn=document.createElement('button');saveGenBtn.className='btn-save-settings';saveGenBtn.textContent='Save Changes';
    const genStatus=document.createElement('p');genStatus.className='settings-status';
    saveGenBtn.onclick=async()=>{
        const newName=nameField.querySelector('input').value.trim();
        const newDesc=descField.querySelector('textarea').value.trim();
        if(!newName){toast('Name is required','warn');return;}
        saveGenBtn.textContent='Saving...';
        await updateDoc(doc(db,'repositories',id),{name:newName,description:newDesc,isPublic:visCheck.checked});
        const visBadge=document.getElementById('ws-vis-badge');
        if(visBadge){visBadge.textContent=visCheck.checked?'public':'private';visBadge.className='ws-badge '+(visCheck.checked?'badge-public':'badge-private');}
        toast('Settings saved','success');saveGenBtn.textContent='Save Changes';
        const crumb=document.getElementById('ws-crumb');if(crumb)crumb.textContent=newName;
        const nd=document.getElementById('ws-repo-name');if(nd)nd.textContent=newName;
        genStatus.textContent='✓ Saved';genStatus.style.color='var(--success)';setTimeout(()=>genStatus.textContent='',2500);
    };
    genSec.append(saveGenBtn,genStatus);layout.appendChild(genSec);
    const collabSec=makeSec('👥 Collaborators');
    const collabList=document.createElement('div');collabList.className='collab-list';
    collabProfiles.forEach((snap,i)=>{
        const uid=owners[i];if(!uid)return;
        const d=snap.exists()?snap.data():{username:'Unknown',handle:''};
        const item=document.createElement('div');item.className='collab-item';item.id='collab-'+uid;
        const info=document.createElement('div');info.className='collab-info';
        const av=document.createElement('div');av.className='collab-avatar';
        if(d.photoURL){const img=document.createElement('img');img.src=d.photoURL;img.alt='';av.appendChild(img);}else av.textContent=(d.username||'?').charAt(0).toUpperCase();
        const nameEl=document.createElement('div');
        const n=document.createElement('div');n.className='collab-name';n.textContent=d.username||'Unknown';
        const r=document.createElement('div');r.className='collab-role';r.textContent=(uid===repoData.uid)?'Owner':'Collaborator';
        nameEl.append(n,r);info.append(av,nameEl);item.appendChild(info);
        if(uid!==repoData.uid){
            const rmBtn=document.createElement('button');rmBtn.className='btn-remove-collab';rmBtn.title='Remove';rmBtn.textContent='×';
            rmBtn.onclick=async()=>{if(confirm('Remove this collaborator?')){await updateDoc(doc(db,'repositories',id),{owners:arrayRemove(uid)});document.getElementById('collab-'+uid)?.remove();toast('Removed','info');}};
            item.appendChild(rmBtn);
        }
        collabList.appendChild(item);
    });
    collabSec.appendChild(collabList);
    const addRow=document.createElement('div');addRow.className='collab-add-row';
    const addInput=document.createElement('input');addInput.className='collab-add-input';addInput.placeholder='@handle to add as collaborator';addInput.type='text';
    const addBtn=document.createElement('button');addBtn.className='btn-add-collab';addBtn.textContent='Add';
    addRow.append(addInput,addBtn);
    const collabStatus=document.createElement('div');collabStatus.className='collab-status';
    addBtn.onclick=async()=>{
        const val=addInput.value.trim().replace('@','');if(!val)return;
        collabStatus.textContent='Searching...';collabStatus.style.color='var(--text-muted)';
        const q=query(collection(db,'users'),where('handle','==',val.toLowerCase()));
        const s=await getDocs(q);
        if(s.empty){collabStatus.textContent='User not found.';collabStatus.style.color='var(--danger)';return;}
        const targetUid=s.docs[0].id;
        if(owners.includes(targetUid)){collabStatus.textContent='Already a collaborator.';collabStatus.style.color='var(--warn)';return;}
        await updateDoc(doc(db,'repositories',id),{owners:arrayUnion(targetUid)});
        toast('Collaborator added','success');addInput.value='';
        collabStatus.textContent='✓ Added @'+val;collabStatus.style.color='var(--success)';setTimeout(()=>collabStatus.textContent='',3000);
    };
    addInput.onkeydown=e=>{if(e.key==='Enter')addBtn.click();};
    collabSec.append(addRow,collabStatus);layout.appendChild(collabSec);
    const transferSec=makeSec('🔁 Transfer Ownership');
    const transferDesc=document.createElement('p');transferDesc.style.cssText='font-size:13px;color:var(--text-secondary);margin-bottom:12px;';transferDesc.textContent='Transfer this repository to another user. You will lose primary owner privileges.';
    const transferRow=document.createElement('div');transferRow.className='collab-add-row';
    const transferInput=document.createElement('input');transferInput.className='collab-add-input';transferInput.placeholder='New owner @handle';transferInput.type='text';
    const transferBtn=document.createElement('button');transferBtn.className='btn-add-collab';transferBtn.style.background='var(--warn)';transferBtn.style.color='black';transferBtn.textContent='Transfer';
    transferRow.append(transferInput,transferBtn);
    const transferStatus=document.createElement('div');transferStatus.className='collab-status';
    transferBtn.onclick=async()=>{
        const val=transferInput.value.trim().replace('@','');if(!val)return;
        const q=query(collection(db,'users'),where('handle','==',val.toLowerCase()));
        const s=await getDocs(q);
        if(s.empty){transferStatus.textContent='User not found.';transferStatus.style.color='var(--danger)';return;}
        const newOwnerUid=s.docs[0].id;
        const newOwnerName=s.docs[0].data().username||val;
        if(!confirm(`Transfer "${name}" to @${val} (${newOwnerName})? You will no longer be the primary owner.`))return;
        await updateDoc(doc(db,'repositories',id),{uid:newOwnerUid,owners:arrayUnion(newOwnerUid)});
        toast(`Transferred to ${newOwnerName}`,'success');goHome();
    };
    transferSec.append(transferDesc,transferRow,transferStatus);layout.appendChild(transferSec);
    const dangerSec=makeSec('⚠ Danger Zone');dangerSec.className+=' danger-zone';
    const delDesc=document.createElement('p');delDesc.style.cssText='font-size:13px;color:var(--text-secondary);margin-bottom:12px;';delDesc.textContent='Permanently delete this repository and all its files. This cannot be undone.';
    const delBtn=document.createElement('button');delBtn.className='btn-danger';delBtn.textContent='Delete Repository';
    delBtn.onclick=()=>window.deleteRepo(id);dangerSec.append(delDesc,delBtn);layout.appendChild(dangerSec);
    mv.appendChild(layout);
}
window.openRepoSettings=openRepoSettings;

const QUICK_TYPES=[
    {ext:'js',label:'JavaScript'},
    {ext:'ts',label:'TypeScript'},
    {ext:'jsx',label:'React JSX'},
    {ext:'tsx',label:'React TSX'},
    {ext:'py',label:'Python'},
    {ext:'html',label:'HTML'},
    {ext:'css',label:'CSS'},
    {ext:'scss',label:'SCSS'},
    {ext:'json',label:'JSON'},
    {ext:'md',label:'Markdown'},
    {ext:'sh',label:'Shell'},
    {ext:'sql',label:'SQL'},
    {ext:'go',label:'Go'},
    {ext:'rs',label:'Rust'},
    {ext:'java',label:'Java'},
    {ext:'cpp',label:'C++'},
    {ext:'c',label:'C'},
    {ext:'cs',label:'C#'},
    {ext:'php',label:'PHP'},
    {ext:'rb',label:'Ruby'},
    {ext:'yaml',label:'YAML'},
    {ext:'txt',label:'Plain text'},
];

function openNewFileModal(repoId,repoName,fileIdRef){
    const input=document.getElementById('new-file-name');
    const qp=document.getElementById('new-file-quickpick');
    input.value='';qp.innerHTML='';
    QUICK_TYPES.forEach(({ext,label})=>{
        const chip=document.createElement('button');
        chip.textContent='.'+ext;
        chip.title=label;
        chip.style.cssText='padding:3px 10px;background:var(--bg-hover);border:1px solid var(--border-dim);border-radius:5px;color:var(--text-secondary);font-family:var(--mono);font-size:11px;cursor:pointer;transition:all 0.12s;';
        chip.onmouseover=()=>{chip.style.borderColor='var(--accent)';chip.style.color='var(--accent-bright)';};
        chip.onmouseout=()=>{chip.style.borderColor='var(--border-dim)';chip.style.color='var(--text-secondary)';};
        chip.onclick=()=>{
            const cur=input.value.trim();
            if(!cur||cur.startsWith('.')){input.value='untitled.'+ext;}
            else if(!cur.includes('.')){input.value=cur+'.'+ext;}
            else {const parts=cur.split('.');parts[parts.length-1]=ext;input.value=parts.join('.');}
            input.focus();
        };
        qp.appendChild(chip);
    });
    document.getElementById('new-file-modal').style.display='flex';
    setTimeout(()=>input.focus(),50);

    const confirmBtn=document.getElementById('new-file-confirm');
    const cancelBtn=document.getElementById('new-file-cancel');
    const newConfirm=confirmBtn.cloneNode(true);
    const newCancel=cancelBtn.cloneNode(true);
    confirmBtn.replaceWith(newConfirm);
    cancelBtn.replaceWith(newCancel);

    newCancel.onclick=()=>document.getElementById('new-file-modal').style.display='none';
    document.getElementById('new-file-modal').onclick=e=>{if(e.target===document.getElementById('new-file-modal'))document.getElementById('new-file-modal').style.display='none';};

    const doCreate=async()=>{
        const fileName=document.getElementById('new-file-name').value.trim();
        if(!fileName){
            const inp=document.getElementById('new-file-name');
            inp.classList.add('shake');setTimeout(()=>inp.classList.remove('shake'),400);return;
        }
        if(!fileName.includes('.')||fileName.endsWith('.')){
            toast('Add a file extension (e.g. script.js)','warn');return;
        }
        document.getElementById('new-file-modal').style.display='none';
        const ref=await addDoc(collection(db,'files'),{
            repoId,uid:currentUser.uid,fileName,code:'',createdAt:serverTimestamp()
        });
        fileIdRef.set(ref.id);
        toast(`Created ${fileName}`,'success');
    };
    newConfirm.onclick=doCreate;
    document.getElementById('new-file-name').onkeydown=e=>{
        if(e.key==='Enter')doCreate();
        if(e.key==='Escape')document.getElementById('new-file-modal').style.display='none';
    };
}

window.deleteRepo=async(id)=>{
    if(!currentUser.emailVerified){toast('Please verify your email to manage repositories.','warn');return;}
    if(confirm('Permanently delete this repository and all its files?')){
        const q=query(collection(db,'files'),where('repoId','==',id));
        const recs=await getDocs(q);const batch=writeBatch(db);recs.forEach(f=>batch.delete(f.ref));
        await batch.commit();await deleteDoc(doc(db,'repositories',id));
        if(activeRepoId===id)goHome();toast('Repository deleted','danger');
    }
};

function openRepoModal(mode, id, currentName) {
    if (!currentUser || !currentUser.emailVerified) {
        toast('Please verify your email address to manage repositories.', 'warn');
        return; 
    }

    repoModalMode = mode;
    repoModalTargetId = id || null;
    
    const titleEl = document.getElementById('repo-modal-title'),
          subEl = document.getElementById('repo-modal-sub');
    const confirmEl = document.getElementById('repo-modal-confirm'),
          input = document.getElementById('modal-repo-name');
    const extra = document.getElementById('repo-modal-extra');
    
    if (mode === 'create') {
        titleEl.textContent = 'Create Repository';
        subEl.textContent = 'Initialize a new cloud repository workspace.';
        confirmEl.textContent = 'Create';
        input.value = '';
        extra.style.display = 'block';
        document.getElementById('modal-repo-public').checked = false;
        document.getElementById('modal-repo-desc').value = '';
    } else {
        titleEl.textContent = 'Rename Repository';
        subEl.textContent = 'Enter a new name for this repository.';
        confirmEl.textContent = 'Rename';
        input.value = currentName || '';
        extra.style.display = 'none';
    }
    
    document.getElementById('repo-modal').style.display = 'flex';
    
    setTimeout(() => {
        input.focus();
        if (mode === 'rename') input.select();
    }, 50);
}
/**
 * Handles the password change process by reauthenticating the user 
 * and updating their password in Firebase Auth.
 */
async function changePassword() {
    const current = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;
    
    if (!current || !newPass) {
        toast('Please fill in both fields', 'warn');
        return;
    }
    
    try {
        await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, current));
        
        await updatePassword(currentUser, newPass);
        
        toast('Password updated', 'success');
        
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('password-modal').style.display = 'none';
    } catch (e) {
        console.error(e);
        toast(e.code === 'auth/wrong-password' ? 'Current password is incorrect' : 'Failed to change password', 'danger');
    }
}
function openPasswordChangeModal() {
    document.getElementById('password-modal').style.display = 'flex';
    
    setTimeout(() => document.getElementById('current-password').focus(), 50);
    
    document.getElementById('password-modal-cancel').onclick = () => {
        document.getElementById('password-modal').style.display = 'none';
    };
    
    document.getElementById('password-modal-confirm').onclick = changePassword;
}
window.openRepoModal=openRepoModal;
document.getElementById('repo-modal-cancel').onclick=()=>document.getElementById('repo-modal').style.display='none';
document.getElementById('repo-modal').onclick=e=>{if(e.target===document.getElementById('repo-modal'))document.getElementById('repo-modal').style.display='none';};
async function handleRepoModalConfirm(){
    const input=document.getElementById('modal-repo-name'),val=input.value.trim();
    if(!val){input.classList.add('shake');setTimeout(()=>input.classList.remove('shake'),400);return;}
    if(repoModalMode==='create'){
        if(allRepos.some(r=>r.name.toLowerCase()===val.toLowerCase())){input.classList.add('shake');setTimeout(()=>input.classList.remove('shake'),400);toast('Name already taken','warn');return;}
        document.getElementById('repo-modal').style.display='none';
        const isPublic=document.getElementById('modal-repo-public').checked;
        const description=document.getElementById('modal-repo-desc').value.trim();
        await addDoc(collection(db,'repositories'),{name:val,uid:currentUser.uid,owners:[currentUser.uid],isPublic,description,starCount:0,createdAt:serverTimestamp()});
    }else{
        document.getElementById('repo-modal').style.display='none';
        await updateDoc(doc(db,'repositories',repoModalTargetId),{name:val});
        toast(`Renamed to "${val}"`, 'success');
    }
}
document.getElementById('repo-modal-confirm').onclick=handleRepoModalConfirm;
document.getElementById('modal-repo-name').onkeydown=e=>{if(e.key==='Enter')handleRepoModalConfirm();if(e.key==='Escape')document.getElementById('repo-modal').style.display='none';};

function renderRepos(filter=''){
    const repoListEl=document.getElementById('sidebar-repo-list'),toggleBoxEl=document.getElementById('sidebar-toggle-box'),repoCountLbl=document.getElementById('repo-count-label');
    repoListEl.innerHTML='';toggleBoxEl.style.display='none';toggleBoxEl.innerHTML='';
    let subset=allRepos.filter(r=>(r.name||'').toLowerCase().includes(filter.toLowerCase()));
    const total=subset.length;
    repoCountLbl.textContent=`${total} repositor${total!==1?'ies':'y'}`;
    if(!showAllRepos&&total>REPO_LIMIT)subset=subset.slice(0,REPO_LIMIT);
    if(!total){const e=document.createElement('div');e.style.cssText='padding:20px 10px;text-align:center;color:var(--text-muted);font-family:var(--mono);font-size:11px;';e.textContent='No matches found';repoListEl.appendChild(e);return;}
    subset.forEach(r=>{
        const item=document.createElement('div');item.className='repo-item'+(r.id===activeRepoId?' active':'');item.dataset.id=r.id;
        const left=document.createElement('div');left.className='repo-item-left';
        const icon=document.createElement('div');icon.className='repo-icon';
        const img=document.createElement('img');img.src='Repo.png';img.alt='';img.style.height='14px';img.style.width='auto';img.onerror=()=>{icon.textContent='📁';};icon.appendChild(img);
        const nameEl=document.createElement('span');nameEl.className='repo-name';nameEl.textContent=r.name;
        const visBadge=document.createElement('span');visBadge.className='repo-vis-badge '+(r.isPublic?'vis-public':'vis-private');visBadge.textContent=r.isPublic?'pub':'prv';
        left.append(icon,nameEl,visBadge);
        const btns=document.createElement('div');btns.className='repo-btns';
        const renBtn=document.createElement('button');renBtn.className='repo-btn ren';renBtn.title='Rename';renBtn.textContent='✎';renBtn.onclick=e=>{e.stopPropagation();openRepoModal('rename',r.id,r.name);};
        const delBtn=document.createElement('button');delBtn.className='repo-btn del';delBtn.title='Delete';delBtn.textContent='×';delBtn.onclick=e=>{e.stopPropagation();window.deleteRepo(r.id);};
        btns.append(renBtn,delBtn);item.append(left,btns);
        item.onclick=()=>window.openRepo(r.id,r.name);
        repoListEl.appendChild(item);
    });
    if(total>REPO_LIMIT){toggleBoxEl.style.display='block';const btn=document.createElement('button');btn.className='btn-show-more';btn.textContent=showAllRepos?'↑ Show less':`↓ Show all (${total})`;btn.onclick=()=>{showAllRepos=!showAllRepos;renderRepos(document.getElementById('search-repo-input').value);};toggleBoxEl.appendChild(btn);}
    const statEl=document.getElementById('stat-repos');if(statEl)statEl.textContent=allRepos.length;
}

function startRepoListener(){
    if(unsubRepos){unsubRepos();unsubRepos=null;}
    let ownRepos=[],collabRepos=[];
    function merge(){
        const seen=new Set();
        allRepos=[...ownRepos,...collabRepos].filter(r=>{if(seen.has(r.id))return false;seen.add(r.id);return true;});
        renderRepos(document.getElementById('search-repo-input').value);
        pulseLive();
        const statEl=document.getElementById('stat-repos');if(statEl)statEl.textContent=allRepos.length;
        if(activeRepoId){const updated=allRepos.find(r=>r.id===activeRepoId);if(updated){const crumb=document.getElementById('ws-crumb');if(crumb)crumb.textContent=updated.name;const nd=document.getElementById('ws-repo-name');if(nd)nd.textContent=updated.name;}}
    }
    const unsubOwn=onSnapshot(query(collection(db,'repositories'),where('uid','==',currentUser.uid)),snap=>{
        const prev=ownRepos.map(r=>r.id);
        ownRepos=snap.docs.map(d=>({id:d.id,...d.data()}));
        if(!isFirstLoad)ownRepos.filter(r=>!prev.includes(r.id)).forEach(r=>toast(`New repo: ${r.name}`,'success'));
        isFirstLoad=false;merge();
    });
    const unsubCollab=onSnapshot(query(collection(db,'repositories'),where('owners','array-contains',currentUser.uid)),snap=>{
        collabRepos=snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>r.uid!==currentUser.uid);merge();
    });
    unsubRepos=()=>{unsubOwn();unsubCollab();};
}

document.getElementById('search-repo-input').addEventListener('input',e=>{showAllRepos=false;renderRepos(e.target.value);});
document.getElementById('btn-new-repo').onclick=()=>openRepoModal('create');