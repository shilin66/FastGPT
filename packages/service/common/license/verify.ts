import axios from 'axios';
import { addLog } from '../system/log';
import { localCacheManager } from '../../support/globalCache/cache';
import { getErrText } from '@fastgpt/global/common/error/utils';
import jwt from 'jsonwebtoken';

const CACHE_TTL = 1000 * 60 * 60 * 24 * 7;

export const initValidLicense = async (
  dbLicense: { licenseKey: string; licenseServer: string; clientId: string },
  fileLicense: { licenseKey: string; licenseServer: string; clientId: string }
) => {
  const verifyLicenseSource = async (
    license: { licenseKey: string; licenseServer: string; clientId: string },
    source: string
  ): Promise<{ isValid: boolean; error?: string }> => {
    try {
      addLog.info(`Verifying license from ${source}`);
      await fetchLicense(license.licenseKey, license.licenseServer, license.clientId);
      addLog.info(`License from [${source}] verification successful`);
      return { isValid: true };
    } catch (error) {
      addLog.info(`License from [${source}] verification failed!`);
      return {
        isValid: false,
        error: getErrText(error)
      };
    }
  };

  const [dbResult, fileResult] = await Promise.all([
    verifyLicenseSource(dbLicense, 'db'),
    verifyLicenseSource(fileLicense, 'localFile config.json')
  ]);

  if (dbResult.isValid) {
    return dbLicense;
  } else if (fileResult.isValid) {
    return fileLicense;
  } else {
    return Promise.reject(
      `[ERROR] License validation failed for both sources 【db】and 【localFile config.json】`
    );
  }
};

export const verifyLocalFileLicense = async (
  licenseKey?: string,
  licenseServer?: string,
  clientId?: string
) => {
  if (!licenseServer) {
    addLog.error(`licenseServer in config.json is not set`);
    return Promise.reject(`licenseServer in config.json is not set`);
  }
  if (!licenseKey) {
    addLog.error(`licenseKey in config.json is not set`);
    return Promise.reject(`licenseKey in config.json is not set`);
  }
  if (!clientId) {
    addLog.error(`clientId in config.json is not set`);
    return Promise.reject(`clientId in config.json is not set`);
  }

  return await verifyLicense(licenseKey, licenseServer, clientId);
};

export const verifyDbLicense = async () => {
  const { licenseKey, licenseServer, clientId } = getLicenseConfig();
  if (!licenseServer) {
    addLog.error(`licenseServer in db is not set`);
    return Promise.reject(`licenseServer in db is not set`);
  }
  if (!licenseKey) {
    addLog.error(`licenseKey in db is not set`);
    return Promise.reject(`licenseKey in db is not set`);
  }
  if (!clientId) {
    addLog.error(`licenseKey clientId in db is not set`);
    return Promise.reject(`licenseKey clientId in db is not set`);
  }

  return await verifyLicense(licenseKey, licenseServer, clientId);
};

const verifyLicense = async (licenseKey: string, licenseServer: string, clientId: string) => {
  const token = localCacheManager.get(clientId);
  if (token) {
    try {
      const decoded: any = jwt.verify(token, licenseKey, { algorithms: ['RS256'] });
      if (decoded.clientId === clientId) {
        return Promise.resolve();
      }
    } catch (e) {
      addLog.error(`License JWT cache verification failed: ${getErrText(e)}`);
    }
  }

  const result = await fetchLicense(licenseKey, licenseServer, clientId);
  localCacheManager.set(clientId, result.token, CACHE_TTL);
  return Promise.resolve();
};

export const checkCacheLicense = async () => {
  const { licenseKey, licenseServer, clientId } = getLicenseConfig();
  if (!licenseServer || !licenseKey || !clientId) {
    addLog.error(`License verification failed: licenseServer or licenseKey or clientId is not set`);
    localCacheManager.delete(clientId);
    return;
  }
  try {
    const { token } = await fetchLicense(licenseKey, licenseServer, clientId);
    addLog.info(`License verification successful`);
    localCacheManager.set(clientId, token, CACHE_TTL);
  } catch (error) {
    localCacheManager.delete(clientId);
  }
  return;
};

const fetchLicense = async (licenseKey: string, licenseServer: string, clientId: string) => {
  try {
    const { data } = await axios.post(
      `${licenseServer}/api/license/verify`,
      { clientId },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );
    if (!data.valid) {
      addLog.error(`License verification failed: valid is false`);
      return Promise.reject(`License verification failed: valid is false`);
    }
    const decoded: any = jwt.verify(data.token, licenseKey, { algorithms: ['RS256'] });
    if (decoded.clientId !== clientId) {
      addLog.error(`License verification failed: client is not matched!`);
      return Promise.reject(`License verification failed: client is not matched!`);
    }

    return {
      token: data.token
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      const { status, data } = error.response;
      addLog.error(`License API Error [${status}] : ${data.error || JSON.stringify(data)}`);
      return Promise.reject(
        `License API Error [${status}] : ${data.error || JSON.stringify(data)}`
      );
    }
    const errMsg = getErrText(error);
    addLog.error(`License verification failed: ${errMsg}`);
    return Promise.reject(`License verification failed: ${errMsg}`);
  }
};

const getLicenseConfig = () => {
  const licenseServer = global.licenseData?.licenseServer || '';
  const licenseKey = global.licenseData?.licenseKey || '';
  const clientId = global.licenseData?.clientId || '';
  return {
    licenseServer,
    licenseKey,
    clientId
  };
};
