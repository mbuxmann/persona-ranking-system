import { z } from "zod";

/**
 * Input for listing leads with optional upload filter
 */
export const leadsListInputSchema = z
  .object({
    uploadId: z.uuid().optional(),
  })
  .optional();

/**
 * Input for exporting top N leads per company
 */
export const exportLeadsInputSchema = z.object({
  topN: z.number().int().finite().min(1).max(100).default(3),
});

export type LeadsListInput = z.infer<typeof leadsListInputSchema>;
export type ExportLeadsInput = z.infer<typeof exportLeadsInputSchema>;
