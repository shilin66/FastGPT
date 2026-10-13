import type { NextApiRequest } from 'next';
import type { ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { parseHeaderCert } from '@fastgpt/service/support/permission/auth/common';
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import {
  getLicenseConfigurationId,
  getLicenseExpiryMetadata
} from '@fastgpt/service/common/license/verify';
import { MongoSystemMsg } from '@fastgpt/service/support/user/inform/schema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { createHash } from 'node:crypto';
import {
  getLicenseExpiryStage,
  licenseExpiryDayMs,
  licenseRenewedSystemMessage,
  type LicenseExpiryNotice
} from '@fastgpt/global/common/system/licenseExpiry';

async function handler(req: NextApiRequest, res: ApiResponseType<LicenseExpiryNotice | null>) {
  res.setHeader('Cache-Control', 'private, no-store');
  await parseHeaderCert({ req, authToken: true });
  const { licenseData } = await getFastGPTConfigFromDB();
  if (!licenseData) return null;
  // This endpoint is optional: authorization-service failures must not block the UI.
  let metadata = await getLicenseExpiryMetadata(licenseData).catch(() => null);
  if (!metadata) return null;

  const configurationId = getLicenseConfigurationId(licenseData);
  let message = await MongoSystemMsg.findOne().sort({ _id: -1 }).lean();
  if (!message) {
    // An indexed, deterministic _id makes concurrent first reads share one document.
    message = await MongoSystemMsg.findOneAndUpdate(
      { _id: createHash('sha256').update('license-system-message').digest('hex').slice(0, 24) },
      { $setOnInsert: { id: getNanoid(), content: licenseRenewedSystemMessage } },
      { upsert: true, new: true }
    ).lean();
  }
  if (!message) return null;
  const previous = message.licenseExpiryState;
  const sameLicense = previous?.configurationId === configurationId && previous.id === metadata.id;
  if (sameLicense && Date.parse(previous.expiresAt) > Date.parse(metadata.expiresAt)) {
    // Another instance may already have observed renewal while this instance cached the old date.
    metadata = await getLicenseExpiryMetadata(licenseData, { forceRefresh: true }).catch(
      () => null
    );
    if (!metadata) return null;
  }
  const state = { ...metadata, configurationId };
  if (!previous) {
    await MongoSystemMsg.updateOne(
      { _id: message._id, licenseExpiryState: { $exists: false } },
      { $set: { licenseExpiryState: state } }
    );
  } else if (
    previous.configurationId !== configurationId ||
    previous.id !== metadata.id ||
    Date.parse(metadata.expiresAt) > Date.parse(previous.expiresAt)
  ) {
    const renewed =
      previous.configurationId === configurationId &&
      previous.id === metadata.id &&
      Date.parse(metadata.expiresAt) > Date.parse(previous.expiresAt);
    // Compare-and-set prevents concurrent users/instances from resetting the announcement twice.
    await MongoSystemMsg.updateOne(
      {
        _id: message._id,
        'licenseExpiryState.configurationId': previous.configurationId,
        'licenseExpiryState.id': previous.id,
        'licenseExpiryState.expiresAt': previous.expiresAt
      },
      {
        $set: {
          licenseExpiryState: state,
          ...(renewed ? { content: licenseRenewedSystemMessage, id: getNanoid() } : {})
        }
      }
    );
  }

  const now = Date.now();
  const stage = getLicenseExpiryStage(metadata.expiresAt, now);
  if (!stage || message?.licenseExpiryReminder?.enabled === false) return null;
  return {
    id: createHash('sha256')
      .update(JSON.stringify([configurationId, metadata.id, metadata.expiresAt, stage]))
      .digest('hex'),
    stage,
    expiresAt: metadata.expiresAt,
    serverNow: new Date(now).toISOString(),
    remainingDays: Math.ceil((Date.parse(metadata.expiresAt) - now) / licenseExpiryDayMs),
    content: message?.licenseExpiryReminder?.templates?.[stage] || ''
  };
}

export default NextAPI(handler);
