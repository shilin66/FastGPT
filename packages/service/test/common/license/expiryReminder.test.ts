import { describe, expect, it } from 'vitest';
import { getLicenseExpiryStage } from '@fastgpt/global/common/system/licenseExpiry';

describe('license expiry reminder stages', () => {
  const now = Date.parse('2026-10-13T10:00:00.000Z');
  const day = 24 * 60 * 60 * 1000;
  it.each([
    [31, null],
    [30, 30],
    [29, 30],
    [15.01, 30],
    [15, 15],
    [10, 15],
    [7.01, 15],
    [7, 7],
    [5, 7],
    [0.1, 7],
    [0, null],
    [-1, null]
  ])('uses the current stage when %s days remain', (days, stage) => {
    expect(getLicenseExpiryStage(new Date(now + days * day).toISOString(), now)).toBe(stage);
  });
  it.each(['', 'invalid', '2026-10-20', '2026-10-20T10:00:00'])(
    'ignores ambiguous dates: %s',
    (expiresAt) => {
      expect(getLicenseExpiryStage(expiresAt, now)).toBeNull();
    }
  );
  it('treats equivalent timestamps in different timezones identically', () => {
    expect(getLicenseExpiryStage('2026-10-20T18:00:00+08:00', now)).toBe(7);
  });
});
