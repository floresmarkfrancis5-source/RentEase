import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Glass from '../../components/Glass'
import PropertyLocationPicker from '../../components/PropertyLocationPicker'
import { Field, Modal } from '../../components/ui'
import AssistantAvatar from '../../components/AssistantAvatar'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import ContractTemplateEditor from '../../components/ContractTemplateEditor'
import { parseLeaseTemplate } from '../../lib/leaseContract'

const today = () => new Date().toISOString().slice(0, 10)
const INTRO_PARAGRAPHS = [
  'Ask me about your properties, units, tenants, leases, or rent. I can help you find details and understand what is happening across your rentals.',
  'You can also tell me what you want to set up. I can prepare a property, unit, tenant, or contract draft for you to review.',
  'Just describe what you need in your own words. I’ll ask if I need more details, and nothing is added or changed until you review and confirm it.',
]
const WELCOME_SUGGESTIONS = [
  'Check my unpaid rent for this month',
  'List all my tenants',
  'Draft a new lease agreement',
]
const EMPTY_SETUP = { name: '', type: 'apartment', address: '', city: '', unitCount: '1', monthlyRent: '' }
const formatPeso = (amount) => new Intl.NumberFormat('en-PH', {
  style: 'currency', currency: 'PHP', maximumFractionDigits: 0,
}).format(amount)
const numberedUnitName = (name) => {
  const match = String(name || '').trim().match(/^(.*?)\s*#?\s*(\d+)$/)
  return match ? { prefix: match[1].trim() || 'Unit', number: Number(match[2]) } : null
}
const normaliseProposal = (proposal) => {
  const units = proposal.units || []
  const namedUnits = units.map((unit) => ({ ...unit, parsedName: numberedUnitName(unit.unit_name) }))
  const customNumbered = namedUnits.filter((unit) => unit.parsedName
    && unit.parsedName.prefix.toLowerCase() !== 'unit')
  const prefix = customNumbered[0]?.parsedName.prefix || 'Unit'
  let nextNumber = customNumbered.length
    ? Math.max(...customNumbered.filter((unit) => unit.parsedName.prefix.toLowerCase() === prefix.toLowerCase())
      .map((unit) => unit.parsedName.number)) + 1
    : 101
  const unitNames = namedUnits.map((unit, index) => {
    const name = String(unit.unit_name || '').trim()
    const isDefaultNumbered = !name || (unit.parsedName && unit.parsedName.prefix.toLowerCase() === 'unit')
    if (customNumbered.length && isDefaultNumbered) return `${prefix} ${nextNumber++}`
    if (!customNumbered.length && isDefaultNumbered) return `Unit ${101 + index}`
    return name
  })
  return {
    property: {
      ...(proposal.property || {}),
      name: String(proposal.property?.name ?? ''),
      type: ['apartment', 'boarding_house'].includes(proposal.property?.type) ? proposal.property.type : 'apartment',
      address: String(proposal.property?.address ?? ''),
      city: String(proposal.property?.city ?? ''),
      barangay: String(proposal.property?.barangay ?? ''),
      latitude: proposal.property?.latitude ?? '',
      longitude: proposal.property?.longitude ?? '',
      description: String(proposal.property?.description ?? ''),
    },
    units: units.map((unit, index) => ({
      ...unit,
      unit_name: unitNames[index],
      monthly_rent: unit.monthly_rent ?? '',
      capacity: Number.isInteger(Number(unit.capacity)) ? Number(unit.capacity) : 1,
      condition_tag: unit.condition_tag === 'under_maintenance' ? 'under_maintenance' : 'good_condition',
    })),
    tenants: (proposal.tenants || []).map((tenant) => ({
      ...tenant,
      username: String(tenant.username ?? ''),
      email: String(tenant.email ?? ''),
      full_name: String(tenant.full_name ?? ''),
      phone: String(tenant.phone ?? ''),
      start_date: tenant.start_date || today(),
      monthly_rent: tenant.monthly_rent ?? '',
      deposit: tenant.deposit ?? 0,
      due_day: tenant.due_day ?? 5,
      unit_index: Number(tenant.unit_index || 0),
    })),
  }
}
const activeReplySuggestions = (messages) => {
  let suggestions = []
  let sourceIndex = -1
  let displayIndex = -1
  messages.forEach((message, index) => {
    if (message.role === 'assistant') {
      displayIndex = index
      const currentSuggestions = Array.isArray(message.proposal?.suggestions)
        ? message.proposal.suggestions.filter((suggestion) => typeof suggestion === 'string' && suggestion.trim())
        : []
      if (currentSuggestions.length > 0) {
        suggestions = currentSuggestions
        sourceIndex = index
      }
    } else if (message.role === 'user' && suggestions.some(
      (suggestion) => suggestion.toLowerCase() === String(message.content || '').trim().toLowerCase(),
    )) {
      suggestions = []
      sourceIndex = -1
    }
  })
  return suggestions.length ? { suggestions, sourceIndex, displayIndex } : null
}
const renderAssistantInline = (text, keyPrefix) => {
  const parts = String(text).split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`)/g)
  return parts.map((part, index) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={`${keyPrefix}-${index}`}>{part.slice(1, -1)}</code>
    }
    return part
  })
}
const AssistantMessageContent = ({ content }) => {
  const lines = String(content || '').split(/\r?\n/)
  const blocks = []
  let paragraph = []
  let list = []
  let listType = null
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', lines: paragraph })
      paragraph = []
    }
  }
  const flushList = () => {
    if (list.length) {
      blocks.push({ type: listType, items: list })
      list = []
      listType = null
    }
  }
  lines.forEach((line) => {
    const bullet = line.match(/^\s*[-*•]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    const match = bullet || numbered
    const nextListType = bullet ? 'ul' : numbered ? 'ol' : null
    if (match) {
      flushParagraph()
      if (listType && listType !== nextListType) flushList()
      listType = nextListType
      list.push(match[1])
      return
    }
    flushList()
    if (line.trim()) paragraph.push(line)
    else flushParagraph()
  })
  flushList()
  flushParagraph()

  return (
    <div className="assistant-message__body">
      {blocks.map((block, blockIndex) => {
        if (block.type === 'paragraph') {
          return (
            <p key={`paragraph-${blockIndex}`}>
              {block.lines.map((line, lineIndex) => (
                <span key={`line-${lineIndex}`}>
                  {lineIndex > 0 && <br />}
                  {renderAssistantInline(line, `paragraph-${blockIndex}-${lineIndex}`)}
                </span>
              ))}
            </p>
          )
        }
        const List = block.type
        return (
          <List key={`${block.type}-${blockIndex}`}>
            {block.items.map((item, itemIndex) => (
              <li key={`item-${itemIndex}`}>{renderAssistantInline(item, `list-${blockIndex}-${itemIndex}`)}</li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
const draftIssues = (draft) => {
  if (!draft) return []
  const issues = []
  const usedUnits = new Set()
  const usernames = new Set()
  const emails = new Set()
  if (String(draft.property.name || '').trim().length < 2) issues.push('Add a property name (at least 2 characters).')
  if (!String(draft.property.address || '').trim()) issues.push('Add the property street address.')
  if (!draft.units.length) issues.push('Add at least one unit.')
  draft.units.forEach((unit, index) => {
    if (!String(unit.unit_name || '').trim()) issues.push(`Add a name for Unit ${index + 1}.`)
    if (!Number.isFinite(Number(unit.monthly_rent)) || Number(unit.monthly_rent) < 1) {
      issues.push(`Enter a monthly rent of at least ₱1 for ${unit.unit_name || `Unit ${index + 1}`}.`)
    }
    if (!Number.isInteger(Number(unit.capacity)) || Number(unit.capacity) < 1 || Number(unit.capacity) > 50) {
      issues.push(`Set the capacity for ${unit.unit_name || `Unit ${index + 1}`} to between 1 and 50.`)
    }
  })
  draft.tenants.forEach((tenant, index) => {
    const username = String(tenant.username || '').trim().toLowerCase()
    const email = String(tenant.email || '').trim().toLowerCase()
    const unitIndex = Number(tenant.unit_index)
    if (username.length < 3) issues.push(`Add a username of at least 3 characters for tenant ${index + 1}.`)
    if (String(tenant.full_name || '').trim().length < 2) issues.push(`Add the full name for tenant ${index + 1}.`)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push(`Enter a valid email address for tenant ${index + 1}.`)
    if (!Number.isInteger(unitIndex) || unitIndex < 0 || unitIndex >= draft.units.length) {
      issues.push(`Choose a unit for tenant ${index + 1}.`)
    } else {
      if (usedUnits.has(unitIndex)) issues.push('Assign each tenant to a different unit.')
      if (draft.units[unitIndex]?.condition_tag !== 'good_condition') {
        issues.push(`Tenant ${index + 1} must be assigned to a unit in good condition.`)
      }
      usedUnits.add(unitIndex)
    }
    if (usernames.has(username)) issues.push('Each tenant needs a unique username.')
    if (emails.has(email)) issues.push('Each tenant needs a unique email address.')
    usernames.add(username)
    emails.add(email)
  })
  return issues
}

export default function Assistant({
  embedded = false,
  handoffDraft: embeddedHandoff,
  onHandoffChange: onEmbeddedHandoffChange,
  onClose,
  onMaximize,
}) {
  const outletContext = useOutletContext()
  const handoffDraft = embedded ? embeddedHandoff : outletContext?.assistantDraftHandoff
  const onHandoffChange = embedded ? onEmbeddedHandoffChange : outletContext?.setAssistantDraftHandoff
  const { user, updateUser } = useAuth()
  const [messages, setMessages] = useState([])
  const [conversations, setConversations] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [error, setError] = useState('')
  const [credentials, setCredentials] = useState([])
  const [guidedOpen, setGuidedOpen] = useState(false)
  const [setup, setSetup] = useState(EMPTY_SETUP)
  const [insight, setInsight] = useState(null)
  const [unitsOpen, setUnitsOpen] = useState(false)
  const [loadingUnitProperties, setLoadingUnitProperties] = useState(false)
  const [unitProperties, setUnitProperties] = useState([])
  const [unitForm, setUnitForm] = useState({ propertyId: '', count: '1', monthlyRent: '' })
  const [existingUnitNames, setExistingUnitNames] = useState([])
  const [unitReview, setUnitReview] = useState(null)
  const [contractDraft, setContractDraft] = useState(null)
  const [contractTargets, setContractTargets] = useState({ properties: [], units: [] })
  const [contractTargetType, setContractTargetType] = useState('property')
  const [contractTargetId, setContractTargetId] = useState('')
  const [contractReview, setContractReview] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const messagesEndRef = useRef(null)
  const handoffDraftRef = useRef(handoffDraft)
  handoffDraftRef.current = handoffDraft
  const issues = draftIssues(draft)
  useEffect(() => {
    if (!unitsOpen || !unitForm.propertyId) {
      setExistingUnitNames([])
      return undefined
    }
    let cancelled = false
    api(`/api/admin/units?property_id=${encodeURIComponent(unitForm.propertyId)}`, { auth: true })
      .then((result) => {
        if (!cancelled) setExistingUnitNames((result.data || []).map((unit) => unit.unit_name))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => { cancelled = true }
  }, [unitsOpen, unitForm.propertyId])

  useEffect(() => {
    if (conversationId && onHandoffChange) {
      onHandoffChange({ conversationId, draft })
    }
  }, [conversationId, draft, onHandoffChange])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [messages, busy, insight])

  useEffect(() => {
    let cancelled = false
    async function initialise() {
      try {
        const result = await api('/api/admin/assistant/conversations', { auth: true })
        if (cancelled) return
        const items = result.data || []
        setConversations(items)
        if (items.length) {
          await loadConversation(items[0].id, () => cancelled)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoadingConversations(false)
      }
    }
    initialise()
    return () => { cancelled = true }
  }, [])

  async function loadConversation(id, isCancelled = () => false) {
    const result = await api(`/api/admin/assistant/conversations/${id}`, { auth: true })
    if (isCancelled()) return
    const conversation = result.data
    setConversationId(conversation.id)
    setMessages(conversation.messages || [])
    const lastAssistantMessage = [...(conversation.messages || [])].reverse().find((item) => item.role === 'assistant')
    const savedProposal = lastAssistantMessage?.proposal
    const savedDraft = savedProposal && !savedProposal.kind ? normaliseProposal(savedProposal) : null
    if (savedProposal?.kind === 'contract_draft') {
      setContractDraft(savedProposal)
      setContractTargetType('property')
      setContractTargetId('')
      const [propertiesResult, unitsResult] = await Promise.all([
        api('/api/admin/properties', { auth: true }),
        api('/api/admin/units', { auth: true }),
      ])
      if (isCancelled()) return
      setContractTargets({ properties: propertiesResult.data || [], units: unitsResult.data || [] })
    } else {
      setContractDraft(null)
      setContractTargets({ properties: [], units: [] })
      setContractTargetType('property')
      setContractTargetId('')
    }
    setContractReview(null)
    setReviewOpen(false)
    const handoff = handoffDraftRef.current
    const activeHandoff = savedDraft && Number(handoff?.conversationId) === Number(conversation.id)
      ? handoff.draft
      : savedDraft
    setDraft(activeHandoff)
    setText('')
    setEditingMessageId(null)
    setCredentials([])
    setGuidedOpen(false)
    setUnitsOpen(false)
    setUnitReview(null)
    setInsight(null)
    setError('')
    return conversation
  }

  useEffect(() => {
    const targetId = Number(handoffDraft?.conversationId)
    if (!embedded || !targetId || !conversationId || Number(conversationId) === targetId) return undefined
    let active = true
    loadConversation(targetId, () => !active).catch((err) => {
      if (active) setError(err.message)
    })
    return () => { active = false }
  }, [embedded, handoffDraft?.conversationId, conversationId])

  async function createConversation(isCancelled = () => false) {
    const result = await api('/api/admin/assistant/conversations', { method: 'POST', auth: true })
    if (isCancelled()) return
    setConversationId(result.data.id)
    setMessages([])
    setDraft(null)
    setText('')
    setEditingMessageId(null)
    setCredentials([])
    setSetup(EMPTY_SETUP)
    setGuidedOpen(false)
    setUnitsOpen(false)
    setUnitReview(null)
    setContractDraft(null)
    setContractTargets({ properties: [], units: [] })
    setContractTargetType('property')
    setContractTargetId('')
    setContractReview(null)
    setReviewOpen(false)
    setInsight(null)
    setError('')
    setConversations((items) => [result.data, ...items])
  }

  async function startNewConversation() {
    if ((draft || unitReview || contractDraft || contractReview) && !window.confirm('Start a new chat? Any unsaved changes in your review will be lost.')) return
    setBusy(true)
    setError('')
    try {
      await createConversation()
      setMobileThreadOpen(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function refreshConversations() {
    const result = await api('/api/admin/assistant/conversations', { auth: true })
    setConversations(result.data || [])
  }

  async function sendMessage(rawMessage) {
    const message = rawMessage.trim()
    if (!message || busy) return
    setBusy(true)
    setError('')
    setText('')
    let activeId = conversationId
    try {
      if (!activeId) {
        const created = await api('/api/admin/assistant/conversations', { method: 'POST', auth: true })
        activeId = created.data.id
        setConversationId(activeId)
        setConversations((items) => [created.data, ...items])
      }
      const previousMessages = messages
      const editedIndex = editingMessageId === null
        ? -1
        : previousMessages.findIndex((item) => Number(item.id) === Number(editingMessageId))
      const result = await api('/api/admin/assistant/chat', {
        method: 'POST',
        auth: true,
        body: {
          message,
          conversation_id: activeId,
          ...(editingMessageId !== null ? { edit_message_id: editingMessageId } : {}),
        },
      })
      const response = result?.data
      if (!response || typeof response !== 'object'
        || response.user_message_id == null
        || response.assistant_message_id == null
        || typeof response.reply !== 'string') {
        throw new Error(result?.error || 'The Assistant returned an incomplete response. Your message may have been saved; refresh the conversation before retrying.')
      }
      const pair = [
        { id: response.user_message_id, role: 'user', content: message },
        { id: response.assistant_message_id, role: 'assistant', content: response.reply, proposal: response.proposal },
      ]
      setConversationId(response.conversation_id)
      setMessages((current) => (editedIndex >= 0 ? current.slice(0, editedIndex) : current).concat(pair))
      if (response.proposal?.kind === 'contract_draft') {
        setContractDraft(response.proposal)
        setContractReview(null)
        setDraft(null)
        setReviewOpen(false)
        const [propertiesResult, unitsResult] = await Promise.all([
          api('/api/admin/properties', { auth: true }),
          api('/api/admin/units', { auth: true }),
        ])
        setContractTargets({ properties: propertiesResult.data || [], units: unitsResult.data || [] })
        setContractTargetType('property')
        setContractTargetId('')
      } else if (response.proposal?.kind === 'database_answer'
        || response.proposal?.kind === 'assistant_response') {
        setDraft(null)
        setReviewOpen(false)
        setContractDraft(null)
        setContractReview(null)
        setReviewOpen(false)
        setContractTargets({ properties: [], units: [] })
        setContractTargetType('property')
        setContractTargetId('')
      } else if (response.proposal
        && response.proposal.property && Array.isArray(response.proposal.units)) {
        setDraft(normaliseProposal(response.proposal))
        setContractDraft(null)
        setContractReview(null)
        setReviewOpen(false)
      } else if (response.proposal == null) {
        setDraft(null)
        setContractDraft(null)
        setContractReview(null)
        setReviewOpen(false)
        setContractTargets({ properties: [], units: [] })
      } else {
        throw new Error('The Assistant returned a draft format this screen cannot review.')
      }
      setEditingMessageId(null)
      setGuidedOpen(false)
      await refreshConversations()
    } catch (err) {
      setError(err.message)
      if (activeId) {
        try {
          const draftBeforeRetry = draft
          const savedConversation = await loadConversation(activeId)
          if (draftBeforeRetry) setDraft(draftBeforeRetry)
          const lastMessage = savedConversation.messages?.[savedConversation.messages.length - 1]
          if (lastMessage?.role === 'user' && lastMessage.content === message) {
            setEditingMessageId(lastMessage.id)
          }
          await refreshConversations()
        } catch (loadError) {
          setError(`${err.message} ${loadError.message}`)
        }
      }
      setText(message)
    } finally {
      setBusy(false)
    }
  }

  function send(event) {
    event.preventDefault()
    sendMessage(text)
  }

  async function openProposal(proposal) {
    if (proposal?.kind === 'contract_draft') {
      setContractDraft(proposal)
      setContractReview(null)
      setContractTargetType('property')
      setContractTargetId('')
      setReviewOpen(true)
      try {
        const [propertiesResult, unitsResult] = await Promise.all([
          api('/api/admin/properties', { auth: true }),
          api('/api/admin/units', { auth: true }),
        ])
        setContractTargets({ properties: propertiesResult.data || [], units: unitsResult.data || [] })
      } catch (err) {
        setReviewOpen(false)
        setError(err.message)
        return
      }
    } else if (proposal?.property && Array.isArray(proposal.units)) {
      setDraft(normaliseProposal(proposal))
      setContractDraft(null)
      setContractReview(null)
      setReviewOpen(true)
    } else {
      return
    }
    setGuidedOpen(false)
    setUnitsOpen(false)
    setError('')
  }

  function requestDraftChange() {
    setText('I would like to change something in the draft: ')
    document.getElementById('assistant-message')?.focus()
  }

  function startGuidedSetup(event) {
    event.preventDefault()
    const unitCount = Number(setup.unitCount)
    if (!setup.name.trim() || !setup.address.trim() || !Number.isInteger(unitCount) || unitCount < 1 || unitCount > 100
      || !Number.isFinite(Number(setup.monthlyRent)) || Number(setup.monthlyRent) < 1) {
      setError('Enter a property name, street address, 1–100 units, and monthly rent of at least ₱1.')
      return
    }
    const unitList = Array.from({ length: unitCount }, (_, index) => `Unit ${101 + index}`).join(', ')
    const message = [
      `Please draft a new ${setup.type === 'boarding_house' ? 'boarding house' : 'apartment'} property.`,
      `Property name: ${setup.name.trim()}.`,
      `Street address: ${setup.address.trim()}.`,
      setup.city.trim() ? `City or municipality: ${setup.city.trim()}.` : '',
      `Create ${unitCount} units, labeled ${unitList}.`,
      `Set the monthly rent for each unit to PHP ${Number(setup.monthlyRent).toFixed(2)}.`,
      'Do not add tenants. Ask me if any required information is missing.',
    ].filter(Boolean).join(' ')
    setError('')
    sendMessage(message)
  }

  function prepareContractReview(type, id) {
    const target = (type === 'property' ? contractTargets.properties : contractTargets.units)
      .find((item) => String(item.id) === String(id))
    if (!target || !contractDraft) return
    const templateValue = type === 'unit'
      ? (target.contract_template || target.property_contract_template)
      : target.contract_template
    const template = parseLeaseTemplate(templateValue)
    const clauses = template.clauses.map((clause) => ({ ...clause }))
    const additions = contractDraft.clauses || []
    additions.forEach((addition, index) => {
      const match = clauses.findIndex((clause) => clause.title.trim().toLowerCase() === addition.title.trim().toLowerCase())
      if (match >= 0) {
        clauses[match] = { ...clauses[match], text: addition.text, enabled: true }
      } else if (clauses.length < 16) {
        clauses.push({
          id: `assistant-${Date.now()}-${index}`,
          title: addition.title,
          text: addition.text,
          enabled: true,
        })
      }
    })
    const mergedRules = [...template.rules]
    ;(contractDraft.rules || []).forEach((rule) => {
      if (!mergedRules.includes(rule) && mergedRules.length < 30) mergedRules.push(rule)
    })
    const utilities = { ...template.utilities, ...(contractDraft.utilities || {}) }
    const notices = { ...template.notices, ...(contractDraft.notices || {}) }
    setContractTargetType(type)
    setContractTargetId(String(id))
    setContractReview({
      key: `${type}-${id}-${Date.now()}`,
      targetName: type === 'property' ? target.name : `${target.property_name} · ${target.unit_name}`,
      template: { ...template, clauses, rules: mergedRules, utilities, notices },
    })
    setError('')
  }

  async function saveContractReview() {
    if (!contractReview || !contractTargetId) return
    const target = (contractTargetType === 'property' ? contractTargets.properties : contractTargets.units)
      .find((item) => String(item.id) === contractTargetId)
    if (!target) {
      setError('Choose a property or unit for this contract draft.')
      return
    }
    if (!window.confirm(`Save the reviewed contract template for ${contractReview.targetName}? This affects future lease offers.`)) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/${contractTargetType === 'property' ? 'properties' : 'units'}/${target.id}`, {
        method: 'PATCH',
        auth: true,
        body: { contract_template: contractReview.template },
      })
      setContractDraft(null)
      setContractReview(null)
      setReviewOpen(false)
      if (conversationId) {
        try {
          await api(`/api/admin/assistant/conversations/${conversationId}/confirmation`, {
            method: 'POST',
            auth: true,
            body: { message: `Saved contract template for ${contractReview.targetName}.` },
          })
          const conversation = await api(`/api/admin/assistant/conversations/${conversationId}`, { auth: true })
          setMessages(conversation.data.messages || [])
          await refreshConversations()
        } catch (historyError) {
          setError(`The contract was saved, but the conversation log could not be updated: ${historyError.message}`)
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function openPropertySetup() {
    if (unitReview && !window.confirm('Discard the current unit review?')) return
    setGuidedOpen(true)
    setUnitsOpen(false)
    setUnitReview(null)
    setInsight(null)
    setError('')
  }

  async function openAddUnits() {
    if (unitReview && !window.confirm('Discard the current unit review?')) return
    setUnitsOpen(true)
    setGuidedOpen(false)
    setUnitReview(null)
    setInsight(null)
    setError('')
    setLoadingUnitProperties(true)
    try {
      const result = await api('/api/admin/properties', { auth: true })
      const properties = result.data || []
      setUnitProperties(properties)
      setUnitForm((current) => ({
        ...current,
        propertyId: properties.some((property) => String(property.id) === current.propertyId)
          ? current.propertyId : String(properties[0]?.id || ''),
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingUnitProperties(false)
    }
  }

  function prepareUnits(event) {
    event.preventDefault()
    const count = Number(unitForm.count)
    const rent = Number(unitForm.monthlyRent)
    if (!unitForm.propertyId || !Number.isInteger(count) || count < 1 || count > 100
      || !Number.isFinite(rent) || rent < 0) {
      setError('Choose a property, select 1–100 units, and enter a rent of at least ₱0.')
      return
    }
    const used = new Set(existingUnitNames.map((name) => String(name).trim().toLowerCase()))
    const units = []
    let number = 1
    while (units.length < count) {
      const name = `Unit ${number++}`
      if (!used.has(name.toLowerCase())) {
        used.add(name.toLowerCase())
        units.push({ unit_name: name, monthly_rent: rent.toFixed(2), capacity: 1, condition_tag: 'good_condition' })
      }
    }
    setUnitReview(units)
    setError('')
  }

  async function saveUnits() {
    const property = unitProperties.find((item) => String(item.id) === unitForm.propertyId)
    if (!property || !unitReview?.length) return
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/admin/assistant/units', {
        method: 'POST',
        auth: true,
        body: { property_id: Number(unitForm.propertyId), units: unitReview },
      })
      setInsight({ action: 'success', message: result.message, property_name: property.name })
      setUnitReview(null)
      setUnitsOpen(false)
      setReviewOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function editMessage(message) {
    setEditingMessageId(message.id)
    setText(message.content)
    setDraft(null)
    setReviewOpen(false)
    setError('')
  }

  async function copyMessage(content) {
    try {
      await navigator.clipboard.writeText(content)
      setError('')
    } catch {
      setError('Could not copy the message. Check clipboard permissions and try again.')
    }
  }

  async function deleteConversation(id) {
    if (!window.confirm('Delete this conversation and all its messages? This cannot be undone.')) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/admin/assistant/conversations/${id}`, { method: 'DELETE', auth: true })
      const remaining = conversations.filter((item) => Number(item.id) !== Number(id))
      setConversations(remaining)
      if (Number(conversationId) === Number(id)) {
        if (remaining.length) await loadConversation(remaining[0].id)
        else {
          setConversationId(null)
          setMessages([])
          setDraft(null)
          setContractDraft(null)
          setContractReview(null)
          setText('')
          setEditingMessageId(null)
          setCredentials([])
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function selectConversation(id) {
    if (busy) return
    if (Number(conversationId) === Number(id)) {
      setMobileThreadOpen(true)
      return
    }
    if ((draft || unitReview || contractDraft || contractReview)
      && !window.confirm('Open another conversation? Unsaved review changes will be lost.')) return
    setBusy(true)
    setError('')
    try {
      await loadConversation(id)
      setMobileThreadOpen(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function updateProperty(patch) {
    setDraft((current) => ({ ...current, property: { ...current.property, ...patch } }))
  }

  function updateUnit(index, patch) {
    setDraft((current) => ({ ...current, units: current.units.map((unit, i) => i === index ? { ...unit, ...patch } : unit) }))
  }

  function updateTenant(index, patch) {
    setDraft((current) => ({ ...current, tenants: current.tenants.map((tenant, i) => i === index ? { ...tenant, ...patch } : tenant) }))
  }

  function addUnit() {
    setDraft((current) => {
      if (!current || current.units.length >= 100) return current
      const numberedNames = current.units.map((unit) => numberedUnitName(unit.unit_name)).filter(Boolean)
      const prefix = numberedNames.find((item) => item.prefix.toLowerCase() !== 'unit')?.prefix
        || numberedNames[0]?.prefix
        || 'Unit'
      const matchingNumbers = numberedNames
        .filter((item) => item.prefix.toLowerCase() === prefix.toLowerCase())
        .map((item) => item.number)
      let nextNumber = matchingNumbers.length ? Math.max(...matchingNumbers) + 1 : 101
      const usedNames = new Set(current.units.map((unit) => String(unit.unit_name).trim().toLowerCase()))
      while (usedNames.has(`${prefix} ${nextNumber}`.toLowerCase())) nextNumber += 1
      return {
        ...current,
        units: [...current.units, {
          unit_name: `${prefix} ${nextNumber}`,
          monthly_rent: current.units[0]?.monthly_rent ?? '',
          capacity: 1,
          condition_tag: 'good_condition',
        }],
      }
    })
  }

  function removeUnit(index) {
    if (draft.tenants.some((tenant) => Number(tenant.unit_index) === index)) {
      setError('Move the tenant to another unit before removing this one.')
      return
    }
    setDraft((current) => {
      if (!current || current.units.length <= 1) return current
      const units = current.units.filter((_, unitIndex) => unitIndex !== index)
      const tenants = current.tenants.map((tenant) => ({
        ...tenant,
        unit_index: Number(tenant.unit_index) > index ? Number(tenant.unit_index) - 1 : Number(tenant.unit_index),
      }))
      return { ...current, units, tenants }
    })
  }

  async function confirm() {
    if (issues.length) {
      setError(`Please complete the draft before saving: ${issues.join(' ')}`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api('/api/admin/onboarding', { method: 'POST', auth: true, body: draft })
      updateUser({ onboarding_completed: true })
      setCredentials(result.tenant_credentials || [])
      setDraft(null)
      setReviewOpen(false)
      try {
        await api(`/api/admin/assistant/conversations/${conversationId}/confirmation`, {
          method: 'POST', auth: true, body: { message: result.message },
        })
        const conversation = await api(`/api/admin/assistant/conversations/${conversationId}`, { auth: true })
        setMessages(conversation.data.messages || [])
        await refreshConversations()
      } catch (historyError) {
        setError(`Your rental setup was created, but its confirmation could not be saved to this conversation: ${historyError.message}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function chooseReplySuggestion(suggestion) {
    const active = activeReplySuggestions(messages)
    if (active) {
      setMessages((current) => current.map((message, index) => index === active.sourceIndex
        ? { ...message, proposal: { ...message.proposal, suggestions: [] } }
        : message))
    }
    sendMessage(suggestion)
  }

  const replySuggestions = activeReplySuggestions(messages)

  return (
    <section className={`assistant-page${embedded ? ' assistant-page--embedded' : ''}`}>
      <div className={`assistant-workspace${mobileThreadOpen ? ' assistant-workspace--mobile-thread' : ''}`}>
        <Glass className="assistant-history">
          <div className="assistant-history__head">
            <h2>Chats</h2>
            <button className="btn btn--accent" type="button" disabled={busy || loadingConversations} onClick={startNewConversation}>New chat</button>
          </div>
          {loadingConversations ? <p className="muted">Loading saved conversations…</p> : (
            <ul className="assistant-history__list">
              {conversations.map((conversation) => (
                <li key={conversation.id} className={Number(conversation.id) === Number(conversationId) ? 'is-active' : ''}>
                  <button className="assistant-history__select" type="button" disabled={busy}
                    onClick={() => selectConversation(conversation.id)}>
                    <strong>{conversation.title || 'New conversation'}</strong>
                    <small>{new Date(String(conversation.updated_at).replace(' ', 'T')).toLocaleString()}</small>
                  </button>
                  <button className="assistant-history__delete" type="button" disabled={busy}
                    aria-label={`Delete ${conversation.title || 'conversation'}`}
                    onClick={() => deleteConversation(conversation.id)}>Delete</button>
                </li>
              ))}
              {!conversations.length && <li className="muted">No saved conversations yet.</li>}
            </ul>
          )}
        </Glass>

        <Glass className="assistant-chat">
          {embedded ? (
            <div className="assistant-chat__header assistant-chat__header--embedded">
              <AssistantAvatar />
              <div className="assistant-chat__identity">
                <h2>RentEaseAssist</h2>
                <p>Property setup, account insights, and contract drafts — with you in control.</p>
              </div>
              <div className="assistant-chat__header-actions">
                <button type="button" className="assistant-chat__header-button" disabled={busy || loadingConversations}
                  onClick={startNewConversation}>New chat</button>
                <button type="button" className="assistant-chat__header-icon" onClick={onMaximize}
                  aria-label="Open full Assistant dashboard" title="Open full Assistant dashboard">
                  <svg viewBox="0 0 24 24" aria-hidden><path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8" /></svg>
                </button>
                <button type="button" className="assistant-chat__header-icon" onClick={onClose}
                  aria-label="Close assistant" title="Close assistant">
                  <svg viewBox="0 0 24 24" aria-hidden><path d="m18 6-12 12M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="assistant-chat__header">
              <button type="button" className="assistant-chat__back"
                onClick={() => setMobileThreadOpen(false)} aria-label="Back to conversations"
                title="Back to conversations">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <AssistantAvatar />
              <div className="assistant-chat__identity">
                <h2>RentEaseAssist</h2>
                <p>Property setup, account insights, and contract drafts — with you in control.</p>
              </div>
            </div>
          )}
          {embedded && error && <p className="alert alert--error assistant-chat__error" role="alert">{error}</p>}
          {!draft && (
            <div className="assistant-guided">
              <div className="assistant-setup-actions" aria-label="Property setup actions">
                <span>Property setup</span>
                <button type="button" aria-expanded={guidedOpen} onClick={() => {
                  if (guidedOpen) {
                    if (unitReview && !window.confirm('Discard the current unit review?')) return
                    setGuidedOpen(false)
                    setUnitReview(null)
                  } else {
                    openPropertySetup()
                  }
                }}>Set up property</button>
                <button type="button" aria-expanded={unitsOpen} onClick={() => {
                  if (unitsOpen) {
                    if (unitReview && !window.confirm('Discard the current unit review?')) return
                    setUnitsOpen(false)
                    setUnitReview(null)
                  } else {
                    openAddUnits()
                  }
                }}>Add units</button>
              </div>
              {guidedOpen && (
                <Modal title="Set up a property" onClose={() => setGuidedOpen(false)} className="assistant-review-modal">
                  {error && !reviewOpen && !guidedOpen && !unitsOpen
                    && <p className="alert alert--error" role="alert">{error}</p>}
                  <form className="assistant-guided__form" onSubmit={startGuidedSetup}>
                  <div className="assistant-guided__grid">
                    <Field label="Property name">
                      <input value={setup.name} maxLength={120} required placeholder="e.g. Sampaguita Apartments"
                        onChange={(event) => setSetup((current) => ({ ...current, name: event.target.value }))} />
                    </Field>
                    <Field label="Property type">
                      <select value={setup.type} onChange={(event) => setSetup((current) => ({ ...current, type: event.target.value }))}>
                        <option value="apartment">Apartment</option>
                        <option value="boarding_house">Boarding house</option>
                      </select>
                    </Field>
                    <Field label="Street address">
                      <input value={setup.address} maxLength={255} required placeholder="House number and street"
                        onChange={(event) => setSetup((current) => ({ ...current, address: event.target.value }))} />
                    </Field>
                    <Field label="City or municipality (optional)">
                      <input value={setup.city} maxLength={100} placeholder="e.g. Calapan City"
                        onChange={(event) => setSetup((current) => ({ ...current, city: event.target.value }))} />
                    </Field>
                    <Field label="Number of units">
                      <div className="assistant-count-options" role="group" aria-label="Choose number of units">
                        {[1, 2, 3, 4, 5, 10].map((count) => (
                          <button key={count} type="button" aria-pressed={Number(setup.unitCount) === count}
                            onClick={() => setSetup((current) => ({ ...current, unitCount: String(count) }))}>{count}</button>
                        ))}
                        <button type="button" aria-pressed={!([1, 2, 3, 4, 5, 10].includes(Number(setup.unitCount)))}
                          onClick={() => setSetup((current) => ({ ...current, unitCount: '6' }))}>Other</button>
                      </div>
                      {!([1, 2, 3, 4, 5, 10].includes(Number(setup.unitCount))) && (
                        <input type="number" min="1" max="100" step="1" required value={setup.unitCount}
                          aria-label="Custom number of units"
                          onChange={(event) => setSetup((current) => ({ ...current, unitCount: event.target.value }))} />
                      )}
                    </Field>
                    <Field label="Monthly rent per unit (₱)">
                      <input type="number" min="1" step="0.01" required value={setup.monthlyRent} placeholder="e.g. 6500"
                        onChange={(event) => setSetup((current) => ({ ...current, monthlyRent: event.target.value }))} />
                    </Field>
                  </div>
                  <div className="assistant-guided__actions">
                    <p>You can adjust unit names, rent, and condition before saving.</p>
                    <button className="btn btn--accent" disabled={busy || loadingConversations}>Create draft</button>
                  </div>
                  </form>
                </Modal>
              )}
              {unitsOpen && (
                <Modal title="Add units" onClose={() => setUnitsOpen(false)} className="assistant-review-modal">
                  {!embedded && error && <p className="alert alert--error" role="alert">{error}</p>}
                  <form className="assistant-guided__form" onSubmit={prepareUnits}>
                  {loadingUnitProperties ? <p className="muted" role="status">Loading your properties…</p>
                    : !unitProperties.length ? <p className="muted">Add a property before creating units.</p> : <>
                    <div className="assistant-guided__grid">
                      <Field label="Property">
                        <select required value={unitForm.propertyId} onChange={(event) => setUnitForm((current) => ({ ...current, propertyId: event.target.value }))}>
                          {unitProperties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                        </select>
                      </Field>
                      <Field label="Number of units">
                        <div className="assistant-count-options" role="group" aria-label="Choose number of units">
                          {[1, 2, 3, 5, 10].map((count) => (
                            <button key={count} type="button" aria-pressed={Number(unitForm.count) === count}
                              onClick={() => setUnitForm((current) => ({ ...current, count: String(count) }))}>{count}</button>
                          ))}
                          <button type="button" aria-pressed={!([1, 2, 3, 5, 10].includes(Number(unitForm.count)))}
                            onClick={() => setUnitForm((current) => ({ ...current, count: '6' }))}>Other</button>
                        </div>
                        {!([1, 2, 3, 5, 10].includes(Number(unitForm.count))) && (
                          <input type="number" min="1" max="100" step="1" required value={unitForm.count}
                            aria-label="Custom number of units"
                            onChange={(event) => setUnitForm((current) => ({ ...current, count: event.target.value }))} />
                        )}
                      </Field>
                      <Field label="Monthly rent per unit (₱)">
                        <input type="number" min="0" step="0.01" required value={unitForm.monthlyRent}
                          onChange={(event) => setUnitForm((current) => ({ ...current, monthlyRent: event.target.value }))} />
                      </Field>
                    </div>
                    <button className="btn btn--accent" disabled={busy || !unitForm.propertyId}>Review units</button>
                    {unitReview && <>
                      <p className="assistant-units-review__note">Review these {unitReview.length} units for {unitProperties.find((item) => String(item.id) === unitForm.propertyId)?.name}. They will only be added after you confirm.</p>
                      <div className="assistant-units-review">
                        {unitReview.map((unit, index) => (
                          <div className="assistant-units-review__row" key={index}>
                            <Field label={`Unit ${index + 1} name`}>
                              <input value={unit.unit_name} maxLength={50} onChange={(event) => setUnitReview((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unit_name: event.target.value } : item))} />
                            </Field>
                            <Field label="Monthly rent (₱)">
                              <input type="number" min="0" step="0.01" value={unit.monthly_rent} onChange={(event) => setUnitReview((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, monthly_rent: event.target.value } : item))} />
                            </Field>
                          </div>
                        ))}
                      </div>
                      <button className="btn btn--accent" type="button" disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Add ${unitReview.length} unit(s) to ${unitProperties.find((item) => String(item.id) === unitForm.propertyId)?.name}?`)) saveUnits()
                        }}>{busy ? 'Adding…' : 'Confirm and add units'}</button>
                    </>}
                  </>}
                  </form>
                </Modal>
              )}
            </div>
          )}
          <div className="assistant-chat__messages" aria-live="polite">
            {!loadingConversations && !messages.length && !guidedOpen && !unitsOpen ? (
              <section className="assistant-welcome">
                <AssistantAvatar className="assistant-avatar--welcome" />
                <div className="assistant-welcome__copy">
                  <span className="assistant-welcome__eyebrow">Your rental operations assistant</span>
                  <h3>Welcome. <span>Let’s make rental management easier.</span></h3>
                  {INTRO_PARAGRAPHS.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                  <span className="assistant-welcome__suggestions-label">Try asking</span>
                  <div className="assistant-welcome__suggestions assistant-message__suggestions" aria-label="Suggested questions">
                    {WELCOME_SUGGESTIONS.map((suggestion) => (
                      <button key={suggestion} type="button" className="assistant-suggestion"
                        disabled={busy || loadingConversations} onClick={() => sendMessage(suggestion)}>{suggestion}</button>
                    ))}
                  </div>
                </div>
                {!loadingConversations && <p className="assistant-welcome__privacy">For your privacy, never share passwords or other sensitive personal or financial information. RentEaseAssist can make mistakes; please verify important information.</p>}
              </section>
            ) : messages.map((message, messageIndex) => (
              <div key={message.id} className={`assistant-message-row assistant-message-row--${message.role}`}>
                {message.role === 'assistant' && <strong className="assistant-message__author">RentEaseAssist</strong>}
                <div className={`assistant-message assistant-message--${message.role}`}>
                  {message.role === 'assistant'
                    ? <AssistantMessageContent content={message.content} />
                    : <p>{message.content}</p>}
                </div>
                {message.role === 'assistant' && message.proposal
                  && (message.proposal.kind === 'contract_draft'
                    || (message.proposal.property && Array.isArray(message.proposal.units))) && (
                  <div className="assistant-message__suggestions" aria-label="Draft actions">
                    <button type="button" className="assistant-suggestion"
                      onClick={() => openProposal(message.proposal)}>
                      {message.proposal.kind === 'contract_draft' ? 'Review contract draft' : 'Show me the draft'}
                    </button>
                    <button type="button" className="assistant-suggestion assistant-suggestion--quiet"
                      onClick={requestDraftChange}>I’d like to change something</button>
                  </div>
                )}
                {message.role === 'assistant' && replySuggestions?.displayIndex === messageIndex && (
                  <div className="assistant-message__suggestions" aria-label="Suggested replies">
                    {replySuggestions.suggestions.map((suggestion, index) => (
                      <button key={`${suggestion}-${index}`} type="button" className="assistant-suggestion"
                        disabled={busy} onClick={() => chooseReplySuggestion(suggestion)}>{suggestion}</button>
                    ))}
                  </div>
                )}
                <div className="assistant-message__actions">
                  <button className="btn btn--ghost" type="button" onClick={() => copyMessage(message.content)}>Copy</button>
                  {message.role === 'user' && (
                    <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => editMessage(message)}>Edit and retry</button>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="assistant-thinking" role="status" aria-label="Assistant is thinking">
                <AssistantAvatar className="assistant-avatar--thinking" thinking />
                <span className="assistant-thinking__label">RentEaseAssist is thinking</span>
              </div>
            )}
            {insight && (
              <section className="assistant-insight" aria-live="polite">
                <div className="assistant-insight__head">
                  <strong>{insight.action === 'overdue' ? 'Overdue rent' : insight.action === 'income' ? 'Income estimate' : insight.action === 'repairs' ? 'Open repair requests' : 'Done'}</strong>
                  <button type="button" onClick={() => setInsight(null)} aria-label="Dismiss result">×</button>
                </div>
                {insight.action === 'overdue' && <>
                  <p>{insight.count} overdue bill(s), totaling {formatPeso(insight.amount)}.</p>
                  {insight.items.map((item, index) => <p className="assistant-insight__item" key={`${item.due_date}-${index}`}>
                    {item.tenant_name} · {item.property_name}, {item.unit_name} · {formatPeso(Number(item.amount))} · {item.days_late} day(s) late
                  </p>)}
                  {insight.count > insight.items.length && <p className="muted">Showing the first {insight.items.length} records.</p>}
                  <a href="/admin/bills">View bills</a>
                </>}
                {insight.action === 'income' && <>
                  <p>Estimated annual income: <strong>{formatPeso(insight.annual_income)}</strong>.</p>
                  <p>{formatPeso(insight.monthly_income)} monthly across {insight.active_leases} active lease(s). This estimate uses current active leases, not vacant units.</p>
                  <a href="/admin/leases">View leases</a>
                </>}
                {insight.action === 'repairs' && <>
                  <p>{insight.count} open request(s); {insight.high_priority} high priority.</p>
                  {insight.items.map((item) => <p className="assistant-insight__item" key={item.id}>
                    <strong>{item.priority === 'high' ? 'High · ' : ''}{item.title}</strong> · {item.property_name}, {item.unit_name} · {item.status}
                  </p>)}
                  {insight.count > insight.items.length && <p className="muted">Showing the first {insight.items.length} requests.</p>}
                  <a href="/admin/maintenance">Review requests</a>
                </>}
                {insight.action === 'success' && <p>{insight.message} Added to {insight.property_name}.</p>}
              </section>
            )}
            <div ref={messagesEndRef} />
          </div>
          <form className="assistant-chat__input" onSubmit={send}>
            <textarea id="assistant-message" rows={2} maxLength={4000} value={text} disabled={busy || loadingConversations}
              aria-label={editingMessageId === null ? 'Message for Assistant' : 'Edit your message'}
              placeholder="Example: Add my 6-unit boarding house in Calapan City…"
              onChange={(event) => setText(event.target.value)} />
            <div className="assistant-chat__controls">
              {editingMessageId !== null && <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => { setEditingMessageId(null); setText('') }}>Cancel edit</button>}
              <button className="btn btn--accent" disabled={busy || loadingConversations || !text.trim()}>{busy ? 'Sending…' : editingMessageId === null ? 'Send' : 'Save and retry'}</button>
            </div>
          </form>
          <p className="assistant-chat__notice">For your privacy, never share passwords or other sensitive personal or financial information. RentEaseAssist can make mistakes; please verify important information.</p>
        </Glass>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {reviewOpen && contractDraft && !contractReview && (
        <Modal title="Contract customization" onClose={() => setReviewOpen(false)} className="assistant-review-modal">
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <Glass className="assistant-draft">
          <div className="assistant-draft__head">
            <div><p className="eyebrow">AI draft · review before saving</p></div>
            <button className="btn btn--ghost" type="button" disabled={busy}
              onClick={() => { setContractDraft(null); setContractReview(null); setReviewOpen(false) }}>Discard draft</button>
          </div>
          <div className="assistant-draft__notice" role="status">
            <strong>Suggested text only — your contract is unchanged.</strong>
            <span>Choose a target and review the complete template before saving.</span>
          </div>
          <p>{contractDraft.reply || 'Review these suggested additions. Nothing is saved until you confirm.'}</p>
          {!!contractDraft.clauses?.length && (
            <div className="stack">
              <h3 className="assistant-draft__section-title">Suggested clauses</h3>
              {contractDraft.clauses.map((clause, index) => (
                <section key={`${clause.title}-${index}`}>
                  <strong>{clause.title}</strong>
                  <p>{clause.text}</p>
                </section>
              ))}
            </div>
          )}
          {!!contractDraft.rules?.length && (
            <div className="stack">
              <h3 className="assistant-draft__section-title">Suggested house rules</h3>
              <ul>{contractDraft.rules.map((rule, index) => <li key={`${rule}-${index}`}>{rule}</li>)}</ul>
            </div>
          )}
          {!!Object.keys(contractDraft.utilities || {}).length && (
            <div className="stack">
              <h3 className="assistant-draft__section-title">Utility responsibilities</h3>
              {Object.entries(contractDraft.utilities).map(([utility, responsibility]) => (
                <p key={utility}>{utility[0].toUpperCase() + utility.slice(1)} paid by {responsibility}</p>
              ))}
            </div>
          )}
          {!!Object.keys(contractDraft.notices || {}).length && (
            <div className="stack">
              <h3 className="assistant-draft__section-title">Notice and payment settings</h3>
              {Object.entries(contractDraft.notices).map(([setting, value]) => (
                <p key={setting}>{setting.replace(/_/g, ' ')}: {value}</p>
              ))}
            </div>
          )}
          {!contractDraft.clauses?.length && !contractDraft.rules?.length
            && !Object.keys(contractDraft.utilities || {}).length && !Object.keys(contractDraft.notices || {}).length ? (
            <p className="muted">No contract changes were drafted. Ask for a specific clause, house rule, or contract setting before applying a template.</p>
          ) : (
            <>
              <Field label="Apply these changes to">
                <select value={`${contractTargetType}:${contractTargetId}`} disabled={busy}
                  onChange={(event) => {
                    const [type, id] = event.target.value.split(':')
                    setContractTargetType(type)
                    setContractTargetId(id)
                  }}>
                  <option value="property:">Choose a property or unit</option>
                  <optgroup label="Whole property">
                    {contractTargets.properties.map((property) => (
                      <option key={`property-${property.id}`} value={`property:${property.id}`}>{property.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Single unit">
                    {contractTargets.units.map((unit) => (
                      <option key={`unit-${unit.id}`} value={`unit:${unit.id}`}>{unit.property_name} · {unit.unit_name}</option>
                    ))}
                  </optgroup>
                </select>
              </Field>
              {!contractTargets.properties.length && !contractTargets.units.length
                && <p className="muted">Add a property or unit before applying a contract template.</p>}
              <button className="btn btn--accent" type="button" disabled={busy || !contractTargetId}
                onClick={() => prepareContractReview(contractTargetType, contractTargetId)}>
                Review changes in contract template
              </button>
            </>
          )}
        </Glass>
        </Modal>
      )}

      {reviewOpen && contractReview && (
        <Modal title="Final contract review" onClose={() => setReviewOpen(false)} className="assistant-review-modal">
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <Glass className="assistant-draft">
          <div className="assistant-draft__head">
            <div><p className="eyebrow">Final review</p><h2>{contractReview.targetName}</h2></div>
            <button className="btn btn--ghost" type="button" disabled={busy} onClick={() => setContractReview(null)}>Back to draft</button>
          </div>
          <div className="assistant-draft__notice" role="status">
            <strong>Final review — not saved yet.</strong>
            <span>Saving updates the default template for future lease offers; existing leases are not changed.</span>
          </div>
          <p>Review and edit the full template below before confirming the save.</p>
          <ContractTemplateEditor
            key={contractReview.key}
            value={contractReview.template}
            title={`Contract template · ${contractReview.targetName}`}
            onChange={(template) => setContractReview((current) => current ? { ...current, template } : current)}
          />
          <button className="btn btn--accent" type="button" disabled={busy} onClick={saveContractReview}>
            {busy ? 'Saving…' : 'Confirm and save contract template'}
          </button>
        </Glass>
        </Modal>
      )}

      {reviewOpen && draft && (
        <Modal title="Proposed rental setup" onClose={() => setReviewOpen(false)} className="assistant-review-modal">
        {error && <p className="alert alert--error" role="alert">{error}</p>}
        <Glass className="assistant-draft">
          <div className="assistant-draft__head">
            <div><p className="eyebrow">Review before saving</p></div>
            <button className="btn btn--ghost" disabled={busy} onClick={() => { setDraft(null); setReviewOpen(false) }}>Discard draft</button>
          </div>
          <div className="assistant-draft__notice" role="status">
            <strong>Review only — nothing has been created.</strong>
            <span>Check every property, unit, rent, and tenant detail before confirming below.</span>
          </div>
          <div className="assistant-draft__summary" aria-label="Rental setup summary">
            <div><span>Property</span><strong>{draft.property.name || 'Unnamed property'}</strong></div>
            <div><span>Units</span><strong>{draft.units.length}</strong></div>
            <div><span>Estimated monthly rent</span><strong>{formatPeso(draft.units.reduce((total, unit) => total + (Number(unit.monthly_rent) || 0), 0))}</strong></div>
            {draft.tenants.length > 0 && <div><span>Tenant leases</span><strong>{draft.tenants.length}</strong></div>}
          </div>
          <div className="stack">
            <h3 className="assistant-draft__section-title">Property details</h3>
            <div className="assistant-draft__grid">
              <Field label="Property name"><input value={draft.property.name} maxLength={120} onChange={(e) => updateProperty({ name: e.target.value })} /></Field>
              <Field label="Type"><select value={draft.property.type} onChange={(e) => updateProperty({ type: e.target.value })}><option value="apartment">Apartment</option><option value="boarding_house">Boarding house</option></select></Field>
              <Field label="Street address"><input value={draft.property.address} maxLength={255} onChange={(e) => updateProperty({ address: e.target.value })} /></Field>
              <Field label="Description"><textarea rows={2} value={draft.property.description || ''} maxLength={2000} onChange={(e) => updateProperty({ description: e.target.value })} /></Field>
            </div>
            <PropertyLocationPicker address={draft.property.address} city={draft.property.city} barangay={draft.property.barangay}
              latitude={draft.property.latitude} longitude={draft.property.longitude} onChange={updateProperty} />
            <div className="assistant-draft__section">
              <h3 className="assistant-draft__section-title">Units <span>{draft.units.length}</span></h3>
              <button className="btn btn--ghost btn--sm" type="button" disabled={busy || draft.units.length >= 100} onClick={addUnit}>Add unit</button>
            </div>
            {draft.units.map((unit, index) => (
              <div className="assistant-draft__row" key={index}>
                <Field label="Unit name"><input value={unit.unit_name} onChange={(e) => updateUnit(index, { unit_name: e.target.value })} /></Field>
                <Field label="Monthly rent"><input type="number" min="1" step="0.01" value={unit.monthly_rent} onChange={(e) => updateUnit(index, { monthly_rent: e.target.value })} /></Field>
                <Field label="Capacity"><input type="number" min="1" max="50" step="1" value={unit.capacity} onChange={(e) => updateUnit(index, { capacity: Number(e.target.value) })} /></Field>
                <Field label="Condition"><select value={unit.condition_tag} onChange={(e) => updateUnit(index, { condition_tag: e.target.value })}><option value="good_condition">Good condition</option><option value="under_maintenance">Under maintenance</option></select></Field>
                <button className="assistant-draft__remove" type="button" disabled={busy || draft.units.length <= 1} onClick={() => removeUnit(index)}>Remove unit</button>
              </div>
            ))}
            {draft.tenants.length > 0 && <>
              <h3 className="assistant-draft__section-title">Tenants and leases <span>{draft.tenants.length}</span></h3>
              {draft.tenants.map((tenant, index) => (
                <div className="assistant-draft__row assistant-draft__row--tenant" key={index}>
                  <Field label="Username"><input value={tenant.username} onChange={(e) => updateTenant(index, { username: e.target.value })} /></Field>
                  <Field label="Full name"><input value={tenant.full_name} onChange={(e) => updateTenant(index, { full_name: e.target.value })} /></Field>
                  <Field label="Email"><input type="email" value={tenant.email} onChange={(e) => updateTenant(index, { email: e.target.value })} /></Field>
                  <Field label="Unit"><select value={tenant.unit_index} onChange={(e) => updateTenant(index, { unit_index: Number(e.target.value) })}>
                    {draft.units.map((unit, unitIndex) => <option key={unitIndex} value={unitIndex}>{unit.unit_name}</option>)}
                  </select></Field>
                  <Field label="Start date"><input type="date" value={tenant.start_date} onChange={(e) => updateTenant(index, { start_date: e.target.value })} /></Field>
                  <Field label="Rent override (optional)"><input type="number" min="1" step="0.01" value={tenant.monthly_rent ?? ''} onChange={(e) => updateTenant(index, { monthly_rent: e.target.value })} /></Field>
                </div>
              ))}
            </>}
          </div>
          {issues.length > 0 && (
            <div className="assistant-draft__issues" role="status">
              <strong>Almost ready</strong>
              <ul>{issues.slice(0, 3).map((issue) => <li key={issue}>{issue}</li>)}</ul>
            </div>
          )}
          <div className="assistant-draft__confirm">
            <p>
              {draft.property.name || 'Unnamed property'} · {draft.units.length} units
              {' · '}Estimated monthly rent {formatPeso(draft.units.reduce((total, unit) => total + (Number(unit.monthly_rent) || 0), 0))}
              {draft.tenants.length > 0 ? ` · ${draft.tenants.length} tenant leases` : ''}
            </p>
            <button className="btn btn--accent" disabled={busy || issues.length > 0} onClick={confirm}>Confirm and create</button>
          </div>
        </Glass>
        </Modal>
      )}

      {!!credentials.length && (
        <Modal title="Tenant temporary passwords" onClose={() => setCredentials([])} className="assistant-review-modal">
        <Glass className="assistant-draft">
          <p>Copy these now and share them privately. They are shown only once.</p>
          {credentials.map((credential) => <p className="assistant-credential" key={credential.email}>
            <strong>{credential.full_name || credential.username}</strong> · {credential.username} · {credential.email} · <code>{credential.temporary_password}</code>
          </p>)}
          <button className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(credentials.map((c) => `${c.username} ${c.email} ${c.temporary_password}`).join('\n'))}>Copy credentials</button>
        </Glass>
        </Modal>
      )}
    </section>
  )
}
