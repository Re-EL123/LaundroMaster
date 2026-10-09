import { api } from '../../../shared/js/api-client.js';
const params=new URLSearchParams(location.search); const id=params.get('id');
const out=document.getElementById('out');
if(!id) out.innerHTML='<p class="error">Missing</p>';
else api.get(`/bookings/${id}`).then(r=>{ const d=r.data||{}; out.innerHTML=`<div><strong>ID</strong>: ${d.id}</div><div><strong>Status</strong>: ${d.status}</div><div><strong>Total</strong>: R${Number(d.total_amount||0).toFixed(2)}</div>`; }).catch(()=>out.innerHTML='<p class="error">Failed</p>');
