import { createHandler } from './_lib/handler.js';
import { successEnvelope, errorEnvelope, ApiError } from './_lib/errors.js';
import { adminClient } from './_lib/supabase-admin.js';
import { query, body } from './_lib/req.js';
import { requireUser } from './_lib/auth.js';
import { notifyUser } from './_lib/push.js';

// Staff invitations are addressed to an existing account, so accepting or
// declining must be possible before the invitee has the `staff` role.
export default createHandler(async function handler(req, res) {
  const q = query(req);
  const supa = adminClient();
  if (!supa) return res.status(503).json(errorEnvelope(new ApiError('NOT_CONFIGURED', 'Supabase not configured', 503)));

  const ctx = await requireUser(req);
  const action = q.action || '';

  if (req.method === 'GET') {
    if (action === 'invites' || action === '') {
      const { data, error } = await supa.from('laundromat_members')
        .select('id, laundromat_id, member_role, invite_status, created_at, laundromats(id, name, logo_path)')
        .eq('user_id', ctx.user.id)
        .eq('invite_status', 'pending')
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json(errorEnvelope(error));
      return res.status(200).json(successEnvelope(data || []));
    }
    return res.status(200).json(successEnvelope({ service: 'staff', ok: true }));
  }

  if (req.method === 'POST') {
    if (action === 'respond') {
      const input = body(req);
      const decision = String(input.decision || '').toLowerCase();
      if (!['accept', 'decline'].includes(decision)) {
        return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'decision must be accept or decline')));
      }
      if (!input.member_id) {
        return res.status(400).json(errorEnvelope(new ApiError('VALIDATION_ERROR', 'member_id is required')));
      }
      const { data: member } = await supa.from('laundromat_members')
        .select('id, laundromat_id, user_id, member_role, invite_status')
        .eq('id', input.member_id)
        .eq('user_id', ctx.user.id)
        .eq('invite_status', 'pending')
        .maybeSingle();
      if (!member) return res.status(404).json(errorEnvelope(new ApiError('NOT_FOUND', 'Invitation not found', 404)));

      if (decision === 'decline') {
        await supa.from('laundromat_members').delete().eq('id', member.id);
        return res.status(200).json(successEnvelope({ accepted: false }));
      }

      await supa.from('laundromat_members')
        .update({ invite_status: 'active' })
        .eq('id', member.id);
      await supa.from('user_roles')
        .upsert({ user_id: ctx.user.id, role: 'staff' }, { onConflict: 'user_id,role', ignoreDuplicates: true });

      const { data: biz } = await supa.from('laundromats')
        .select('name, owner_id').eq('id', member.laundromat_id).maybeSingle();
      if (biz && biz.owner_id) {
        await notifyUser(supa, biz.owner_id, {
          type: 'staff_accepted',
          title: 'Invitation accepted',
          body: `${ctx.user.email || 'A team member'} accepted your invitation to ${biz.name}.`,
          url: 'apps/owner/pages/settings.html',
        });
      }
      return res.status(200).json(successEnvelope({ accepted: true }));
    }
    return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
  }

  return res.status(405).json(errorEnvelope(new ApiError('METHOD_NOT_ALLOWED', 'Method not allowed', 405)));
});
