import z from 'zod';

export const licenseExpiryStages = [30, 15, 7] as const;
export const licenseRenewedSystemMessage = '## Welcome To OmniCockpit🎉';
export const licenseExpiryDayMs = 24 * 60 * 60 * 1000;

export const LicenseExpiryMetadataSchema = z.object({
  id: z.string().min(1),
  expiresAt: z.iso.datetime({ offset: true })
});
export type LicenseExpiryMetadata = z.infer<typeof LicenseExpiryMetadataSchema>;

export const LicenseExpiryReminderConfigSchema = z.object({
  enabled: z.boolean(),
  templates: z.object({
    '30': z.string().max(10000).optional(),
    '15': z.string().max(10000).optional(),
    '7': z.string().max(10000).optional()
  })
});
export type LicenseExpiryReminderConfig = z.infer<typeof LicenseExpiryReminderConfigSchema>;

export const LicenseExpiryNoticeSchema = z.object({
  id: z.string(),
  stage: z.union([z.literal(30), z.literal(15), z.literal(7)]),
  expiresAt: z.iso.datetime({ offset: true }),
  serverNow: z.iso.datetime({ offset: true }),
  remainingDays: z.number().int().positive(),
  content: z.string()
});
export type LicenseExpiryNotice = z.infer<typeof LicenseExpiryNoticeSchema>;

export type LicenseExpiryState = LicenseExpiryMetadata & { configurationId: string };

export const getLicenseExpiryStage = (expiresAt: string, now: number = Date.now()) => {
  if (!LicenseExpiryMetadataSchema.shape.expiresAt.safeParse(expiresAt).success) return null;
  const remaining = Date.parse(expiresAt) - now;
  if (remaining <= 0 || remaining > 30 * licenseExpiryDayMs) return null;
  if (remaining <= 7 * licenseExpiryDayMs) return 7;
  if (remaining <= 15 * licenseExpiryDayMs) return 15;
  return 30;
};

export const renderLicenseExpiryTemplate = (
  template: string,
  values: { expiresAt: string; remainingDays: string }
) =>
  template.replace(
    /\{\{(expiresAt|remainingDays)\}\}/g,
    (_, key: keyof typeof values) => values[key]
  );

export const formatLicenseExpiryTime = (expiresAt: string, language: string) =>
  new Intl.DateTimeFormat(language, {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'shortOffset'
  }).format(new Date(expiresAt));
