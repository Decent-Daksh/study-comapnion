import { useState, useEffect } from 'react'
import './index.css'
import type { DocumentMeta, ChatMessage } from './types';
import { uploadDocument, askQuestion, listDocuments } from './api';

function App() {
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    const hasProcessing = documents.some((doc) => doc.status === 'processing');
    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const fresh = await listDocuments();
        setDocuments((prev) =>
          prev.map((doc) => {
            const match = fresh.find((f) => f.id === doc.id);
            return match ? match : doc;
          })
        );
      } catch (err) {
        console.error('Polling failed', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [documents]);

  function handlefileChosen(files: FileList) {
    const fileArray = Array.from(files);
    const newDocs: DocumentMeta[] = fileArray.map(file => ({
      id: crypto.randomUUID(),
      name: file.name,
      status: 'processing',
    }));
    setDocuments(prev => [...prev, ...newDocs]);
    fileArray.forEach((file, i) => {
      const tempId = newDocs[i].id;
      uploadDocument(file)
        .then(realDoc => {
          setDocuments(prev => prev.map(doc => (doc.id === tempId ? { ...realDoc } : doc)));
        })
        .catch(() => {
          setDocuments(prev => prev.map(doc => doc.id === tempId ? { ...doc, status: 'failed' } : doc));
        });
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleAsk(question: string) {
    if (selectedIds.size === 0) return;
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setIsAsking(true);
    try {
      const res = await askQuestion(question, Array.from(selectedIds));
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant', content: res.answer, citations: res.citations,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'assistant', content: 'Something went wrong answering that — try again.',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAsking(false);
    }
  }

  const readyDocs = documents.filter(d => d.status === 'ready');

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">Daxwell</h1>
        <p className="app__subtitle">Upload your readings, check out the ones you need, and ask.</p>
      </header>

      <div className="app__body">
        <aside className="shelf">
          <div className="dropzone">
            <p className="dropzone__prompt">Drop notes, slides, or readings here</p>
            <label className="dropzone__button">
              Choose files
              <input
                type="file"
                multiple
                accept=".pdf"
                hidden
                onChange={(e) => {
                  if (e.target.files) handlefileChosen(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="shelf__heading">ON THE SHELF — {documents.length}</div>

          {documents.length === 0 ? (
            <p className="shelf__empty">Nothing here yet. Upload a document to start building your reading list.</p>
          ) : (
            <ul className="doclist">
              {documents.map((doc) => (
                <li key={doc.id} className="doccard">
                  <span className={`stamp stamp--${doc.status}`}>
                    {doc.status === 'ready' ? 'indexed' : doc.status === 'processing' ? 'reading…' : 'failed'}
                  </span>
                  <input
                    type="checkbox"
                    className="doccard__check"
                    checked={selectedIds.has(doc.id)}
                    disabled={doc.status !== 'ready'}
                    onChange={() => toggleSelect(doc.id)}
                    aria-label={`Include ${doc.name} in the question scope`}
                  />
                  <div className="doccard__body">
                    <div className="doccard__name">{doc.name}</div>
                    <div className="doccard__meta">{doc.pages ? `${doc.pages} chunks` : '—'}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="chat">
          <div className="chat__scope">
            {selectedIds.size === 0
              ? 'Check out a document from the shelf to start asking questions.'
              : <>Asking <strong>{selectedIds.size}</strong> of {readyDocs.length} indexed documents</>}
          </div>

          <div className="chat__thread">
            {messages.length === 0 && !isAsking && (
              <div className="chat__empty">
                <h2>Nothing asked yet</h2>
                <p>Pick a document and ask something specific about it.</p>
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg.id} className={`bubble bubble--${msg.role}`}>
                <div className="bubble__text">{msg.content}</div>
                {msg.citations && msg.citations.length > 0 && (
                  <div className="citations">
                    {msg.citations.map((c, i) => (
                      <span className="citation" key={i}>{c.docName}{c.page ? `, p.${c.page}` : ''}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isAsking && (
              <div className="bubble bubble--assistant bubble--thinking">
                <div className="bubble__text">thinking…</div>
              </div>
            )}
          </div>

          <div className="chat__composer">
            {selectedIds.size === 0 && <span className="chat__hint">Select at least one document to ask a question.</span>}
            <div className="chat__inputrow">
              <input
                className="chat__input"
                value={draft}
                disabled={isAsking}
                placeholder="Ask something about your documents…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && draft.trim() && selectedIds.size > 0) {
                    handleAsk(draft);
                    setDraft('');
                  }
                }}
              />
              <button
                className="chat__send"
                disabled={isAsking || !draft.trim() || selectedIds.size === 0}
                onClick={() => {
                  handleAsk(draft);
                  setDraft('');
                }}
              >
                Ask
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default App