import { api } from '../../../shared/js/api-client.js';
document.getElementById('frm').addEventListener('submit', async e=>{
  e.preventDefault();
  const fd=new FormData(e.target);
  const body={ laundromat_id:fd.get('laundromat_id'), customer_id:fd.get('customer_id') };
  try{ const r=await api.post('/bookings?action=create', body); document.getElementById('msg').textContent='Booking created: '+r.data.id; }
  catch(err){ document.getElementById('msg').className='error'; document.getElementById('msg').textContent=err.message; }
});
