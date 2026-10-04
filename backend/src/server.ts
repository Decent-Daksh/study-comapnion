import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { answerFromDocument, ingestDocument } from './index.js';

const app = express();
app.use(cors({
  origin: ['study-comapnion.vercel.app', 'http://localhost:5173'],
}));
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// In-memory for now — swap for a real DB later if you want uploads to
// survive a server restart.
interface DocRecord {
  id: string;
  name: string;
  status: 'processing' | 'ready' | 'failed';
  pages?: number;
}
const documents: DocRecord[] = [];

app.get('/api/documents', (req, res) => {
  res.json(documents);
});

app.post('/api/documents', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'file is required' });
  }

  const documentId = randomUUID();
  const docName = req.file.originalname;

  const record: DocRecord = { id: documentId, name: docName, status: 'processing' };
  documents.push(record);

  // Respond immediately with "processing" so the upload request doesn't
  // hang for however long ingestion takes — ingestion continues in the
  // background and updates the same record in place.
  res.status(202).json(record);

  try {
    const chunkCount = await ingestDocument(req.file.path, documentId, docName);
    record.status = 'ready';
    record.pages = chunkCount;
  } catch (err) {
    console.error(err);
    record.status = 'failed';
  }
});

app.post('/api/ask', async (req, res) => {
  const { question, documentIds } = req.body;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'question is required and should be a string' });
  }
  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return res.status(400).json({ error: 'documentIds is required and should be a non-empty array' });
  }

  try {
    const result = await answerFromDocument(question, documentIds);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong while processing your request' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});