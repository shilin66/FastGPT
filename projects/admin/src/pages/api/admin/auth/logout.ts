import { AdminAPI } from '@/service/middleware/entry';
import { clearAdminCookie, getAdminContext } from '@/service/auth';
import { delUserSession } from '@fastgpt/service/support/user/session';

export default AdminAPI(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const admin = await getAdminContext(req);
  await delUserSession(admin.sessionId);
  clearAdminCookie(res);
  return {};
});
