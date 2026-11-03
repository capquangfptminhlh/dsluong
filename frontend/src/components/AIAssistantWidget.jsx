import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, User, X } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

export default function AIAssistantWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Chào bạn! Tôi là AutoTax AI. Tôi có thể hỗ trợ đọc dữ liệu vận hành và giải thích các màn hình. Với số liệu quan trọng, hãy đối chiếu nguồn gốc trước khi quyết định.' },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setMessages((previous) => [...previous, { role: 'user', text: userMsg }]);
    setInput('');
    setIsLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/api/ai/assistant`, { query: userMsg });
      setMessages((previous) => [...previous, { role: 'ai', text: response.data.reply }]);
    } catch (error) {
      console.error(error);
      setMessages((previous) => [...previous, { role: 'ai', text: 'Kết nối AI đang gián đoạn. Hãy kiểm tra lại cấu hình API hoặc thử lại sau.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Compact mobile/tablet uses the bottom navigation and has limited horizontal room.
  // Keep the floating assistant on full desktop only so it never covers shell actions.
  return (
    <div className="hidden lg:block">
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-xl transition-transform hover:scale-105 hover:bg-slate-800"
          aria-label="Mở trợ lý AutoTax AI"
        >
          <Bot className="h-5 w-5" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[500px] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20">
          <div className="flex shrink-0 items-center justify-between bg-slate-950 p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Bot className="h-5 w-5" /></div>
              <div><h3 className="flex items-center gap-1 text-sm font-bold">AutoTax AI <Sparkles className="h-3 w-3 text-amber-300" /></h3><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-300">Trợ lý dữ liệu</p></div>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Đóng trợ lý"><X className="h-5 w-5" /></button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/70 p-4">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {message.role === 'ai' && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200"><Bot className="h-4 w-4 text-slate-700" /></div>}
                <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-5 ${message.role === 'user' ? 'rounded-tr-sm bg-slate-950 text-white' : 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'}`}>{message.text}</div>
                {message.role === 'user' && <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-200"><User className="h-4 w-4 text-slate-600" /></div>}
              </div>
            ))}
            {isLoading && <div className="flex items-center gap-2 text-xs font-semibold text-slate-400"><span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />AI đang xử lý…</div>}
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white p-3">
            <div className="relative flex items-center">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && handleSend()}
                placeholder="Hỏi AI về dữ liệu…"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 text-sm"
                disabled={isLoading}
              />
              <button type="button" onClick={handleSend} disabled={!input.trim() || isLoading} className="absolute right-2 rounded-lg bg-slate-950 p-2 text-white disabled:opacity-40"><Send className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 text-center text-[10px] text-slate-400">AI có thể nhầm. Luôn đối chiếu chứng từ và dữ liệu nguồn.</div>
          </div>
        </div>
      )}
    </div>
  );
}
