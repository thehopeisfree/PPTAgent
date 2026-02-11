import { z } from "zod";

export const PatchLayoutSchema = z
  .object({
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().positive().optional(),
    h: z.number().positive().optional(),
    zIndex: z.number().int().optional(),
  })
  .partial();

export const PatchStyleSchema = z
  .object({
    fontSize: z.number().positive().optional(),
    lineHeight: z.number().positive().optional(),
    backgroundColor: z.string().optional(),
    color: z.string().optional(),
    fontWeight: z.union([z.string(), z.number()]).optional(),
    fontFamily: z.string().optional(),
    textAlign: z.string().optional(),
    borderRadius: z.number().optional(),
    opacity: z.number().min(0).max(1).optional(),
    objectFit: z.string().optional(),
  })
  .passthrough()
  .optional();

export const PatchEditSchema = z.object({
  eid: z.string().min(1),
  layout: PatchLayoutSchema.optional(),
  style: PatchStyleSchema.optional(),
});
export type PatchEdit = z.infer<typeof PatchEditSchema>;

export const PatchDocumentSchema = z.object({
  edits: z.array(PatchEditSchema).min(1),
  constraints: z
    .object({
      no_add_remove: z.boolean().optional(),
    })
    .optional(),
});
export type PatchDocument = z.infer<typeof PatchDocumentSchema>;

/** Parse and validate a patch document. Throws ZodError on invalid input. */
export function parsePatch(data: unknown): PatchDocument {
  return PatchDocumentSchema.parse(data);
}
