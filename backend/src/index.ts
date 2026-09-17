import "dotenv/config";
import fs from "fs";
import { PDFParse } from "pdf-parse";
import { GoogleGenerativeAI, GoogleGenerativeAIError } from "@google/generative-ai";
import {Pinecone} from '@pinecone-database/pinecone'
import { fileURLToPath } from 'url';
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const text1= "The cat sat on the mat";
const text2 = "A feline rested on the rug";
const text3 = "Stock prices fell sharply today";


 

async function askGemini(userMessage: string):Promise<string>{
    const model = genAI.getGenerativeModel({model:"gemini-3.6-flash"})
    const result = await model.generateContentStream(userMessage);
    let finalText:string ="";
    for await(const chunk of result.stream){
       // process.stdout.write(chunk.text());
       const contextChunk = chunk.text();
       finalText += contextChunk;
       
    }

    const finalResponse = await result.response;
    console.log("usage:", finalResponse.usageMetadata);
    return finalText;

} 

async function getEmbeddings(text:string){
    const model = genAI.getGenerativeModel({model:"gemini-embedding-001"});
    const result = await model.embedContent(text);
    return result.embedding.values;
}

function cosineSimilarity(a:number[],b:number[]): number{
    const dotProduct = a.reduce((sum,val,i)=> sum + val*(b[i]??0),0);
    const magnitudeA = Math.sqrt(a.reduce((sum,val)=>sum + val*val,0));
    const magnitudeB = Math.sqrt(b.reduce((sum,val)=>sum + val*val,0));
    return dotProduct/(magnitudeA*magnitudeB);
}

interface Chunk{
    id:string;
    text:string;
    startIndex:number;

}

function chunkText(
    text: string,
    chunkSize: number = 500,
    overlap: number =100,

): Chunk[] {
  let curr = 0;
  const chunks:Chunk[]=[];
  while(curr<text.length){
    const tenEnd = Math.min(curr+chunkSize, text.length);
    const boundary = text.lastIndexOf(".",tenEnd);

    let end:number;
    if(boundary > curr && boundary - curr >= chunkSize / 2){
        end =boundary+1;
    }else{
        end =tenEnd;
    }

    const chunkStr = text.slice(curr , end);
    const newChunk: Chunk ={
        id:`chunk-${chunks.length}`,
        text:chunkStr,
        startIndex:curr,
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
function readTextFile(filePath: string): string {
  return fs.readFileSync(filePath, "utf-8");
}

async function extractTextFromPDF(filePath: string): Promise<string> {
  const dataBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: dataBuffer });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}
async function testQuery(question: string) {
  const queryEmbedding = await getEmbeddings(question);

  const results = await index.query({
    vector: queryEmbedding,
    topK: 3,
    includeMetadata: true,
  });


  console.log(`\nQuery: "${question}"`);
  results.matches.forEach((match, i) => {
    console.log(`\n--- Match ${i + 1} (score: ${match.score?.toFixed(4)}) ---`);
    console.log(match.metadata?.text);
  });
}
function buildRagPrompt(question:string ,contextChunks:string[]): string{
  const context = contextChunks.join("\n\n---\n\n");
  return `You are a study companion which helps the user to find out his queries from thier document. so answer from the given context only
  not from outside knowledge,so if the answer is not in the context give answer as "not found in the document"
  context:${context},
  question:${question},
  answer`
}
export async function answerFromDocument(question:string){
  const embeddings= await getEmbeddings(question);
  const result = await index.query({
    vector: embeddings,
    topK: 4,
    includeMetadata: true,
  });
  const contextChunks =  result.matches
    .map((match)=> match.metadata?.text as string)
    .filter(Boolean);
  
  const prompt = buildRagPrompt(question,contextChunks)
  const answer = await askGemini(prompt);
  return answer;
}

const pc = new Pinecone({apiKey: process.env.PINECONE_API_KEY!});
const index = pc.index("study-companion");

async function main(){
    try{
        // const result = chunkText(paragraph,200, 40);
        // console.log(JSON.stringify(result,null,2));
        const text = removeRepeatedLines(cleanExtractedText(await extractTextFromPDF('./database_indexing.pdf')));
        const chunks = chunkText(text);
        console.log("Clearing existing vectors in namespace...");
        await index.deleteAll();
        const vectors = await Promise.all(
            chunks.map(async (chunk)=>({
                id:chunk.id,
                values: await getEmbeddings(chunk.text),
                metadata:{
                    text:chunk.text,
                    source:"database_indexing"
                }
            }))
        );
        await index.upsert({ records:vectors});
        console.log(`Upserted ${vectors.length} vectors`);

        answerFromDocument("Tell me about indexing");

        // // confirm they actually landed
        // const stats = await index.describeIndexStats();
        // console.log("Index stats:", stats);

        // now actually test retrieval
        // await testQuery("What's the difference between clustered and non-clustered indexes?");
        // await testQuery("Why can't hash indexes support range queries?");
        // await testQuery("What's the trade-off with adding more indexes to a table?");

        // const [embed1,embed2,embed3] = await Promise.all(
        //     [getEmbeddings(text1),
        //      getEmbeddings(text2),
        //      getEmbeddings(text3)
        //     ]);
        //     console.log(embed1.length)
        

        // const score1 = cosineSimilarity(embed1,embed2);
        // const score2 = cosineSimilarity(embed1,embed3);
        // const score3 = cosineSimilarity(embed2, embed3);

        // console.log("score_1:",score1);
        // console.log("score_2:",score2);
        // console.log("score_3:",score3);
        // await askGemini("explain me typescript ,in 3 sentences");
        
    }
    catch(error){
        if(error instanceof GoogleGenerativeAIError){
            console.log("gemini api error", error.message)
        }else{
            throw error;
        }
    }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
} 