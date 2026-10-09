import { api } from '../../../shared/js/api-client.js';
const params=new URLSearchParams(location.search); const id=params.get('id');
const biz=document.getElementById('biz'), svcs=document.getElementById('svcs');
if(!id){ biz.innerHTML='<p class="error">Missing ID</p>'; }
else { api.get(`/laundromats/${id}`).then(r=>{ const d=r.data||{}; biz.innerHTML=`<article class="card"><div class="card-body"><h1>${d.name}</h1><p class="card-meta">${d.address||''}</p></div></article>`; }).catch(()=>biz.innerHTML='<p class="error">Failed</p>'); api.get(`/laundromats/${id}/services`).then(r=>{ svcs.innerHTML=''; (r.data||[]).forEach(s=>{ const c=document.createElement('article'); c.className='card'; c.innerHTML=`<div class="card-body"><h3>${s.name}</h3><p class="text-sm text-muted">R${Number(s.base_price||0).toFixed(2)}</p></div>`; svcs.appendChild(c); }); if(!(r.data||[]).length) svcs.innerHTML='<p class="text-muted">No services</p>'; }).catch(()=>svcs.innerHTML='<p class="error">Failed</p>'); }
