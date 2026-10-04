import "dotenv/config";
import fs from "fs";
import { PDFParse } from "pdf-parse";
import { GoogleGenerativeAI, GoogleGenerativeAIError } from "@google/generative-ai";
import { Pinecone } from '@pinecone-database/pinecone'
import { fileURLToPath } from 'url';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function askGemini(userMessage: string): Promise<string> {
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" })
    const result = await model.generateContentStream(userMessage);
    let finalText: string = "";
    for await (const chunk of result.stream) {
        const contextChunk = chunk.text();
        finalText += contextChunk;
    }
    const finalResponse = await result.response;
    console.log("usage:", finalResponse.usageMetadata);
    return finalText;
}

async function getEmbeddings(text: string) {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await model.embedContent(text);
    return result.embedding.values;
}

interface Chunk {
    id: string;
    text: string;
    startIndex: number;
}

function chunkText(
    text: string,
    chunkSize: number = 500,
    overlap: number = 100,
): Chunk[] {
    let curr = 0;
    const chunks: Chunk[] = [];
    while (curr < text.length) {
        const tenEnd = Math.min(curr + chunkSize, text.length);
        const boundary = text.lastIndexOf(".", tenEnd);

        let end: number;
        if (boundary > curr && boundary - curr >= chunkSize / 2) {
            end = boundary + 1;
        } else {
            end = tenEnd;
        }

        const chunkStr = text.slice(curr, end);
        const newChunk: Chunk = {
            id: `chunk-${chunks.length}`,
            text: chunkStr,
            startIndex: curr,
        }
        chunks.push(newChunk);
        if (tenEnd >= text.length) {
            break;
        }
        const nextCurr = end - overlap;
        curr = nextCurr > curr ? nextCurr : end;
    }
    return chunks;
}

function cleanExtractedText(text: string): string {
    return text
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n(?=[a-z])/g, " ")
        .trim();
}

function removeRepeatedLines(text: string): string {
    const lines = text.split("\n");
    const counts = new Map<string, number>();
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
        }
    }
    return lines
        .filter((line) => {
            const trimmed = line.trim();
            const count = counts.get(trimmed) ?? 0;
            return !(trimmed.length < 60 && count >= 3);
        })
        .join("\n");
}

async function extractTextFromPDF(filePath: string): Promise<string> {
    const dataBuffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: dataBuffer });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
}

function buildRagPrompt(question: string, contextChunks: string[]): string {
    const context = contextChunks.join("\n\n---\n\n");
    return `You are a study companion which helps the user to find out his queries from thier document. so answer from the given context only
  not from outside knowledge,so if the answer is not in the context give answer as "not found in the document"
  context:${context},
  question:${question},
  answer`
}

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pc.index("study-companion");

// Reusable ingestion: chunk a PDF, embed each chunk, upsert into Pinecone
// tagged with documentId so queries can later be scoped to specific docs.
export async function ingestDocument(filePath: string, documentId: string, docName: string) {
    const text = removeRepeatedLines(cleanExtractedText(await extractTextFromPDF(filePath)));
    const chunks = chunkText(text);

    const vectors = await Promise.all(
        chunks.map(async (chunk) => ({
            id: `${documentId}-${chunk.id}`,
            values: await getEmbeddings(chunk.text),
            metadata: {
                text: chunk.text,
                documentId: documentId,
                docName: docName,
            },
        }))
    );

    await index.upsert({ records: vectors });
    return chunks.length;
}

export async function answerFromDocument(
    question: string,
    documentIds: string[]
) {
    const embeddings = await getEmbeddings(question);
    const result = await index.query({
        vector: embeddings,
        topK: 4,
        includeMetadata: true,
        filter: {
            documentId: { $in: documentIds },
        },
    });

    const contextChunks = result.matches
        .map((match) => match.metadata?.text as string)
        .filter(Boolean);

    const citations = result.matches.map((match) => ({
        docName: match.metadata?.docName as string,
    }));

    const prompt = buildRagPrompt(question, contextChunks);
    const answer = await askGemini(prompt);

    return { answer, citations };
}

// Kept as a manual CLI test harness — not used by the server.
async function main() {
    try {
        await ingestDocument('./database_indexing.pdf', 'database_indexing', 'database_indexing.pdf');
        console.log("Ingested test document");
        const result = await answerFromDocument("Tell me about indexing", ["database_indexing"]);
        console.log(result);
    } catch (error) {
        if (error instanceof GoogleGenerativeAIError) {
            console.log("gemini api error", error.message)
        } else {
            throw error;
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}