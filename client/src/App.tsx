import { useState } from 'react'

import './App.css'

function App() {
  const [question , setQuestion] = useState("");
  const [answer , setAnswer] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function handleAsk(){
    setStatus('loading');
    setAnswer('');
    try{
      const res = await fetch('/api/ask',{
      method: 'POST',
      headers :{'Content-Type':'application/json'},
      body : JSON.stringify({question})
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error);
      setAnswer(data.answer);
      setStatus('idle');

    }catch(err){
      setStatus('error');
    }

  }

  return (
    
    <div>
      <input value ={question} placeholder="...ask your questions" onChange={(e)=>setQuestion(e.target.value)}/>
      <button onClick={handleAsk} disabled={status==='loading'}>ASK</button>
      {status==='error'&& <p>Something went wrong</p>}
      {status ==='loading' &&<p>Loading...</p>}
      {answer && <p>{answer}</p>}

    </div>
      
    
  )
}

export default App
