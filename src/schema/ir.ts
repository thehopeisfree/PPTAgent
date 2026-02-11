import { z } from "zod";
import { DEFAULT_Z_INDEX } from "../constants.js";

export const ElementType = z.enum([
  "title",
  "bullets",
  "image",
  "text",
  "decoration",
]);
export type ElementType = z.infer<typeof ElementType>;

export const LayoutSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  zIndex: z.number().int().default(DEFAULT_Z_INDEX),
});
export type Layout = z.infer<typeof LayoutSchema>;

export const StyleSchema = z
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
  .passthrough();
export type Style = z.infer<typeof StyleSchema>;

export const IRElementSchema = z.object({
  eid: z.string().min(1),
  type: ElementType,
  priority: z.number().int().min(0).max(100),
  content: z.string(),
  layout: LayoutSchema,
  style: StyleSchema.default({}),
  group: z.string().optional(),
});
export type IRElement = z.infer<typeof IRElementSchema>;

export const SlideSchema = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
});

export const IRDocumentSchema = z
  .object({
    slide: SlideSchema,
    elements: z.array(IRElementSchema).min(1),
  })
  .refine(
    (doc) => {
      const eids = doc.elements.map((e) => e.eid);
      return new Set(eids).size === eids.length;
    },
    { message: "Duplicate eid found in elements" }
  );
export type IRDocument = z.infer<typeof IRDocumentSchema>;

/** Parse and validate an IR document. Throws ZodError on invalid input. */
export function parseIR(data: unknown): IRDocument {
  return IRDocumentSchema.parse(data);
}
