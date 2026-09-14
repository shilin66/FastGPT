import { randomBytes } from 'crypto';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import { getUserSessionKeys } from '@fastgpt/service/support/user/session';
import {
  SANDBOX_PROXY_SESSION_SECONDS,
  SandboxProxyTicketSchema,
  type SandboxProxyGrant,
  type SandboxProxyScope
} from '@fastgpt/global/core/ai/sandbox/proxy';

const PREFIX = 'sandbox-proxy:';
const unauthorized = () => Object.assign(new Error('Unauthorized'), { statusCode: 401 });
const generationKey = (userId: string) => `${PREFIX}user:${userId}`;
const ticketKey = (ticket: string) => `${PREFIX}bootstrap:${ticket}`;
const sessionKey = (session: string) => `${PREFIX}session:${session}`;
const consumeScript = `local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value`;
const issueTicketScript = `if redis.call('HGET', KEYS[1], 'userId') ~= ARGV[1]
  or redis.call('HGET', KEYS[1], 'teamId') ~= ARGV[2]
  or redis.call('HGET', KEYS[1], 'tmbId') ~= ARGV[3] then return nil end
local generation = redis.call('GET', KEYS[2]) or ARGV[4]
redis.call('SET', KEYS[2], generation, 'EX', ARGV[6])
local grant = cjson.decode(ARGV[5])
local time = redis.call('TIME')
grant.expiresAt = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000) + 60000
grant.generation = generation
redis.call('SET', KEYS[3], cjson.encode(grant), 'EX', 60)
return 1`;
const commitSessionScript = `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return nil end
local grant = cjson.decode(ARGV[2])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
if grant.expiresAt <= now then return nil end
grant.expiresAt = now + tonumber(ARGV[5])
local oldRaw = redis.call('GET', KEYS[2])
if ARGV[3] ~= '' and oldRaw then
  local valid, current = pcall(cjson.decode, oldRaw)
  local same = valid and type(current) == 'table' and type(current.expiresAt) == 'number' and current.expiresAt > now
  if same then
    for _, field in ipairs({'userId','teamId','tmbId','provider','sourceType','sourceId','sandboxId','targetPort','audience','generation','workspaceGeneration'}) do
      if current[field] ~= grant[field] then same = false; break end
    end
  end
  if same then
    grant.expiresAt = math.max(current.expiresAt, grant.expiresAt)
    redis.call('SET', KEYS[2], cjson.encode(grant), 'PX', grant.expiresAt - now)
    return {ARGV[3], grant.expiresAt}
  end
end
redis.call('SET', KEYS[3], cjson.encode(grant), 'PX', grant.expiresAt - now)
return {ARGV[4], grant.expiresAt}`;
const revokeUserScript = `redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
for i = 2, #KEYS do redis.call('DEL', KEYS[i]) end
return 1`;

const parseTicket = (raw: unknown) => {
  if (typeof raw !== 'string') return;
  try {
    const parsed = SandboxProxyTicketSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return;
  }
};

const checkTicket = async ({ raw, scope }: { raw: unknown; scope: SandboxProxyScope }) => {
  const ticket = parseTicket(raw);
  if (!ticket) throw unauthorized();
  if (
    ticket.expiresAt <= Date.now() ||
    ticket.sandboxId !== scope.sandboxId ||
    ticket.targetPort !== scope.targetPort ||
    ticket.audience !== scope.audience
  )
    throw unauthorized();
  const generation = await getGlobalRedisConnection().get(generationKey(ticket.userId));
  if (!generation || generation !== ticket.generation) throw unauthorized();
  return ticket;
};

export const issueSandboxProxyTicket = async ({
  grant,
  sessionId
}: {
  grant: SandboxProxyGrant;
  sessionId: string;
}): Promise<string> => {
  if (!sessionId) throw unauthorized();
  const redis = getGlobalRedisConnection();
  const ticket = randomBytes(32).toString('hex');
  const issued = await redis.eval(
    issueTicketScript,
    3,
    `session:${sessionId}`,
    generationKey(grant.userId),
    ticketKey(ticket),
    grant.userId,
    grant.teamId,
    grant.tmbId,
    randomBytes(32).toString('hex'),
    JSON.stringify(grant),
    SANDBOX_PROXY_SESSION_SECONDS + 60
  );
  if (issued !== 1) throw unauthorized();
  return ticket;
};

export const redeemSandboxProxyTicket = async ({
  ticket,
  existingSession,
  authorize,
  ...scope
}: SandboxProxyScope & {
  ticket: string;
  existingSession?: string;
  authorize: (grant: SandboxProxyGrant) => Promise<string>;
}): Promise<{ session: string; expiresAt: number; target: string }> => {
  if (!/^[a-f0-9]{64}$/.test(ticket)) throw unauthorized();
  const redis = getGlobalRedisConnection();
  // GET+DEL is one Redis operation, including across app workers.
  const raw = await redis.eval(consumeScript, 1, ticketKey(ticket));
  const grant = await checkTicket({ raw, scope });
  // Never extend a resource session until current membership, permission and endpoint are checked.
  const target = await authorize(grant);
  const oldSession =
    existingSession && /^[a-f0-9]{64}$/.test(existingSession) ? existingSession : '';
  const now = Date.now();
  if (grant.expiresAt <= now) throw unauthorized();
  const newSession = randomBytes(32).toString('hex');
  const committed = await redis.eval(
    commitSessionScript,
    3,
    generationKey(grant.userId),
    sessionKey(oldSession),
    sessionKey(newSession),
    grant.generation,
    JSON.stringify(grant),
    oldSession,
    newSession,
    SANDBOX_PROXY_SESSION_SECONDS * 1000
  );
  if (
    !Array.isArray(committed) ||
    typeof committed[0] !== 'string' ||
    typeof committed[1] !== 'number'
  )
    throw unauthorized();
  return { session: committed[0], expiresAt: committed[1], target };
};

export const readSandboxProxySession = async ({
  session,
  ...scope
}: SandboxProxyScope & { session: string }): Promise<SandboxProxyGrant> => {
  if (!/^[a-f0-9]{64}$/.test(session)) throw unauthorized();
  const raw = await getGlobalRedisConnection().get(sessionKey(session));
  return checkTicket({ raw, scope });
};

export const revokeSandboxProxyUser = async (userId: string): Promise<void> => {
  const sessionKeys = await getUserSessionKeys(userId);
  const revoked = await getGlobalRedisConnection().eval(
    revokeUserScript,
    sessionKeys.length + 1,
    generationKey(userId),
    ...sessionKeys,
    randomBytes(32).toString('hex'),
    SANDBOX_PROXY_SESSION_SECONDS + 60
  );
  if (revoked !== 1) throw unauthorized();
};
