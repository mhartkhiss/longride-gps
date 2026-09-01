import React, { useState, useEffect, useRef } from 'react';
import { X, Send, AlertTriangle, Fuel, Octagon, Coffee, Users, ThumbsUp, MessageSquare, Zap } from 'lucide-react';
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
  { label: 'Need Gas', icon: Fuel, text: '⛽ Need gas / Looking for a station', color: 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 active:border-amber-400' },
  { label: 'Pulling Over', icon: Octagon, text: '🛑 Pulling over / Stopping safely', color: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/40 active:border-rose-400' },
  { label: 'Hazard Ahead', icon: AlertTriangle, text: '⚠️ Road hazard / debris ahead, watch out!', color: 'bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border-orange-500/40 active:border-orange-400' },
  { label: 'Quick Break', icon: Coffee, text: '🥪 Need a quick break / rest stop', color: 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/40 active:border-cyan-400' },
  { label: 'Regroup', icon: Users, text: '🚀 Regroup / slow down for trailing riders', color: 'bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border-purple-500/40 active:border-purple-400' },
  { label: 'All Good', icon: ThumbsUp, text: '👍 All good / ready to ride!', color: 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40 active:border-emerald-400' },
];

const getPresetStyle = (text: string) => {
  if (text.includes('⛽') || text.includes('gas') || text.includes('Gas')) {
    return 'bg-amber-950/80 text-amber-100 border-amber-500/50 shadow-amber-500/15';
  }
  if (text.includes('🛑') || text.includes('Pulling') || text.includes('Stopping')) {
    return 'bg-rose-950/80 text-rose-100 border-rose-500/50 shadow-rose-500/15';
  }
  if (text.includes('⚠️') || text.includes('hazard') || text.includes('Hazard')) {
    return 'bg-orange-950/80 text-orange-100 border-orange-500/50 shadow-orange-500/15';
  }
  if (text.includes('🥪') || text.includes('break') || text.includes('Break')) {
    return 'bg-cyan-950/80 text-cyan-100 border-cyan-500/50 shadow-cyan-500/15';
  }
  if (text.includes('🚀') || text.includes('Regroup')) {
    return 'bg-purple-950/80 text-purple-100 border-purple-500/50 shadow-purple-500/15';
  }
  if (text.includes('👍') || text.includes('good') || text.includes('Good')) {
    return 'bg-emerald-950/80 text-emerald-100 border-emerald-500/50 shadow-emerald-500/15';
  }
  return 'bg-amber-950/80 text-amber-100 border-amber-500/40';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useSessionStore();

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const triggerHaptic = () => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in window.navigator) {
        window.navigator.vibrate(30);
      }
    } catch {}
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    triggerHaptic();
    onSendMessage(inputText.trim(), false);
    setInputText('');
  };

  const handleQuickAlert = (text: string) => {
    triggerHaptic();
    onSendMessage(text, true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Sheet / Modal Container */}
      <div className="relative w-full max-w-lg h-[90dvh] sm:h-[620px] max-h-[100dvh] bg-slate-900/95 border-t sm:border border-slate-700/80 rounded-t-[28px] sm:rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col animate-in fade-in slide-in-from-bottom-8 sm:zoom-in-95 duration-200">
        
        {/* Mobile Swipe / Grab Handle */}
        <div 
          onClick={onClose}
          className="w-full pt-3 pb-1 flex justify-center items-center sm:hidden cursor-pointer touch-none bg-slate-950/60"
        >
          <div className="w-12 h-1.5 rounded-full bg-slate-600/80 hover:bg-slate-500 transition-colors" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-3.5 border-b border-slate-800 shrink-0 bg-slate-950/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400 shrink-0">
              <MessageSquare className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white tracking-wide truncate max-w-[200px] xs:max-w-[240px] sm:max-w-xs">
                {rideName || 'Ride Session'}
              </h3>
              <p className="text-[11px] text-brand-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                Group Ride Chat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 flex items-center justify-center transition-colors active:scale-90 shrink-0"
            aria-label="Close Chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Rider Shouts / Glove-Friendly Action Strip */}
        <div className="px-3 py-2 bg-slate-950/80 border-b border-slate-800/80 shrink-0">
          <div className="flex items-center gap-1.5 mb-1.5 px-1">
            <Zap className="w-3 h-3 text-brand-400 fill-brand-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Shouts (Glove 1-Tap)</span>
          </div>
          <div className="overflow-x-auto no-scrollbar flex items-center gap-2 py-0.5">
            {QUICK_ALERTS.map((alert, idx) => {
              const IconComponent = alert.icon;
              return (
                <button
                  key={idx}
                  onClick={() => handleQuickAlert(alert.text)}
                  className={`px-3 py-2 sm:py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap active:scale-95 transition-all shrink-0 shadow-sm ${alert.color}`}
                >
                  <IconComponent className="w-3.5 h-3.5 shrink-0" />
                  <span>{alert.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Message History */}
        <div className="flex-1 overflow-y-auto px-3.5 sm:px-4 py-3 space-y-3 overscroll-contain">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/40 border border-white/5 flex items-center justify-center mb-3">
                <MessageSquare className="w-6 h-6 stroke-[1.5] text-slate-500" />
              </div>
              <p className="text-sm font-semibold text-slate-400">No messages yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-[220px]">Tap a Quick Shout above or type below to notify your group.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.userId === user?.id;
              const color = getRiderColor(msg.userId);
              const isPreset = msg.isQuickAlert || QUICK_ALERTS.some(a => a.text === msg.text);

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} animate-in fade-in duration-150`}
                >
                  <div className={`flex items-end gap-2 max-w-[90%] sm:max-w-[85%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    {!isOwn && (
                      <div
                        className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-[11px] font-black shrink-0 mb-1 border border-white/20 shadow-md"
                        style={{ backgroundColor: color }}
                      >
                        {msg.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <div className={isOwn ? 'items-end' : 'items-start'}>
                      {!isOwn && (
                        <p className="text-[10px] text-slate-400 font-semibold mb-1 ml-1 truncate max-w-[160px]">
                          {msg.displayName}
                        </p>
                      )}
                      <div
                        className={`px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed border shadow-md transition-all ${
                          isPreset
                            ? `${getPresetStyle(msg.text)} font-semibold`
                            : isOwn
                            ? 'bg-brand-500 text-slate-950 font-medium rounded-br-sm border-brand-400/80'
                            : 'bg-slate-800/90 text-slate-100 rounded-bl-sm border-slate-700/80'
                        }`}
                      >
                        {msg.text}
                      </div>
                      <p className={`text-[9px] text-slate-500 mt-1 font-medium ${isOwn ? 'text-right mr-1' : 'ml-1'}`}>
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

        {/* Input Bar (Mobile 16px font to prevent zoom + safe-area padding) */}
        <form 
          onSubmit={handleSend} 
          className="p-2.5 sm:p-3 bg-slate-950 border-t border-slate-800/80 flex items-center gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0.75rem))]"
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            style={{ fontSize: '16px' }} // Ensures mobile browsers do not auto-zoom on focus
            className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500 transition-all"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="w-11 h-11 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:hover:bg-brand-500 text-slate-950 font-bold flex items-center justify-center transition-all active:scale-90 shadow-lg shadow-brand-500/20 shrink-0"
            aria-label="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
