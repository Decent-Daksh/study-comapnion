import { DocumentMetaSchema, AskResponseSchema, type AskResponse, type DocumentMeta } from './types';

export async function listDocuments(): Promise<DocumentMeta[]> {
  const res = await fetch('/api/documents');
  if (!res.ok) throw new Error('Failed to list documents');
  const data = await res.json();
  return DocumentMetaSchema.array().parse(data);
}

export async function uploadDocument(file: File): Promise<DocumentMeta> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch('/api/documents', {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Upload failed for ${file.name}`);
  }

  const data = await res.json();
  return DocumentMetaSchema.parse(data);
}

export async function askQuestion(question: string, documentIds: string[]): Promise<AskResponse> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question, documentIds }),
  });
  if (!res.ok) {
    throw new Error('failed to send message to the assistant');
  }
  const data = await res.json();
  return AskResponseSchema.parse(data);
}