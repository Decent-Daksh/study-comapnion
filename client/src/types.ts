// src/types.ts
import { z } from 'zod';

export const DocumentMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['processing', 'ready', 'failed']),
  pages: z.number().optional(),
});
export const CitationSchema = z.object({
  docName: z.string(),
  page: z.number().optional(),
});

export const AskResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(CitationSchema),
});
export const ChatMessageSchema = z.object({
    id : z.string(),
    role: z.enum(['user','assistant']),
    content: z.string(),
    citations : z.array(CitationSchema).optional()
})

export type Citation = z.infer<typeof CitationSchema>;
export type AskResponse = z.infer<typeof AskResponseSchema>;

export type DocumentMeta = z.infer<typeof DocumentMetaSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;