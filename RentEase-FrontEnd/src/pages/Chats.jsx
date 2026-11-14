import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { compressImage } from '../lib/image'

const QUICK_MESSAGES = ['Hello', 'Thanks!', 'Okay', 'Great!']

function ChatIcon({ name }) {
  if (name === 'haha') return <span className="chat-emoji-reaction" aria-hidden="true">😂</span>

  const paths = {
    like: <path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-8c2 0 3 2 2 4l-1 4h6a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 1H7" />,
    dislike: <path d="M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3Zm0 0 4 8c2 0 3-2 2-4l-1-4h6a2 2 0 0 0 2-2l-2-8a2 2 0 0 0-2-1H7" />,
    reply: <><path d="m9 17-5-5 5-5" /><path d="M4 12h9a7 7 0 0 1 7 7" /></>,
    unsend: <><path d="M9 14 4 9l5-5" /><path d="M4 9h9a7 7 0 0 1 7 7v4" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[name]}</svg>
}

function messageTime(value) {
  if (!value) return ''
  return new Date(String(value).replace(' ', 'T')).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function messageDate(value) {
  if (!value) return ''
  const date = new Date(String(value).replace(' ', 'T'))
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const dateKey = (item) => `${item.getFullYear()}-${item.getMonth()}-${item.getDate()}`
  if (dateKey(date) === dateKey(today)) return 'Today'
  if (dateKey(date) === dateKey(yesterday)) return 'Yesterday'
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })
}

function sameMessageGroup(first, second) {
  if (!first || !second || Number(first.sender_id) !== Number(second.sender_id)) return false
  const firstTime = new Date(String(first.created_at).replace(' ', 'T'))
  const secondTime = new Date(String(second.created_at).replace(' ', 'T'))
  return firstTime.toDateString() === secondTime.toDateString()
    && Math.abs(secondTime - firstTime) <= 5 * 60 * 1000
}

export default function Chats() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [activeMessageActions, setActiveMessageActions] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [content, setContent] = useState('')
  const [image, setImage] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [loadingChats, setLoadingChats] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, flash] = useToast()
  const selectedRef = useRef(null)
  const bottomRef = useRef(null)
  const threadRef = useRef(null)
  const fileRef = useRef(null)
  const composerRef = useRef(null)
  const startedTenantRef = useRef(null)
  const olderLoadingRef = useRef(false)
  const hoverTimerRef = useRef(null)
  const messageGestureRef = useRef(null)

  const selected = useMemo(
    () => conversations.find((conversation) => Number(conversation.id) === Number(selectedId)) || null,
    [conversations, selectedId],
  )

  const loadConversations = useCallback(async () => {
    const response = await api('/api/chats', { auth: true })
    const rows = response.data || []
    setConversations(rows)
    if (!rows.some((row) => Number(row.id) === Number(selectedRef.current))) {
      setSelectedId(rows.length ? Number(rows[0].id) : null)
    }
    return rows
  }, [])

  useEffect(() => {
    let alive = true
    api('/api/chats', { auth: true })
      .then((response) => {
        if (!alive) return
        const rows = response.data || []
        setConversations(rows)
        if (!selectedRef.current && rows.length) setSelectedId(Number(rows[0].id))
      })
      .catch((error) => flash(error.message, 'bad'))
      .finally(() => alive && setLoadingChats(false))
    return () => { alive = false }
  }, [flash])

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  useEffect(() => () => {
    window.clearTimeout(hoverTimerRef.current)
    window.clearTimeout(messageGestureRef.current?.timer)
  }, [])

  useEffect(() => {
    const tenantId = params.get('tenant')
    if (user?.role !== 'admin' || !tenantId || startedTenantRef.current === tenantId) return
    startedTenantRef.current = tenantId
    api(`/api/chats/direct/${tenantId}`, { method: 'POST', auth: true, body: {} })
      .then(async (response) => {
        const rows = await loadConversations()
        const conversationId = Number(response.data.id)
        if (rows.some((row) => Number(row.id) === conversationId)) setSelectedId(conversationId)
        setParams({}, { replace: true })
      })
      .catch((error) => {
        startedTenantRef.current = null
        flash(error.message, 'bad')
      })
  }, [user?.role, params, setParams, loadConversations, flash])

  const loadMessages = useCallback(async (conversationId, { before, prepend = false, silent = false } = {}) => {
    if (!conversationId) return
    const isCurrent = () => Number(selectedRef.current) === Number(conversationId)
    if (before) setLoadingOlder(true)
    else if (!silent) setLoadingMessages(true)
    try {
      const suffix = before ? `?before=${encodeURIComponent(before)}` : ''
      const response = await api(`/api/chats/${conversationId}/messages${suffix}`, { auth: true })
      if (!isCurrent()) return
      const payload = response.data || {}
      setMessageError('')
      const latest = (payload.messages || []).at(-1)
      if (!before && latest) {
        setConversations((current) => current.map((conversation) => Number(conversation.id) === Number(conversationId)
          ? {
            ...conversation,
            last_message: latest.is_unsent ? 'Message unsent' : latest.content || (latest.image_url ? 'Image' : ''),
            last_message_at: latest.created_at,
          }
          : conversation))
      }
      setMessages((current) => {
        if (!prepend) {
          if (!silent) return payload.messages || []
          const combined = new Map(current.map((message) => [Number(message.id), message]))
          for (const message of payload.messages || []) combined.set(Number(message.id), message)
          return [...combined.values()].sort((a, b) => Number(a.id) - Number(b.id))
        }
        const combined = new Map((payload.messages || []).map((message) => [Number(message.id), message]))
        for (const message of current) combined.set(Number(message.id), message)
        return [...combined.values()].sort((a, b) => Number(a.id) - Number(b.id))
      })
      setHasMore(!!payload.has_more)
      if (!before && !silent) requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }))
    } catch (error) {
      if (isCurrent()) {
        if (silent) setMessageError(error.message)
        else flash(error.message, 'bad')
      }
    } finally {
      if (isCurrent()) {
        setLoadingMessages(false)
        setLoadingOlder(false)
      }
    }
  }, [flash])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      setActiveMessageActions(null)
      setReplyTo(null)
      setLoadingMessages(false)
      setLoadingOlder(false)
      olderLoadingRef.current = false
      setMessageError('')
      return
    }
    setMessages([])
    setActiveMessageActions(null)
    setReplyTo(null)
    setLoadingOlder(false)
    olderLoadingRef.current = false
    setMessageError('')
    loadMessages(selectedId)
    const timer = window.setInterval(() => {
      if (!document.hidden) loadMessages(selectedId, { silent: true })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [selectedId, loadMessages])

  async function loadOlderMessages() {
    if (!selected || !hasMore || loadingOlder || olderLoadingRef.current || !messages.length) return
    olderLoadingRef.current = true
    const container = threadRef.current
    const oldHeight = container?.scrollHeight || 0
    try {
      await loadMessages(selected.id, { before: messages[0].id, prepend: true })
      requestAnimationFrame(() => {
        if (container) container.scrollTop += container.scrollHeight - oldHeight
      })
    } finally {
      olderLoadingRef.current = false
    }
  }

  async function send(event) {
    event.preventDefault()
    if (!selectedId || (!content.trim() && !image)) return
    const conversationId = selectedId
    setBusy(true)
    try {
      await api(`/api/chats/${conversationId}/messages`, {
        method: 'POST',
        auth: true,
        body: { content: content.trim(), image, reply_to_message_id: replyTo?.id || null },
      })
      if (Number(selectedRef.current) === Number(conversationId)) {
        setContent('')
        setImage(null)
        setReplyTo(null)
        await loadMessages(conversationId, { silent: true })
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
      await loadConversations()
    } catch (error) {
      flash(error.message, 'bad')
    } finally {
      setBusy(false)
    }
  }

  async function attachImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setImage(await compressImage(file, { maxSide: 1400, maxBytes: 650 * 1024 }))
    } catch (error) {
      flash(error.message, 'bad')
    }
  }

  async function clearConversation() {
    if (!selected || !window.confirm('Clear this conversation from your chat view?')) return
    try {
      await api(`/api/chats/${selected.id}/clear`, { method: 'DELETE', auth: true })
      setMessages([])
      await loadMessages(selected.id)
      await loadConversations()
    } catch (error) {
      flash(error.message, 'bad')
    }
  }

  async function unsend(message) {
    if (!window.confirm('Unsend this message for everyone?')) return
    try {
      await api(`/api/chat-messages/${message.id}`, {
        method: 'DELETE',
        auth: true,
        body: { conversation_id: selected.id },
      })
      setMessages((current) => current.map((item) => Number(item.id) === Number(message.id)
        ? { ...item, is_unsent: true, content: null, image_url: null }
        : item))
      await loadMessages(selected.id, { silent: true })
      await loadConversations()
    } catch (error) {
      flash(error.message, 'bad')
    }
  }

  async function react(message, reaction) {
    try {
      await api(`/api/chat-messages/${message.id}/reaction`, {
        method: 'PUT',
        auth: true,
        body: { conversation_id: selected.id, reaction: message.my_reaction === reaction ? null : reaction },
      })
      await loadMessages(selected.id, { silent: true })
    } catch (error) {
      flash(error.message, 'bad')
    }
  }

  function chooseQuickMessage(message) {
    setContent((current) => `${current}${current && !/\s$/.test(current) ? ' ' : ''}${message}`)
    composerRef.current?.focus()
  }

  function startReply(message) {
    setReplyTo(message)
    setActiveMessageActions(null)
    composerRef.current?.focus()
  }

  function showMessageActions(messageId) {
    if (window.matchMedia('(hover: none)').matches) return
    window.clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = window.setTimeout(() => setActiveMessageActions(messageId), 1000)
  }

  function hideMessageActions() {
    if (window.matchMedia('(hover: none)').matches) return
    window.clearTimeout(hoverTimerRef.current)
    setActiveMessageActions(null)
  }

  function startMessageGesture(event, message) {
    if (!['touch', 'pen'].includes(event.pointerType) || event.target.closest('.chat-message__actions')) return
    if (activeMessageActions === message.id) {
      setActiveMessageActions(null)
      return
    }
    if (activeMessageActions !== null) setActiveMessageActions(null)

    window.clearTimeout(messageGestureRef.current?.timer)
    const gesture = {
      messageId: message.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: null,
    }
    gesture.timer = window.setTimeout(() => {
      if (messageGestureRef.current !== gesture) return
      setActiveMessageActions(message.id)
      if (window.navigator.vibrate) window.navigator.vibrate(12)
    }, 450)
    messageGestureRef.current = gesture
  }

  function moveMessageGesture(event, message) {
    const gesture = messageGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    if (deltaX > 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      window.clearTimeout(gesture.timer)
      messageGestureRef.current = null
      startReply(message)
      return
    }
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) window.clearTimeout(gesture.timer)
  }

  function endMessageGesture(event) {
    const gesture = messageGestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    window.clearTimeout(gesture.timer)
    messageGestureRef.current = null
  }

  return (
    <section className="chat-page">
      <div className={`chat-layout${mobileThreadOpen ? ' chat-layout--mobile-thread' : ''}`}>
        <aside className="chat-list panel" aria-label="Conversations">
          <div className="chat-list__head"><strong>Conversations</strong></div>
          {loadingChats && <p className="muted chat-list__empty">Loading chats…</p>}
          {!loadingChats && conversations.length === 0 && <p className="muted chat-list__empty">No conversations yet.</p>}
          {conversations.map((conversation) => (
            <button
              type="button"
              key={conversation.id}
              className={`chat-list__item${Number(selectedId) === Number(conversation.id) ? ' is-active' : ''}`}
              onClick={() => {
                setSelectedId(Number(conversation.id))
                setMobileThreadOpen(true)
              }}
            >
              <span className="chat-list__avatar">{conversation.type === 'general' ? 'G' : (conversation.title || '?').slice(0, 1).toUpperCase()}</span>
              <span className="chat-list__text">
                <strong>{conversation.title}</strong>
                <small>{conversation.subtitle}</small>
                {conversation.last_message && <small className="chat-list__preview">{conversation.last_message}</small>}
              </span>
            </button>
          ))}
        </aside>

        <section className="chat-thread panel" aria-label={selected ? selected.title : 'Chat'}>
          {selected ? (
            <>
              <header className="chat-thread__head">
                <button
                  type="button"
                  className="chat-thread__back"
                  onClick={() => setMobileThreadOpen(false)}
                  aria-label="Back to conversations"
                  title="Back to conversations"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <div>
                  <h2>{selected.title}</h2>
                  <span className="muted">{selected.subtitle}</span>
                </div>
                <button type="button" className="btn btn--ghost btn--sm" onClick={clearConversation}>
                  {user?.role === 'admin' && selected.type === 'direct' ? 'Remove conversation' : 'Clear conversation'}
                </button>
              </header>
              {messageError && <p className="alert alert--error" role="alert">Could not refresh this conversation: {messageError}</p>}
              <div className="chat-thread__messages" ref={threadRef} role="log" aria-live="polite"
                onScroll={(event) => {
                  if (event.currentTarget.scrollTop < 40 && hasMore && !loadingOlder) loadOlderMessages()
                }}>
                {loadingOlder && <span className="chat-thread__loading-older">Loading earlier messages…</span>}
                {loadingMessages && messages.length === 0 && <p className="muted chat-thread__empty">Loading messages…</p>}
                {!loadingMessages && messages.length === 0 && <p className="muted chat-thread__empty">No messages yet. Start the conversation.</p>}
                {messages.map((message, index) => {
                  const mine = Number(message.sender_id) === Number(user?.id)
                  const previous = messages[index - 1]
                  const next = messages[index + 1]
                  const groupedWithPrevious = sameMessageGroup(previous, message)
                  const groupedWithNext = sameMessageGroup(message, next)
                  const newDate = !previous || messageDate(previous.created_at) !== messageDate(message.created_at)
                  return (
                    <Fragment key={message.id}>
                      {newDate && <div className="chat-date-divider"><span>{messageDate(message.created_at)}</span></div>}
                      <article
                        className={`chat-message${mine ? ' chat-message--mine' : ''}${groupedWithPrevious ? ' chat-message--grouped' : ''}`}
                        data-message-id={message.id}
                        onPointerDown={(event) => startMessageGesture(event, message)}
                        onPointerMove={(event) => moveMessageGesture(event, message)}
                        onPointerUp={endMessageGesture}
                        onPointerCancel={endMessageGesture}
                        onContextMenu={(event) => {
                          if (window.matchMedia('(hover: none)').matches) event.preventDefault()
                        }}
                        onMouseEnter={() => showMessageActions(message.id)}
                        onMouseLeave={hideMessageActions}
                        onFocus={() => setActiveMessageActions(message.id)}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget)) setActiveMessageActions(null)
                        }}
                      >
                      {!mine && !groupedWithPrevious && <strong className="chat-message__sender">{message.sender_name}</strong>}
                      {!message.is_unsent && <div className={`chat-message__actions${activeMessageActions === message.id ? ' chat-message__actions--visible' : ''}`} aria-label="Message actions">
                        <button type="button" className={message.my_reaction === 'like' ? 'is-selected' : ''}
                          aria-label="Like message" onClick={() => react(message, 'like')}><ChatIcon name="like" />{Number(message.like_count) ? <span>{message.like_count}</span> : null}</button>
                        <button type="button" className={message.my_reaction === 'dislike' ? 'is-selected' : ''}
                          aria-label="Dislike message" onClick={() => react(message, 'dislike')}><ChatIcon name="dislike" />{Number(message.dislike_count) ? <span>{message.dislike_count}</span> : null}</button>
                        <button type="button" className={message.my_reaction === 'haha' ? 'is-selected' : ''}
                          aria-label="Haha reaction" onClick={() => react(message, 'haha')}><ChatIcon name="haha" />{Number(message.haha_count) ? <span>{message.haha_count}</span> : null}</button>
                        <button type="button" aria-label="Reply to message" onClick={() => startReply(message)}><ChatIcon name="reply" /><span>Reply</span></button>
                        {mine && <button type="button" aria-label="Unsend message" onClick={() => unsend(message)}><ChatIcon name="unsend" /><span>Unsend</span></button>}
                      </div>}
                      <div className="chat-message__bubble">
                        {message.is_unsent
                          ? <em className="muted">This message was unsent.</em>
                          : <>
                            {message.reply_to_message_id && <div className="chat-message__reply-quote">
                              <strong>{message.reply_to_sender_name || 'Message'}</strong>
                              <span>{message.reply_to_is_unsent ? 'This message was unsent.' : message.reply_to_content || (message.reply_to_image_url ? 'Photo' : '')}</span>
                            </div>}
                            {message.content && <p>{message.content}</p>}
                            {message.image_url && <a href={message.image_url} target="_blank" rel="noreferrer"><img src={message.image_url} alt="Shared in chat" loading="lazy" /></a>}
                          </>}
                      </div>
                      <div className="chat-message__meta">
                        {!groupedWithNext && <time>{messageTime(message.created_at)}</time>}
                        {!!Number(message.like_count) && <span aria-label={`${message.like_count} likes`}><ChatIcon name="like" /> {message.like_count}</span>}
                        {!!Number(message.dislike_count) && <span aria-label={`${message.dislike_count} dislikes`}><ChatIcon name="dislike" /> {message.dislike_count}</span>}
                        {!!Number(message.haha_count) && <span aria-label={`${message.haha_count} laugh reactions`}><ChatIcon name="haha" /> {message.haha_count}</span>}
                      </div>
                    </article>
                    </Fragment>
                  )
                })}
                <div ref={bottomRef} />
              </div>
              {image && <div className="chat-composer__image"><img src={image} alt="Attachment preview" /><button type="button" className="btn btn--ghost btn--sm" onClick={() => setImage(null)}>Remove image</button></div>}
              {replyTo && <div className="chat-composer__reply">
                <div><strong>Replying to {replyTo.sender_name}</strong><span>{replyTo.content || (replyTo.image_url ? 'Photo' : '')}</span></div>
                <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>×</button>
              </div>}
              <form className="chat-composer" onSubmit={send}>
                <div className="chat-composer__quick" aria-label="Quick messages">
                  {QUICK_MESSAGES.map((message) => <button type="button" key={message} onClick={() => chooseQuickMessage(message)}>{message}</button>)}
                </div>
                <div className="chat-composer__row">
                  <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()} aria-label="Attach image">＋</button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={attachImage} />
                  <textarea ref={composerRef} rows={2} maxLength={4000} value={content} onChange={(event) => setContent(event.target.value)}
                    placeholder="Write a message…" aria-label="Message" />
                  <button className="btn btn--accent" disabled={busy || (!content.trim() && !image)}>{busy ? 'Sending…' : 'Send'}</button>
                </div>
              </form>
            </>
          ) : <p className="muted chat-thread__empty">Select a conversation to open it.</p>}
        </section>
      </div>
      {toast}
    </section>
  )
}
