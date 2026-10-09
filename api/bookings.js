import { successEnvelope, errorEnvelope } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { bookingCreate, bookingUpdateStatus } from './_lib/validation.js';

export default async function handler(req, res) {
  try {
    const supa = adminClient();
    const action = req.query.action || '';
    if (req.method === 'GET') {
      const { id } = req.query;
      if (id) {
        const { data } = await supa.from('bookings').select('*').eq('id', id).single();
        return res.status(200).json(successEnvelope(data));
      }
      const { data } = await supa.from('bookings').select('*').limit(20);
      return res.status(200).json(successEnvelope(data||[]));
    }
    if (req.method === 'POST') {
      if (action === 'create') {
        const parsed = bookingCreate.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(errorEnvelope({ code: 'VALIDATION_ERROR', message: parsed.error.message }));
        const payload = { ...parsed.data, status: 'pending_payment', total_amount: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        const { data, error } = await supa.from('bookings').insert(payload).select().single();
        if (error) throw error;
        return res.status(201).json(successEnvelope(data));
      }
      if (action === 'update-status') {
        const parsed = bookingUpdateStatus.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(errorEnvelope({ code: 'VALIDATION_ERROR', message: parsed.error.message }));
        const { booking_id, status } = parsed.data;
        const { data, error } = await supa.from('bookings').update({ status, updated_at: new Date().toISOString() }).eq('id', booking_id).select().single();
        if (error) throw error;
        return res.status(200).json(successEnvelope(data));
      }
    }
    return res.status(405).json(errorEnvelope({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' }));
  } catch (err) {
    return res.status(500).json(errorEnvelope(err));
  }
}
