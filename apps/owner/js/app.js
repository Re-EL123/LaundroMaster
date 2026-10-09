import { guard } from '../../../shared/js/guard.js';
import { mountSignOut } from '../../../shared/js/session.js';

guard(['owner', 'staff', 'admin', 'super_admin']).then((u) => {
  if (u) mountSignOut(document.getElementById('sessionMount'));
});
