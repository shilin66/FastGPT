import { AdminAPI, allowAdminMethods } from '@/service/middleware/entry';
import { getAdminContext } from '@/service/auth';

export default AdminAPI(allowAdminMethods('GET'), async (req) => {
  const session = await getAdminContext(req);
  return { userId: session.userId, username: 'root' };
});
