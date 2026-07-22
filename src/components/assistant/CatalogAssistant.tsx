import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Bot, Loader2, MessageCircle, Send, ShieldCheck, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { answerCatalogQuestion, type CatalogAssistantSource } from '../../lib/catalogAssistant';
import { useStore } from '../../store/useStore';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  sources?: CatalogAssistantSource[];
  query?: string;
  detail?: string;
};

const INITIAL_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Hola. Puedo buscar productos, medidas, materiales y características únicamente dentro de los catálogos de Chaide. Cada respuesta incluye la página exacta de donde salió.',
};

const SUGGESTIONS = [
  '¿Qué información hay del edredón Zafiro?',
  '¿Qué colchones tienen tecnología de enfriamiento?',
  'Busca medidas para hoteles',
];

export default function CatalogAssistant() {
  const documents = useStore((state) => state.documents);
  const fetchDocuments = useStore((state) => state.fetchDocuments);
  const hasLoadedDocs = useStore((state) => state.hasLoadedDocs);
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [isThinking, setIsThinking] = useState(false);
  const [progress, setProgress] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  const currentCatalogId = useMemo(() => {
    const match = location.pathname.match(/^\/viewer\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }, [location.pathname]);

  useEffect(() => {
    if (isOpen && !hasLoadedDocs) void fetchDocuments();
  }, [fetchDocuments, hasLoadedDocs, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isThinking, progress]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen]);

  const submitQuestion = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || isThinking) return;
    setInput('');
    setMessages((previous) => [...previous, {
      id: crypto.randomUUID(),
      role: 'user',
      text: question,
    }]);
    setIsThinking(true);
    setProgress('Consultando los índices de los catálogos…');

    try {
      if (!useStore.getState().hasLoadedDocs) await fetchDocuments();
      const availableDocuments = useStore.getState().documents;
      const answer = await answerCatalogQuestion(
        question,
        availableDocuments.length ? availableDocuments : documents,
        currentCatalogId,
        (completed, total) => setProgress(`Revisando catálogos ${completed}/${total}…`),
      );
      setMessages((previous) => [...previous, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: answer.text,
        sources: answer.sources,
        query: question,
        detail: answer.searchedPages
          ? `Verificado en ${answer.searchedPages} páginas de ${answer.searchedCatalogs} catálogos.`
          : undefined,
      }]);
    } catch (error) {
      setMessages((previous) => [...previous, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: error instanceof Error
          ? `No pude consultar los índices en este momento: ${error.message}`
          : 'No pude consultar los índices en este momento. Inténtalo nuevamente.',
      }]);
    } finally {
      setIsThinking(false);
      setProgress('');
    }
  };

  const openSource = (source: CatalogAssistantSource, query: string) => {
    const params = new URLSearchParams({
      page: String(source.pageNumber),
      search: source.searchTerm || query,
    });
    setIsOpen(false);
    navigate(`/viewer/${encodeURIComponent(source.catalogId)}?${params.toString()}`);
  };

  return (
    <aside className="catalog-assistant" aria-label="Asistente de catálogos">
      {isOpen && (
        <section
          className="catalog-assistant-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="catalog-assistant-title"
        >
          <header className="catalog-assistant-header">
            <div className="catalog-assistant-brand">
              <span className="catalog-assistant-brand-icon"><Bot aria-hidden="true" /></span>
              <div>
                <h2 id="catalog-assistant-title">Asistente Chaide</h2>
                <p><span /> Responde desde los PDFs</p>
              </div>
            </div>
            <button
              type="button"
              className="catalog-assistant-icon-button"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar asistente"
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <div className="catalog-assistant-trust">
            <ShieldCheck aria-hidden="true" />
            <span>Solo usa el texto indexado de los catálogos publicados.</span>
          </div>

          <div className="catalog-assistant-messages" ref={messagesRef} aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`catalog-assistant-message is-${message.role}`}>
                <div className="catalog-assistant-bubble">{message.text}</div>
                {message.sources && message.sources.length > 0 && (
                  <div className="catalog-assistant-sources">
                    <p>Fuentes encontradas</p>
                    {message.sources.map((source) => (
                      <button
                        type="button"
                        key={`${source.catalogId}-${source.pageNumber}`}
                        onClick={() => openSource(source, message.query || '')}
                        className="catalog-assistant-source"
                      >
                        <BookOpen aria-hidden="true" />
                        <span>
                          <strong>{source.title}</strong>
                          <small>Página {source.pageNumber} · Abrir en el visor</small>
                        </span>
                        <ArrowUpRight aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
                {message.detail && <small className="catalog-assistant-detail">{message.detail}</small>}
              </article>
            ))}

            {messages.length === 1 && (
              <div className="catalog-assistant-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => void submitQuestion(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {isThinking && (
              <div className="catalog-assistant-thinking">
                <Loader2 aria-hidden="true" />
                <span>{progress || 'Buscando en los catálogos…'}</span>
              </div>
            )}
          </div>

          <form
            className="catalog-assistant-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitQuestion(input);
            }}
          >
            <label htmlFor="catalog-assistant-input" className="sr-only">Pregunta sobre los catálogos</label>
            <input
              id="catalog-assistant-input"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pregunta por un producto o característica…"
              autoComplete="off"
              disabled={isThinking}
            />
            <button type="submit" disabled={!input.trim() || isThinking} aria-label="Enviar pregunta">
              <Send aria-hidden="true" />
            </button>
          </form>
          <p className="catalog-assistant-footnote">Las respuestas muestran siempre el catálogo y la página de origen.</p>
        </section>
      )}

      <button
        type="button"
        className="catalog-assistant-trigger"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Cerrar asistente de catálogos' : 'Abrir asistente de catálogos'}
      >
        {isOpen ? <X aria-hidden="true" /> : <MessageCircle aria-hidden="true" />}
        {!isOpen && <span>Pregúntame</span>}
      </button>
    </aside>
  );
}
