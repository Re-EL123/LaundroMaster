import { api } from '../../../shared/js/api-client.js';
const list=document.getElementById('list');
api.get('/owner/services').then(r=>{ list.innerHTML=''; (r.data||[]).forEach(s=>{ const c=document.createElement('article'); c.className='card'; c.innerHTML=`<div class="card-body"><h3>${s.name}</h3><p class="text-sm text-muted">R${Number(s.base_price||0).toFixed(2)}</p></div>`; list.appendChild(c); }); if(!(r.data||[]).length) list.innerHTML='<p class="text-muted">No services</p>'; }).catch(()=>list.innerHTML='<p class="error">Failed</p>');
