import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  Brain,
  Layers,
  Zap,
  Globe,
  ExternalLink,
  Plus,
  MessageSquare,
  AlertCircle,
  Paperclip,
  Trash2,
} from 'lucide-react';
import {
  Fixture,
  GeminiModelId,
  ChatMessage,
  ChatSession,
} from '../types/football';
import {
  UserProfile,
  saveChatSession,
  loadUserChatSessions,
} from '../services/firebase';
import { MATCHDAY_DATE_LABEL } from '../services/mockHistoricalData';
import { TeamBadge } from './TeamBadge';

interface GeminiChatViewProps {
  fixtures: Fixture[];
  initialFixture: Fixture | null;
  user: UserProfile | null;
}

interface ModelCardConfig {
  id: GeminiModelId;
  name: string;
  role: string;
  description: string;
  badge: string;
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MODEL_OPTIONS: ModelCardConfig[] = [
  {
    id: 'gemini-4-hydrogen',
    name: 'Gemini 4 Hydrogen',
    role: 'Live Tactical Analyst',
    description: 'General analysis + live Google Search grounding for real-time squad & match news.',
    badge: 'Search Grounded',
    accent: 'teal',
    icon: Globe,
  },
  {
    id: 'gemini-4-carbon',
    name: 'Gemini 4 Carbon',
    role: 'Deep Quant Strategist',
    description: 'High-reasoning mathematical analysis for Poisson, Dixon-Coles & Brier calibration.',
    badge: 'Deep Reasoning',
    accent: 'emerald',
    icon: Brain,
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    role: 'Interactive Scenario Architect',
    description: 'Complex multi-market what-if modeling across 1X2, 10m Interval, BTTS & HT/FT.',
    badge: 'Complex Interactive',
    accent: 'indigo',
    icon: Layers,
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite',
    role: 'Express Briefing Assistant',
    description: 'Ultra-fast low-latency match summaries and crisp probability takeaways.',
    badge: 'Fast Response',
    accent: 'amber',
    icon: Zap,
  },
];

const GUEST_STORAGE_KEY = 'footballiq_guest_chat_sessions_v1';

function createEmptySession(model: GeminiModelId = 'gemini-4-hydrogen'): ChatSession {
  const now = new Date().toISOString();
  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: 'guest',
    title: 'New Tactical Session',
    activeModel: model,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const GeminiChatView: React.FC<GeminiChatViewProps> = ({
  fixtures,
  initialFixture,
  user,
}) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>('gemini-4-hydrogen');
  const [attachedFixtureId, setAttachedFixtureId] = useState<string>(
    initialFixture?.id || fixtures[0]?.id || ''
  );
  const [enableSearchGrounding, setEnableSearchGrounding] = useState<boolean>(true);
  const [input, setInput] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // Sync attached fixture when launched from a match card or modal
  useEffect(() => {
    if (initialFixture?.id) {
      setAttachedFixtureId(initialFixture.id);
    }
  }, [initialFixture]);

  // Load sessions from Firestore when authenticated, or localStorage when guest
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (user) {
        try {
          const remote = await loadUserChatSessions(user.uid);
          if (cancelled) return;
          if (remote.length > 0) {
            const converted: ChatSession[] = remote.map((s) => ({
              ...s,
              messages: s.messages.map((m) => ({
                ...m,
                modelId: m.modelId as GeminiModelId | undefined,
              })),
            }));
            setSessions(converted);
            setActiveSessionId(converted[0].id);
            setSelectedModel(converted[0].activeModel);
            return;
          }
        } catch (err) {
          console.warn('Could not load saved chat sessions:', err);
        }
      } else {
        try {
          const raw = localStorage.getItem(GUEST_STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as ChatSession[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setSessions(parsed);
              setActiveSessionId(parsed[0].id);
              setSelectedModel(parsed[0].activeModel);
              return;
            }
          }
        } catch {
          // ignore corrupted storage
        }
      }

      const fresh = createEmptySession('gemini-4-hydrogen');
      if (user) fresh.userId = user.uid;
      if (!cancelled) {
        setSessions([fresh]);
        setActiveSessionId(fresh.id);
      }
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;
  const attachedFixture = fixtures.find((f) => f.id === attachedFixtureId) || null;
  const activeModelMeta =
    MODEL_OPTIONS.find((m) => m.id === selectedModel) || MODEL_OPTIONS[0];

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages.length, isSending]);

  const persistSessions = async (updatedList: ChatSession[], changedSession: ChatSession) => {
    setSessions(updatedList);
    if (user) {
      try {
        await saveChatSession({
          ...changedSession,
          userId: user.uid,
        });
      } catch (err) {
        console.warn('Firestore chat save warning:', err);
      }
    } else {
      try {
        localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(updatedList.slice(0, 15)));
      } catch {
        // ignore storage quota errors
      }
    }
  };

  const handleNewSession = () => {
    const fresh = createEmptySession(selectedModel);
    if (user) fresh.userId = user.uid;
    const updated = [fresh, ...sessions];
    setSessions(updated);
    setActiveSessionId(fresh.id);
    setError(null);
  };

  const handleClearGuestSessions = () => {
    const fresh = createEmptySession(selectedModel);
    if (user) fresh.userId = user.uid;
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    if (!user) {
      localStorage.removeItem(GUEST_STORAGE_KEY);
    }
  };

  const buildFixtureContext = (f: Fixture | null) => {
    if (!f) return null;
    return {
      match: `${f.homeTeam.name} vs ${f.awayTeam.name}`,
      competition: f.competition.name,
      venue: f.venue,
      kickoffTimeUtc: f.kickoffTimeUtc,
      status: f.status,
      score: `${f.scores.currentHome}-${f.scores.currentAway}`,
      dataQuality: f.dataQuality,
      poissonLambda: f.prediction
        ? {
            homeLambda: f.prediction.poisson.homeLambda,
            awayLambda: f.prediction.poisson.awayLambda,
            mostLikelyScore: f.prediction.poisson.mostLikelyScore,
          }
        : null,
      markets: f.prediction
        ? {
            market1X2: f.prediction.market1X2,
            market1X2Interval10: f.prediction.market1X2Interval10,
            marketBTTS: f.prediction.marketBTTS,
            marketOverUnder25: f.prediction.marketOverUnder25,
            marketDoubleChance: f.prediction.marketDoubleChance,
            marketHtFtTopPick: {
              pick: f.prediction.marketHtFt.predictedOutcome,
              prob: f.prediction.marketHtFt.probabilities[f.prediction.marketHtFt.predictedOutcome],
            },
            confidenceScore: f.prediction.confidenceScore,
          }
        : null,
    };
  };

  const handleSendMessage = async (overridePrompt?: string) => {
    const text = (overridePrompt ?? input).trim();
    if (!text || isSending || !activeSession) return;

    setError(null);
    if (!overridePrompt) setInput('');

    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      text,
      attachedFixtureLabel: attachedFixture
        ? `${attachedFixture.homeTeam.shortName} vs ${attachedFixture.awayTeam.shortName}`
        : undefined,
      timestamp: now,
    };

    const historyPayload = activeSession.messages.map((m) => ({
      role: m.role,
      text: m.text,
    }));

    const sessionWithUser: ChatSession = {
      ...activeSession,
      activeModel: selectedModel,
      title:
        activeSession.messages.length === 0
          ? text.slice(0, 48) + (text.length > 48 ? '...' : '')
          : activeSession.title,
      messages: [...activeSession.messages, userMessage],
      updatedAt: now,
    };

    const listWithUser = sessions.map((s) =>
      s.id === activeSession.id ? sessionWithUser : s
    );
    setSessions(listWithUser);
    setIsSending(true);

    try {
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          message: text,
          history: historyPayload,
          fixtureContext: buildFixtureContext(attachedFixture),
          enableSearchGrounding,
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to receive Gemini response.');
      }

      const modelMsg: ChatMessage = {
        id: `msg_m_${Date.now()}`,
        role: 'model',
        text: payload.data.reply,
        modelId: payload.data.modelUsed,
        roleTitle: payload.data.roleTitle,
        sources: payload.data.sources || [],
        timestamp: payload.data.timestamp || new Date().toISOString(),
      };

      const completedSession: ChatSession = {
        ...sessionWithUser,
        messages: [...sessionWithUser.messages, modelMsg],
        updatedAt: modelMsg.timestamp,
      };

      const finalSessions = listWithUser.map((s) =>
        s.id === activeSession.id ? completedSession : s
      );
      await persistSessions(finalSessions, completedSession);
    } catch (err: any) {
      setError(err.message || 'Chat request failed.');
    } finally {
      setIsSending(false);
    }
  };

  const quickPrompts = [
    attachedFixture
      ? `Verify latest squad news and key tactical factors for ${attachedFixture.homeTeam.name} vs ${attachedFixture.awayTeam.name} on ${MATCHDAY_DATE_LABEL}.`
      : `Verify key fixtures playing today on ${MATCHDAY_DATE_LABEL} across AFCON Qualifiers and UEFA Nations League.`,
    attachedFixture
      ? `Explain the 1X2 vs 10-Minute Interval (00:01-09:59) probability split for ${attachedFixture.homeTeam.name} vs ${attachedFixture.awayTeam.name}.`
      : 'Explain how Dixon-Coles low-score correlation improves 0-0 and 1-1 predictions.',
    attachedFixture
      ? `Run a tactical what-if scenario if ${attachedFixture.homeTeam.name} scores inside the first 10 minutes.`
      : 'Compare Brier score vs multi-class Log Loss for evaluating 1X2 calibration.',
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/50 border border-emerald-800/40">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-bold uppercase tracking-wider text-emerald-400">
                Multi-Turn Gemini 4 Analyst
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="text-slate-400">
                Context-Aware · {user ? 'Synced to Firestore' : 'Local Session'}
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">
              FootballIQ Conversational Intelligence Lab
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              Multi-turn football analyst with dedicated Gemini models for live Google Search grounding, deep Poisson/Dixon-Coles reasoning, interactive scenario modeling, and fast briefings.
            </p>
          </div>

          <button
            onClick={handleNewSession}
            className="self-start md:self-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-950/50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Chat Thread</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Sidebar: Model Router, Fixture Context & Sessions */}
        <div className="lg:col-span-4 space-y-5">
          {/* Model Selector */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              Select Gemini Model Role
            </h3>
            <div className="space-y-2">
              {MODEL_OPTIONS.map((m) => {
                const Icon = m.icon;
                const isSelected = selectedModel === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={`w-full text-left p-3 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-emerald-950/50 border-emerald-500/80 shadow-md shadow-emerald-950/40'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                        <span className="text-xs font-bold text-slate-100">{m.name}</span>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono">
                        {m.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                      {m.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {selectedModel === 'gemini-4-hydrogen' && (
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs cursor-pointer">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-teal-400" />
                  Live Google Search Grounding
                </span>
                <input
                  type="checkbox"
                  checked={enableSearchGrounding}
                  onChange={(e) => setEnableSearchGrounding(e.target.checked)}
                  className="accent-emerald-500 w-4 h-4"
                />
              </label>
            )}
          </div>

          {/* Fixture Context Attachment */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Paperclip className="w-3.5 h-3.5 text-emerald-400" />
              Attach Match Quant Context
            </label>
            <select
              value={attachedFixtureId}
              onChange={(e) => setAttachedFixtureId(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-800 p-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">No specific match attached (General Football)</option>
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.homeTeam.name} vs {f.awayTeam.name} ({f.competition.name})
                </option>
              ))}
            </select>
            {attachedFixture?.prediction && (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-850 text-[11px] text-slate-400 flex items-center justify-between">
                <span>
                  1X2 Pick: <strong className="text-emerald-400">{attachedFixture.prediction.market1X2.predictedOutcome}</strong>
                </span>
                <span>
                  λ: <strong className="text-slate-200 font-mono">{attachedFixture.prediction.poisson.homeLambda} - {attachedFixture.prediction.poisson.awayLambda}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Conversation History Switcher */}
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                Recent Conversations
              </h3>
              {sessions.length > 1 && (
                <button
                  onClick={handleClearGuestSessions}
                  className="text-[11px] text-slate-500 hover:text-rose-400 flex items-center gap-1"
                  title="Reset threads"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setActiveSessionId(s.id);
                    setSelectedModel(s.activeModel);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                    activeSession?.id === s.id
                      ? 'bg-slate-800 border-emerald-600/50 text-white font-semibold'
                      : 'bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="truncate">{s.title}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 flex justify-between">
                    <span>{s.messages.length} msgs</span>
                    <span className="font-mono">{s.activeModel}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel: Scrollable Multi-Turn Conversation Thread */}
        <div className="lg:col-span-8 flex flex-col rounded-3xl bg-slate-900/90 border border-slate-800 overflow-hidden h-[680px]">
          {/* Active Model Bar */}
          <div className="px-5 py-3.5 border-b border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-100">{activeModelMeta.name}</span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400">{activeModelMeta.role}</span>
            </div>
            {attachedFixture && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-300 font-medium">
                <span className="text-slate-400">Context:</span>
                <TeamBadge team={attachedFixture.homeTeam} size="xs" />
                <span>{attachedFixture.homeTeam.shortName}</span>
                <span className="text-slate-500">vs</span>
                <TeamBadge team={attachedFixture.awayTeam} size="xs" />
                <span>{attachedFixture.awayTeam.shortName}</span>
              </div>
            )}
          </div>

          {/* Scrollable Message Thread */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {(!activeSession || activeSession.messages.length === 0) && (
              <div className="py-10 text-center space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-emerald-950/80 border border-emerald-800 flex items-center justify-center mx-auto">
                  <Bot className="w-7 h-7 text-emerald-400" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h4 className="text-base font-bold text-white">
                    Start a Multi-Turn Football Intelligence Session
                  </h4>
                  <p className="text-xs text-slate-400">
                    Conversation history is maintained across turns so you can ask follow-ups, switch between Gemini 4 models mid-thread, or attach any {MATCHDAY_DATE_LABEL} fixture.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 max-w-xl mx-auto text-left">
                  {quickPrompts.map((qp, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(qp)}
                      className="p-3 rounded-2xl bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-emerald-600/50 text-xs text-slate-300 transition-colors"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeSession?.messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs space-y-2 ${
                      isUser
                        ? 'bg-emerald-600 text-white rounded-br-sm'
                        : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 text-[10px] opacity-80">
                      <span className="font-bold uppercase tracking-wider">
                        {isUser ? 'You' : msg.roleTitle || msg.modelId || 'Gemini Analyst'}
                      </span>
                      <div className="flex items-center gap-2">
                        {msg.attachedFixtureLabel && (
                          <span className="px-1.5 py-0.2 rounded bg-black/25 font-mono">
                            {msg.attachedFixtureLabel}
                          </span>
                        )}
                        {!isUser && msg.modelId && (
                          <span className="px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-emerald-400 font-mono">
                            {msg.modelId}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                    </div>

                    {msg.sources && msg.sources.length > 0 && (
                      <div className="pt-2 border-t border-slate-800 space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 block">
                          Verified Google Search Sources
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((src, idx) => (
                            <a
                              key={idx}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-teal-300 text-[10px]"
                            >
                              <span className="truncate max-w-[180px]">{src.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-slate-950 border border-slate-800 px-4 py-3 text-xs text-slate-400 flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  <span>
                    {selectedModel === 'gemini-4-hydrogen' && enableSearchGrounding
                      ? 'Grounding with Google Search & analyzing...'
                      : `Running ${activeModelMeta.name}...`}
                  </span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-2xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="p-4 border-t border-slate-800 bg-slate-950/90 flex items-center gap-2.5"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask ${activeModelMeta.name} about fixtures, Poisson rates, 10m intervals, or team news...`}
              disabled={isSending}
              className="flex-1 rounded-xl bg-slate-900 border border-slate-800 px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
