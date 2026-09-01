import React, { useState, useEffect, useRef } from 'react';
import { X, Send, AlertTriangle, Fuel, Octagon, Coffee, Users, ThumbsUp, MessageSquare } from 'lucide-react';
import { ChatMessagePayload } from '@/types/realtime';
import { useSessionStore } from '@/stores/sessionStore';
import { getRiderColor } from '@/lib/utils';

interface ChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  rideName?: string;
  messages: ChatMessagePayload[];
  onSendMessage: (text: string, isQuickAlert?: boolean) => void;
}

const QUICK_ALERTS = [
  { label: 'Need Gas', icon: Fuel, text: '⛽ Need gas / Looking for a station', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  { label: 'Pulling Over', icon: Octagon, text: '🛑 Pulling over / Stopping safely', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' },
  { label: 'Hazard Ahead', icon: AlertTriangle, text: '⚠️ Road hazard / debris ahead, watch out!', color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
  { label: 'Quick Break', icon: Coffee, text: '🥪 Need a quick break / rest stop', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  { label: 'Regroup', icon: Users, text: '🚀 Regroup / slow down for trailing riders', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  { label: 'All Good', icon: ThumbsUp, text: '👍 All good / ready to ride!', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
];

const getPresetStyle = (text: string) => {
  if (text.includes('⛽') || text.includes('gas') || text.includes('Gas')) {
    return 'bg-amber-950/90 text-amber-200 border-amber-500/60 shadow-amber-500/10 shadow-lg';
  }
  if (text.includes('🛑') || text.includes('Pulling') || text.includes('Stopping')) {
    return 'bg-rose-950/90 text-rose-200 border-rose-500/60 shadow-rose-500/10 shadow-lg';
  }
  if (text.includes('⚠️') || text.includes('hazard') || text.includes('Hazard')) {
    return 'bg-orange-950/90 text-orange-200 border-orange-500/60 shadow-orange-500/10 shadow-lg';
  }
  if (text.includes('🥪') || text.includes('break') || text.includes('Break')) {
    return 'bg-cyan-950/90 text-cyan-200 border-cyan-500/60 shadow-cyan-500/10 shadow-lg';
  }
  if (text.includes('🚀') || text.includes('Regroup')) {
    return 'bg-purple-950/90 text-purple-200 border-purple-500/60 shadow-purple-500/10 shadow-lg';
  }
  if (text.includes('👍') || text.includes('good') || text.includes('Good')) {
    return 'bg-emerald-950/90 text-emerald-200 border-emerald-500/60 shadow-emerald-500/10 shadow-lg';
  }
  return 'bg-amber-950/90 text-amber-200 border-amber-500/40 shadow-lg';
};

export const ChatModal: React.FC<ChatModalProps> = ({
  isOpen,
  onClose,
  rideName,
  messages,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useSessionStore();

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim(), false);
    setInputText('');
  };

  const handleQuickAlert = (text: string) => {
    onSendMessage(text, true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg h-[85vh] sm:h-[600px] bg-slate-900/95 border border-slate-700/80 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col animate-in fade-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200 pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400 shrink-0">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide truncate max-w-[220px] sm:max-w-xs">
                {rideName || 'Ride Session'}
              </h3>
              <p className="text-[11px] text-brand-400 font-semibold">Group Ride Chat</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Rider Shouts / Alerts (Gloves-friendly) */}
        <div className="px-4 py-2.5 bg-slate-950/60 border-b border-slate-800/80 shrink-0 overflow-x-auto no-scrollbar flex items-center gap-2">
          {QUICK_ALERTS.map((alert, idx) => {
            const IconComponent = alert.icon;
            return (
              <button
                key={idx}
                onClick={() => handleQuickAlert(alert.text)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap active:scale-95 transition-transform shrink-0 ${alert.color}`}
              >
                <IconComponent className="w-3.5 h-3.5" />
                <span>{alert.label}</span>
              </button>
            );
          })}
        </div>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <MessageSquare className="w-10 h-10 mb-2 stroke-[1.5] text-slate-600" />
              <p className="text-xs font-medium">No messages yet.</p>
              <p className="text-[11px] text-slate-600 mt-0.5">Send a quick alert or message to your ride group!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.userId === user?.id;
              const color = getRiderColor(msg.userId);
              const isPreset = msg.isQuickAlert || QUICK_ALERTS.some(a => a.text === msg.text);

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-end gap-2 max-w-[85%]">
                    {!isOwn && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-1 border border-white/20"
                        style={{ backgroundColor: color }}
                      >
                        {msg.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div>
                      {!isOwn && (
                        <p className="text-[10px] text-slate-400 font-semibold mb-0.5 ml-1">
                          {msg.displayName}
                        </p>
                      )}
                      <div
                        className={`px-3.5 py-2 rounded-2xl text-xs sm:text-sm leading-relaxed border ${
                          isPreset
                            ? `${getPresetStyle(msg.text)} font-semibold`
                            : isOwn
                            ? 'bg-brand-500 text-slate-950 font-medium rounded-br-sm shadow-md border-brand-400'
                            : 'bg-slate-800 text-slate-100 rounded-bl-sm border-slate-700/60 shadow-md'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <p className={`text-[9px] text-slate-500 mt-0.5 ${isOwn ? 'text-right mr-1' : 'ml-1'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSend} className="p-3 sm:p-4 bg-slate-950/80 border-t border-slate-800/80 flex items-center gap-2">
          <input
            type="text"
            placeholder="Type a message to riders..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 text-white text-xs sm:text-sm rounded-xl px-3.5 py-2.5 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:hover:bg-brand-500 text-slate-950 font-bold transition-all active:scale-95 shadow-lg shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
