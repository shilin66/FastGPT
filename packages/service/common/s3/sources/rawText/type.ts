import z from 'zod';

export const AddRawTextBufferParamsSchema = z.object({
  customPdfParse: z.string().optional(),
  sourceId: z.string().nonempty(),
  sourceName: z.string().nonempty(),
  text: z.string()
});
export type AddRawTextBufferParams = z.input<typeof AddRawTextBufferParamsSchema>;
export type GetRawTextBufferParams = Pick<AddRawTextBufferParams, 'customPdfParse' | 'sourceId'>;
