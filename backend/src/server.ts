import express from 'express';
import cors from 'cors';
import {answerFromDocument} from './index.js';

const app = express();
app.use(cors());
app.use(express.json());
app.post('/api/ask', async (req,res)=>{
    const {question} = req.body;
    if (!question || typeof question !== 'string'){
        return res.status(400).json({error: 'question is required and should be a string'});
    }
    try{
        const answer = await answerFromDocument(question);
        res.json({answer});
    }catch(err){
        console.error(err);
        res.status(500).json({error: ' Something went wrong while processing your request'});

    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
    console.log(`Server is running on port ${PORT}`);
});