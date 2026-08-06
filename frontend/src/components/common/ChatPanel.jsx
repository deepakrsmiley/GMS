import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Loader2, MessageSquare, AtSign, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import '../../styles/hmsChat.css';

function renderBody(text, mentions = []) {
  if (!text) return null;
  const names = mentions.map((m) => m.name).filter(Boolean);
  if (!names.length) return text;

  const pattern = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'gi');
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="mention">{part}</span>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

function initial(name) {
  return (name || '?').charAt(0).toUpperCase();
}

export default function ChatPanel({ open, onClose, currentUser }) {
  const qc = useQueryClient();
  const meId = String(currentUser?._id || '');
  const [tab, setTab] = useState('hospital'); // hospital | mentions | direct
  const [dmUser, setDmUser] = useState(null);
  const [draft, setDraft] = useState('');
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState([]); // { _id, name }
  const [dmSearch, setDmSearch] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  const scopeKey = tab === 'direct' && dmUser
    ? ['chatMessages', 'direct', dmUser._id]
    : ['chatMessages', tab];

  const { data: messages = [], isFetching, isError, error } = useQuery({
    queryKey: scopeKey,
    queryFn: async () => {
      if (tab === 'direct' && !dmUser) return [];
      const params = new URLSearchParams({ scope: tab === 'direct' ? 'direct' : tab, limit: '60' });
      if (tab === 'direct' && dmUser) params.set('with', dmUser._id);
      const res = await api.get(`/chat/messages?${params}`);
      return res.data.data || [];
    },
    enabled: open,
    refetchInterval: open ? 20000 : false,
    retry: 1,
  });

  const { data: conversations = [] } = useQuery({
    queryKey: ['chatConversations'],
    queryFn: () => api.get('/chat/conversations').then((r) => r.data.data || []),
    enabled: open && tab === 'direct',
  });

  const { data: directory = [] } = useQuery({
    queryKey: ['chatDirectory', mentionQuery ?? dmSearch],
    queryFn: () => {
      const q = mentionQuery != null ? mentionQuery : dmSearch;
      return api.get(`/chat/directory?q=${encodeURIComponent(q || '')}`).then((r) => r.data.data || []);
    },
    enabled: open && (mentionQuery != null || (tab === 'direct' && !dmUser)),
  });

  const { data: unread } = useQuery({
    queryKey: ['chatUnread'],
    queryFn: () => api.get('/chat/unread').then((r) => r.data.data),
    enabled: open,
    refetchInterval: 30000,
  });

  const sendMutation = useMutation({
    mutationFn: (payload) => api.post('/chat/messages', payload).then((r) => r.data.data),
    onSuccess: (msg) => {
      setDraft('');
      setMentionQuery(null);
      qc.setQueryData(scopeKey, (old = []) => {
        if (old.some((m) => m._id === msg._id)) return old;
        return [...old, msg];
      });
      qc.invalidateQueries({ queryKey: ['chatUnread'] });
      qc.invalidateQueries({ queryKey: ['chatConversations'] });
    },
  });

  // Live socket updates
  useEffect(() => {
    if (!open) return;
    const socket = getSocket();
    if (!socket) return;

    const onMessage = (msg) => {
      const isHospital = msg.channel === 'hospital';
      const isMention = (msg.mentions || []).some((m) => String(m._id) === meId);
      const isDirectForMe =
        msg.channel === 'direct' &&
        (msg.participants || []).some((p) => String(p._id) === meId);

      if (tab === 'hospital' && isHospital) {
        qc.setQueryData(['chatMessages', 'hospital'], (old = []) =>
          old.some((m) => m._id === msg._id) ? old : [...old, msg]
        );
      }
      if (tab === 'mentions' && isMention) {
        qc.setQueryData(['chatMessages', 'mentions'], (old = []) =>
          old.some((m) => m._id === msg._id) ? old : [...old, msg]
        );
      }
      if (tab === 'direct' && dmUser && isDirectForMe) {
        const otherId = String(dmUser._id);
        const involves =
          (msg.participants || []).some((p) => String(p._id) === otherId);
        if (involves) {
          qc.setQueryData(['chatMessages', 'direct', otherId], (old = []) =>
            old.some((m) => m._id === msg._id) ? old : [...old, msg]
          );
        }
      }
      qc.invalidateQueries({ queryKey: ['chatUnread'] });
      qc.invalidateQueries({ queryKey: ['chatConversations'] });
    };

    const onMention = () => {
      qc.invalidateQueries({ queryKey: ['chatUnread'] });
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:mention', onMention);
    return () => {
      socket.off('chat:message', onMessage);
      socket.off('chat:mention', onMention);
    };
  }, [open, tab, dmUser, meId, qc]);

  // Mark read when viewing
  useEffect(() => {
    if (!open || !messages.length) return;
    const unreadIds = messages
      .filter((m) => String(m.sender?._id) !== meId && !(m.readBy || []).includes(meId))
      .map((m) => m._id);
    const payload = unreadIds.length
      ? { messageIds: unreadIds }
      : tab === 'direct' && dmUser
        ? { scope: 'direct', with: dmUser._id }
        : { scope: tab };
    api.post('/chat/read', payload).then(() => {
      qc.invalidateQueries({ queryKey: ['chatUnread'] });
    }).catch(() => {});
  }, [open, tab, dmUser, messages, meId, qc]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, tab, dmUser]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, tab, dmUser]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery == null) return [];
    return directory.slice(0, 8);
  }, [directory, mentionQuery]);

  const onDraftChange = (value) => {
    setDraft(value);
    const caretMatch = value.match(/@([A-Za-z0-9 .'-]*)$/);
    if (caretMatch) {
      setMentionQuery(caretMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (user) => {
    const replaced = draft.replace(/@([A-Za-z0-9 .'-]*)$/, `@${user.name} `);
    setDraft(replaced);
    setSelectedMentions((prev) =>
      prev.some((m) => m._id === user._id) ? prev : [...prev, { _id: user._id, name: user.name }]
    );
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const resolveMentionIds = () => {
    const fromSelected = selectedMentions
      .filter((m) => draft.includes(`@${m.name}`))
      .map((m) => m._id);
    const fromDirectory = directory
      .filter((u) => draft.includes(`@${u.name}`))
      .map((u) => u._id);
    return [...new Set([...fromSelected, ...fromDirectory])];
  };

  const send = () => {
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    const mentions = resolveMentionIds();

    if (tab === 'direct') {
      if (!dmUser) return;
      sendMutation.mutate({
        body,
        channel: 'direct',
        recipientId: dmUser._id,
        mentions,
      });
      setSelectedMentions([]);
      return;
    }

    sendMutation.mutate({
      body,
      channel: 'hospital',
      mentions,
    });
    setSelectedMentions([]);
  };

  const onKeyDown = (e) => {
    if (mentionCandidates.length && mentionQuery != null) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!open) return null;

  const showCompose = tab !== 'direct' || !!dmUser;
  const conversationIds = new Set(conversations.map((c) => String(c.user._id)));
  const filteredDmPeople = directory.filter((u) => !conversationIds.has(String(u._id)));

  const panel = (
    <div className="hms-chat" role="dialog" aria-label="Hospital chat" data-hms-chat-panel="1">
      <div className="hms-chat__head">
        <div>
          <h3 className="hms-chat__title">Hospital Chat</h3>
          <p className="hms-chat__sub">Mention @name to notify a colleague</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="hms-chat__close"
        >
          Close
        </button>
      </div>

      <div className="hms-chat__tabs">
        <button
          type="button"
          className={`hms-chat__tab ${tab === 'hospital' ? 'is-active' : ''}`}
          onClick={() => { setTab('hospital'); setDmUser(null); }}
        >
          <Users size={12} className="inline mr-1 -mt-0.5" />
          Hospital
          {unread?.hospital > 0 && <span className="hms-chat__badge ml-1">{unread.hospital}</span>}
        </button>
        <button
          type="button"
          className={`hms-chat__tab ${tab === 'mentions' ? 'is-active' : ''}`}
          onClick={() => { setTab('mentions'); setDmUser(null); }}
        >
          <AtSign size={12} className="inline mr-1 -mt-0.5" />
          Mentions
          {unread?.mentions > 0 && <span className="hms-chat__badge ml-1">{unread.mentions}</span>}
        </button>
        <button
          type="button"
          className={`hms-chat__tab ${tab === 'direct' ? 'is-active' : ''}`}
          onClick={() => setTab('direct')}
        >
          <MessageSquare size={12} className="inline mr-1 -mt-0.5" />
          Direct
          {unread?.direct > 0 && <span className="hms-chat__badge ml-1">{unread.direct}</span>}
        </button>
      </div>

      <div className="hms-chat__body">
        {tab === 'direct' && !dmUser && (
          <>
            <div className="hms-chat__new-dm">
              <input
                className="hms-chat__search"
                placeholder="Find staff to message…"
                value={dmSearch}
                onChange={(e) => setDmSearch(e.target.value)}
              />
            </div>
            <div className="hms-chat__dm-list">
              {conversations.map((c) => (
                <button
                  key={c.user._id}
                  type="button"
                  className="hms-chat__dm-item"
                  onClick={() => setDmUser(c.user)}
                >
                  <span className="hms-chat__avatar">{initial(c.user.name)}</span>
                  <span className="hms-chat__dm-info">
                    <strong>{c.user.name}</strong>
                    <span>{c.lastMessage?.body}</span>
                  </span>
                  {c.unread && <span className="hms-chat__badge">1</span>}
                </button>
              ))}
              {filteredDmPeople.map((u) => (
                <button
                  key={u._id}
                  type="button"
                  className="hms-chat__dm-item"
                  onClick={() => setDmUser(u)}
                >
                  <span className="hms-chat__avatar">{initial(u.name)}</span>
                  <span className="hms-chat__dm-info">
                    <strong>{u.name}</strong>
                    <span>{u.role}{u.department ? ` · ${u.department}` : ''}</span>
                  </span>
                </button>
              ))}
              {!conversations.length && !filteredDmPeople.length && (
                <div className="hms-chat__empty">
                  <strong>No conversations yet</strong>
                  <p>Search a colleague above to start a direct message.</p>
                </div>
              )}
            </div>
          </>
        )}

        {(tab !== 'direct' || dmUser) && (
          <>
            {tab === 'direct' && dmUser && (
              <div className="hms-chat__dm-bar">
                <button type="button" onClick={() => setDmUser(null)}>← Back</button>
                <strong>{dmUser.name}</strong>
                <span className="text-[11px] text-gray-400">{dmUser.role}</span>
              </div>
            )}

            <div className="hms-chat__messages" ref={listRef}>
              {isError && (
                <div className="hms-chat__empty">
                  <strong>Could not load chat</strong>
                  <p>{error?.response?.data?.message || error?.message || 'Restart backend and try again.'}</p>
                </div>
              )}
              {!isError && isFetching && !messages.length && (
                <div className="hms-chat__empty">
                  <Loader2 size={18} className="animate-spin mx-auto mb-2" />
                  <p>Loading messages…</p>
                </div>
              )}
              {!isError && !isFetching && !messages.length && (
                <div className="hms-chat__empty">
                  <strong>{tab === 'mentions' ? 'No mentions yet' : 'Start the conversation'}</strong>
                  <p>
                    {tab === 'mentions'
                      ? 'When someone @mentions you, it appears here.'
                      : 'Type a message and use @Name to notify someone.'}
                  </p>
                </div>
              )}
              {!isError && messages.map((m) => {
                const mine = String(m.sender?._id) === meId;
                const mentionedMe = (m.mentions || []).some((x) => String(x._id) === meId);
                return (
                  <div
                    key={m._id}
                    className={`hms-chat__msg ${mine ? 'is-mine' : ''} ${mentionedMe && !mine ? 'is-mention' : ''}`}
                  >
                    <span className="hms-chat__avatar">{initial(m.sender?.name)}</span>
                    <div className="hms-chat__bubble">
                      <div className="hms-chat__meta">
                        <span className="hms-chat__name">{mine ? 'You' : m.sender?.name}</span>
                        <span className="hms-chat__role">{m.sender?.role}</span>
                        <span className="hms-chat__time">
                          {m.createdAt
                            ? formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })
                            : ''}
                        </span>
                      </div>
                      <p className="hms-chat__text">{renderBody(m.body, m.mentions)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {showCompose && (
          <div className="hms-chat__compose">
            {mentionQuery != null && mentionCandidates.length > 0 && (
              <div className="hms-chat__mentions">
                {mentionCandidates.map((u, i) => (
                  <button
                    key={u._id}
                    type="button"
                    className={`hms-chat__mention-item ${i === mentionIndex ? 'is-active' : ''}`}
                    onClick={() => insertMention(u)}
                  >
                    <span className="hms-chat__avatar">{initial(u.name)}</span>
                    <span>
                      <strong>{u.name}</strong>
                      <span>{u.role}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="hms-chat__hint">
              {tab === 'mentions'
                ? 'Replies go to Hospital chat — use @name so they see it.'
                : 'Use @ to mention. Enter to send · Shift+Enter for new line'}
            </p>
            <div className="hms-chat__input-row">
              <textarea
                ref={inputRef}
                className="hms-chat__input"
                rows={2}
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  tab === 'direct'
                    ? `Message ${dmUser?.name}…`
                    : 'Write a message… @Name for notify'
                }
              />
              <button
                type="button"
                className="hms-chat__send"
                disabled={!draft.trim() || sendMutation.isPending}
                onClick={send}
                title="Send"
              >
                {sendMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

/** Unread badge hook helper used by Header */
export function useChatUnread(enabled = true) {
  return useQuery({
    queryKey: ['chatUnread'],
    queryFn: () => api.get('/chat/unread').then((r) => r.data.data),
    enabled,
    refetchInterval: 45000,
    retry: 1,
    // Don't toast-spam if chat route isn't up yet
    meta: { silent: true },
  });
}
