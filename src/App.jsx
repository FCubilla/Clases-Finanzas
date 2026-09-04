import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const CLASSES_KEY = 'facupadel_classes'
const EXPENSES_KEY = 'facupadel_expenses'
const CLUB_PERCENT_KEY = 'facupadel_club_percent'
const RENDITIONS_KEY = 'facupadel_renditions'
const RENDITION_PERIOD_START_KEY = 'facupadel_rendition_period_start'
const SHEETS_API_URL = import.meta.env.VITE_SHEETS_API_URL?.trim()
const SHEETS_API_TOKEN = import.meta.env.VITE_SHEETS_API_TOKEN?.trim()

function createPayment(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    student: '',
    amount: '',
    paymentMethod: 'Efectivo',
    paid: true,
    ...overrides,
  }
}

const initialClass = {
  date: getLocalDateString(),
  type: 'Individual',
  payments: [createPayment()],
  notes: '',
}

const initialExpense = {
  date: getLocalDateString(),
  concept: '',
  amount: '',
  category: 'Cancha',
  notes: '',
}

function parseStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
}

function money(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatRenditionTimestamp(value) {
  const timestamp = new Date(value)

  if (Number.isNaN(timestamp.getTime())) return null

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(timestamp)
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getLocalMonthString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function normalizeDateInput(value) {
  if (!value) return getLocalDateString()

  const trimmed = String(value).slice(0, 10)
  const [yearRaw, monthRaw, dayRaw] = trimmed.split('-')
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if ([year, month, day].some((item) => Number.isNaN(item))) {
    return getLocalDateString()
  }

  const parsed = new Date(year, month - 1, day)
  return getLocalDateString(parsed)
}

function getPayments(item) {
  if (Array.isArray(item?.payments) && item.payments.length > 0) {
    return item.payments.map((payment, index) => ({
      id: payment?.id ?? `${item?.id ?? crypto.randomUUID()}-${index}`,
      student: payment?.student ?? '',
      amount: Number(payment?.amount ?? 0),
      paymentMethod: payment?.paymentMethod ?? 'Efectivo',
      paid: Boolean(payment?.paid),
    }))
  }

  return [
    {
      id: item?.id ?? crypto.randomUUID(),
      student: item?.student ?? '',
      amount: Number(item?.amount ?? 0),
      paymentMethod: item?.paymentMethod ?? 'Efectivo',
      paid: Boolean(item?.paid),
    },
  ]
}

function getClassDisplayName(item) {
  const payments = getPayments(item)
  const names = payments.map((payment) => payment.student?.trim()).filter(Boolean)

  if (names.length > 1) {
    return names.join(', ')
  }

  return names[0] || item?.student?.trim() || 'Sin nombre'
}

function getClassPaymentMethod(item) {
  const payments = getPayments(item)
  const methods = [...new Set(payments.map((payment) => payment.paymentMethod).filter(Boolean))]

  if (methods.length === 1) {
    return methods[0] ?? 'Efectivo'
  }

  return 'Mixto'
}

function normalizeClass(item) {
  const payments = getPayments(item)
  const amount = payments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)

  return {
    id: item?.id ?? crypto.randomUUID(),
    date: normalizeDateInput(item?.date),
    student: getClassDisplayName(item),
    type: item?.type ?? 'Individual',
    amount,
    paid: payments.every((payment) => payment.paid),
    paymentMethod: getClassPaymentMethod(item),
    notes: item?.notes ?? '',
    payments,
  }
}

function normalizeExpense(item) {
  return {
    id: item?.id ?? crypto.randomUUID(),
    date: normalizeDateInput(item?.date),
    concept: item?.concept ?? '',
    amount: Number(item?.amount ?? 0),
    category: item?.category ?? 'Cancha',
    notes: item?.notes ?? '',
  }
}

function normalizeRendition(item) {
  return {
    id: item?.id ?? crypto.randomUUID(),
    date: normalizeDateInput(item?.date),
    createdAt: item?.createdAt ?? null,
    weekStart: normalizeDateInput(item?.weekStart),
    weekEnd: normalizeDateInput(item?.weekEnd),
    amount: Number(item?.amount ?? 0),
    cash: Number(item?.cash ?? 0),
    transfer: Number(item?.transfer ?? 0),
    notes: item?.notes ?? '',
  }
}

function mergeById(localItems, remoteItems) {
  const map = new Map()
  localItems.forEach((item) => map.set(item.id, item))
  remoteItems.forEach((item) => map.set(item.id, item))
  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date))
}

function App() {
  const [classes, setClasses] = useState([])
  const [expenses, setExpenses] = useState([])
  const [classForm, setClassForm] = useState(initialClass)
  const [expenseForm, setExpenseForm] = useState(initialExpense)
  const [clubPercent, setClubPercent] = useState(40)
  const [renditions, setRenditions] = useState([])
  const [renditionPeriodStart, setRenditionPeriodStart] = useState(getLocalDateString())
  const [filterMonth, setFilterMonth] = useState(getLocalMonthString())
  const [syncMessage, setSyncMessage] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [renditionMessage, setRenditionMessage] = useState('')
  const recordsRef = useRef(null)
  const cloudEnabled = Boolean(SHEETS_API_URL)

  const callSheetsApi = useCallback(async (payload) => {
    if (!cloudEnabled) return null

    const response = await fetch(SHEETS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        ...payload,
        token: SHEETS_API_TOKEN || undefined,
      }),
    })

    if (!response.ok) {
      throw new Error('No se pudo conectar con Google Sheets')
    }

    const data = await response.json()

    if (!data?.ok) {
      throw new Error(data?.error || 'Google Sheets rechazo la solicitud')
    }

    return data
  }, [cloudEnabled])

  const pushSnapshot = useCallback(async (nextClasses, nextExpenses, nextRenditions) => {
    if (!cloudEnabled) return
    await callSheetsApi({
      action: 'saveAll',
      classes: nextClasses,
      expenses: nextExpenses,
      renditions: nextRenditions,
    })
  }, [callSheetsApi, cloudEnabled])

  const syncFromCloud = useCallback(async () => {
    if (!cloudEnabled) return

    try {
      setIsSyncing(true)
      setSyncMessage('Sincronizando...')

      const data = await callSheetsApi({ action: 'getData' })
      const remoteClasses = (data?.classes ?? []).map(normalizeClass)
      const remoteExpenses = (data?.expenses ?? []).map(normalizeExpense)
      const remoteRenditions = (data?.renditions ?? []).map(normalizeRendition)

      const mergedClasses = mergeById(classes, remoteClasses)
      const mergedExpenses = mergeById(expenses, remoteExpenses)
      const mergedRenditions = mergeById(renditions, remoteRenditions)

      setClasses(mergedClasses)
      setExpenses(mergedExpenses)
      setRenditions(mergedRenditions)
      await pushSnapshot(mergedClasses, mergedExpenses, mergedRenditions)
      setSyncMessage('Datos sincronizados con Google Sheets')
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'No se pudo sincronizar con Google Sheets')
    } finally {
      setIsSyncing(false)
    }
  }, [callSheetsApi, classes, cloudEnabled, expenses, pushSnapshot, renditions])

  useEffect(() => {
    const storedClasses = parseStorage(CLASSES_KEY).map(normalizeClass)
    const storedExpenses = parseStorage(EXPENSES_KEY).map(normalizeExpense)
    const storedRenditions = parseStorage(RENDITIONS_KEY).map(normalizeRendition)

    setClasses(storedClasses)
    setExpenses(storedExpenses)
    setRenditions(storedRenditions)

    const savedPeriodStart = localStorage.getItem(RENDITION_PERIOD_START_KEY)
    const lastRenditionDate = [...storedRenditions.map((item) => item.date)].sort().at(-1)
    const fallbackPeriodStart = lastRenditionDate ?? getLocalDateString()
    setRenditionPeriodStart(savedPeriodStart ? normalizeDateInput(savedPeriodStart) : fallbackPeriodStart)

    const savedPercentRaw = localStorage.getItem(CLUB_PERCENT_KEY)
    const savedPercent = Number(savedPercentRaw)

    if (!Number.isNaN(savedPercent) && savedPercent >= 0 && savedPercent <= 100) {
      setClubPercent(savedPercent)
    } else {
      setClubPercent(40)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(CLASSES_KEY, JSON.stringify(classes))
  }, [classes])

  useEffect(() => {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses))
  }, [expenses])

  useEffect(() => {
    localStorage.setItem(CLUB_PERCENT_KEY, String(clubPercent))
  }, [clubPercent])

  useEffect(() => {
    localStorage.setItem(RENDITIONS_KEY, JSON.stringify(renditions))
  }, [renditions])

  useEffect(() => {
    localStorage.setItem(RENDITION_PERIOD_START_KEY, renditionPeriodStart)
  }, [renditionPeriodStart])

  const filteredClasses = useMemo(
    () => classes.filter((item) => item.date.startsWith(filterMonth)),
    [classes, filterMonth],
  )

  const filteredExpenses = useMemo(
    () => expenses.filter((item) => item.date.startsWith(filterMonth)),
    [expenses, filterMonth],
  )

  const todaySummary = useMemo(() => {
    const today = getLocalDateString()
    const todayClasses = classes.filter((item) => item.date === today)
    const allPayments = todayClasses.flatMap((item) => getPayments(item))
    const gross = allPayments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const paidPayments = allPayments.filter((payment) => payment.paid)
    const charged = paidPayments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const cash = paidPayments
      .filter((payment) => payment.paymentMethod === 'Efectivo')
      .reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const transfer = paidPayments
      .filter((payment) => payment.paymentMethod === 'Transferencia')
      .reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const todayExpenses = expenses
      .filter((item) => item.date === today)
      .reduce((acc, item) => acc + Number(item.amount), 0)
    const clubShare = charged * (clubPercent / 100)
    const cashClubShare = cash * (clubPercent / 100)
    const transferClubShare = transfer * (clubPercent / 100)
    const finalNet = charged - todayExpenses - clubShare

    return {
      classCount: todayClasses.length,
      gross,
      charged,
      cash,
      transfer,
      expenses: todayExpenses,
      net: charged - todayExpenses,
      clubShare,
      cashClubShare,
      transferClubShare,
      finalNet,
    }
  }, [classes, expenses, clubPercent])

  const summary = useMemo(() => {
    const allPayments = filteredClasses.flatMap((item) => getPayments(item))
    const gross = allPayments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const paidPayments = allPayments.filter((payment) => payment.paid)
    const charged = paidPayments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const cash = paidPayments
      .filter((payment) => payment.paymentMethod === 'Efectivo')
      .reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const transfer = paidPayments
      .filter((payment) => payment.paymentMethod === 'Transferencia')
      .reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const pending = gross - charged
    const totalExpenses = filteredExpenses.reduce((acc, item) => acc + Number(item.amount), 0)
    const clubShare = charged * (clubPercent / 100)
    const cashClubShare = cash * (clubPercent / 100)
    const transferClubShare = transfer * (clubPercent / 100)
    const net = charged - totalExpenses
    const finalNet = net - clubShare

    return {
      classCount: filteredClasses.length,
      gross,
      charged,
      cash,
      transfer,
      pending,
      totalExpenses,
      clubShare,
      cashClubShare,
      transferClubShare,
      net,
      finalNet,
    }
  }, [filteredClasses, filteredExpenses, clubPercent])

  const renditionSummary = useMemo(() => {
    const today = new Date()
    const todayValue = getLocalDateString(today)
    const finalPeriodStart = normalizeDateInput(renditionPeriodStart || getLocalDateString())
    const periodStart = finalPeriodStart
    const periodClasses = classes.filter((item) => item.date >= periodStart && item.date <= todayValue)

    const allPayments = periodClasses.flatMap((item) => getPayments(item))
    const gross = allPayments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const paidPayments = allPayments.filter((payment) => payment.paid)
    const charged = paidPayments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const cash = paidPayments
      .filter((payment) => payment.paymentMethod === 'Efectivo')
      .reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const transfer = paidPayments
      .filter((payment) => payment.paymentMethod === 'Transferencia')
      .reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const clubShare = charged * (clubPercent / 100)
    const renderedSoFar = renditions
      .filter((item) => item.date >= periodStart && item.date <= todayValue)
      .reduce((acc, item) => acc + Number(item.amount ?? 0), 0)
    const pendingToRender = Math.max(clubShare - renderedSoFar, 0)
    const netToUser = Math.max(charged - clubShare, 0)

    return {
      periodStart,
      periodLabel: `Desde ${periodStart} hasta hoy`,
      gross,
      charged,
      cash,
      transfer,
      clubShare,
      renderedSoFar,
      pendingToRender,
      netToUser,
    }
  }, [classes, clubPercent, renditionPeriodStart, renditions])

  const lastRendition = useMemo(
    () =>
      [...renditions].sort((first, second) => {
        const firstTimestamp = new Date(first.createdAt ?? `${first.date}T00:00:00`).getTime()
        const secondTimestamp = new Date(second.createdAt ?? `${second.date}T00:00:00`).getTime()
        return secondTimestamp - firstTimestamp
      })[0] ?? null,
    [renditions],
  )

  function updatePayment(index, key, value) {
    setClassForm((current) => ({
      ...current,
      payments: current.payments.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, [key]: value } : payment,
      ),
    }))
  }

  function addPayment() {
    setClassForm((current) => ({
      ...current,
      payments: [...current.payments, createPayment()],
    }))
  }

  function removePayment(index) {
    setClassForm((current) => ({
      ...current,
      payments: current.payments.filter((_, paymentIndex) => paymentIndex !== index),
    }))
  }

  async function handleClassSubmit(event) {
    event.preventDefault()

    const payments = classForm.payments
      .filter((payment) => payment.student?.trim() || payment.amount)
      .map((payment) => ({
        id: payment.id ?? crypto.randomUUID(),
        student: payment.student.trim(),
        amount: Number(payment.amount || 0),
        paymentMethod: payment.paymentMethod,
        paid: Boolean(payment.paid),
      }))

    if (payments.length === 0) return

    const amount = payments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0)
    const paid = payments.every((payment) => payment.paid)

    const newClass = {
      id: crypto.randomUUID(),
      date: classForm.date,
      type: classForm.type,
      amount,
      paid,
      notes: classForm.notes,
      payments,
      student: payments.map((payment) => payment.student?.trim()).filter(Boolean).join(', '),
      paymentMethod: payments.some((payment) => payment.paymentMethod !== payments[0]?.paymentMethod)
        ? 'Mixto'
        : payments[0]?.paymentMethod ?? 'Efectivo',
    }

    const nextClasses = [newClass, ...classes]
    setClasses(nextClasses)
    setClassForm((current) => ({
      ...initialClass,
      date: current.date,
      type: current.type,
      payments: [createPayment()],
    }))

    try {
      await pushSnapshot(nextClasses, expenses, renditions)
      if (cloudEnabled) setSyncMessage('Clase guardada y subida a Sheets')
    } catch {
      if (cloudEnabled) setSyncMessage('Clase guardada localmente. Fallo al subir a Sheets')
    }

    requestAnimationFrame(() => {
      recordsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function handleExpenseSubmit(event) {
    event.preventDefault()
    if (!expenseForm.concept.trim() || !expenseForm.amount) return

    const newExpense = {
      id: crypto.randomUUID(),
      ...expenseForm,
      amount: Number(expenseForm.amount),
    }

    const nextExpenses = [newExpense, ...expenses]
    setExpenses(nextExpenses)
    setExpenseForm((current) => ({
      ...initialExpense,
      date: current.date,
      category: current.category,
    }))

    try {
      await pushSnapshot(classes, nextExpenses, renditions)
      if (cloudEnabled) setSyncMessage('Gasto guardado y subido a Sheets')
    } catch {
      if (cloudEnabled) setSyncMessage('Gasto guardado localmente. Fallo al subir a Sheets')
    }

    requestAnimationFrame(() => {
      recordsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  async function markPeriodAsRendered() {
    if (renditionSummary.pendingToRender <= 0) {
      setRenditionMessage('Este periodo ya quedó marcado como rendido')
      setSyncMessage('Este periodo ya quedó marcado como rendido')
      return
    }

    const newRendition = {
      id: crypto.randomUUID(),
      date: getLocalDateString(),
      createdAt: new Date().toISOString(),
      weekStart: renditionSummary.periodStart,
      weekEnd: getLocalDateString(),
      amount: renditionSummary.pendingToRender,
      cash: renditionSummary.cash,
      transfer: renditionSummary.transfer,
      notes: '',
    }

    const nextRenditions = [newRendition, ...renditions]
    setRenditions(nextRenditions)
    setRenditionMessage(`Listo, se registró la rendición de ${money(renditionSummary.pendingToRender)}.`)

    try {
      await pushSnapshot(classes, expenses, nextRenditions)
      setSyncMessage(
        cloudEnabled
          ? 'Rendición guardada y subida a Sheets. El resumen quedó listo para el próximo periodo.'
          : 'Rendición guardada. El resumen quedó listo para el próximo periodo.',
      )
    } catch {
      setSyncMessage('Rendición guardada localmente. Fallo al subir a Sheets')
    }
  }

  async function togglePaid(id) {
    const nextClasses = classes.map((item) => {
      if (item.id !== id) return item

      const nextPaid = !item.paid
      const nextPayments = getPayments(item).map((payment) => ({ ...payment, paid: nextPaid }))

      return {
        ...item,
        paid: nextPaid,
        payments: nextPayments,
        amount: nextPayments.reduce((acc, payment) => acc + Number(payment.amount ?? 0), 0),
        student: nextPayments.map((payment) => payment.student?.trim()).filter(Boolean).join(', '),
        paymentMethod: nextPayments.some(
          (payment) => payment.paymentMethod !== nextPayments[0]?.paymentMethod,
        )
          ? 'Mixto'
          : nextPayments[0]?.paymentMethod ?? 'Efectivo',
      }
    })
    setClasses(nextClasses)

    try {
      await pushSnapshot(nextClasses, expenses, renditions)
      if (cloudEnabled) setSyncMessage('Estado actualizado en Sheets')
    } catch {
      if (cloudEnabled) setSyncMessage('Estado actualizado localmente. Fallo en Sheets')
    }
  }

  async function removeClass(id) {
    const shouldDelete = window.confirm('¿Seguro que querés borrar esta clase?')
    if (!shouldDelete) return

    const nextClasses = classes.filter((item) => item.id !== id)
    setClasses(nextClasses)

    try {
      await pushSnapshot(nextClasses, expenses, renditions)
      if (cloudEnabled) setSyncMessage('Clase borrada en Sheets')
    } catch {
      if (cloudEnabled) setSyncMessage('Clase borrada localmente. Fallo en Sheets')
    }
  }

  async function uploadLocalToCloud() {
    if (!cloudEnabled) return

    const emptyCollections = [
      ['clases', classes],
      ['gastos', expenses],
      ['rendiciones', renditions],
    ].filter(([, items]) => items.length === 0)

    if (emptyCollections.length > 0) {
      const collectionNames = emptyCollections.map(([name]) => name).join(', ')
      const shouldContinue = window.confirm(
        `La información local no tiene ${collectionNames}. Si continuás, podrías borrar esos datos de Google Sheets. ¿Querés subir de todos modos?`,
      )

      if (!shouldContinue) return
    }

    try {
      setIsSyncing(true)
      setSyncMessage('Subiendo datos locales...')
      await pushSnapshot(classes, expenses, renditions)
      setSyncMessage('Datos locales subidos a Google Sheets')
    } catch {
      setSyncMessage('No se pudo subir la info local a Sheets')
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <p
          className="brand"
          title="FacuPadel Coach"
          aria-label="FacuPadel Coach"
        >
          FacuPadel Coach
        </p>
      </header>

      <main className="dashboard">
          <section className="dashboard-top">
            <h2>Control financiero</h2>
            <div className="dashboard-actions">
              <label>
                Mes
                <input
                  type="month"
                  value={filterMonth}
                  onChange={(event) => setFilterMonth(event.target.value)}
                />
              </label>
              <label>
                % club
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={clubPercent}
                  onChange={(event) => {
                    const nextValue = Number(event.target.value)
                    if (Number.isNaN(nextValue)) return
                    const clamped = Math.max(0, Math.min(100, nextValue))
                    setClubPercent(clamped)
                  }}
                />
              </label>
              {cloudEnabled && (
                <div className="sync-actions">
                  <button type="button" onClick={syncFromCloud} disabled={isSyncing}>
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                  <button type="button" onClick={uploadLocalToCloud} disabled={isSyncing}>
                    Subir local
                  </button>
                </div>
              )}
            </div>
          </section>
          {!cloudEnabled && (
            <p className="sync-message">Modo local activo. Configurá Sheets para compartir datos.</p>
          )}
          {cloudEnabled && syncMessage && <p className="sync-message">{syncMessage}</p>}

          <section className="single-form-section">
            <div className="weekly-summary-card">
              <h3>Resumen para rendir</h3>
              <p className="last-rendition">
                {lastRendition
                  ? `Última rendición: ${formatRenditionTimestamp(lastRendition.createdAt) ?? lastRendition.date} · ${money(lastRendition.amount)}`
                  : 'Todavía no registraste ninguna rendición.'}
              </p>
              <div className="rendition-period-controls">
                <label htmlFor="rendition-period-start">Desde</label>
                <input
                  id="rendition-period-start"
                  type="date"
                  value={renditionPeriodStart}
                  onChange={(event) => setRenditionPeriodStart(normalizeDateInput(event.target.value))}
                />
              </div>
              <p>{renditionSummary.periodLabel}</p>
              <div className="weekly-summary-grid">
                <div>
                  <span>Total del período</span>
                  <strong>{money(renditionSummary.gross)}</strong>
                </div>
                <div>
                  <span>Club ({clubPercent}%)</span>
                  <strong>{money(renditionSummary.clubShare)}</strong>
                </div>
                <div>
                  <span>Lo que falta rendir</span>
                  <strong>{money(renditionSummary.pendingToRender)}</strong>
                </div>
                <div>
                  <span>Lo que te queda</span>
                  <strong>{money(renditionSummary.netToUser)}</strong>
                </div>
                <div>
                  <span>Efectivo</span>
                  <strong>{money(renditionSummary.cash)}</strong>
                </div>
                <div>
                  <span>Transferencia</span>
                  <strong>{money(renditionSummary.transfer)}</strong>
                </div>
              </div>
              <div className="weekly-summary-actions">
                <button type="button" className="render-button" onClick={markPeriodAsRendered}>
                  {renditionSummary.pendingToRender > 0 ? 'Marcar como rendido' : 'Ya rendido'}
                </button>
                <span className="weekly-summary-status">
                  {renditionSummary.pendingToRender > 0
                    ? `Falta rendir: ${money(renditionSummary.pendingToRender)}`
                    : 'Todo ya quedó rendido para este periodo'}
                </span>
              </div>
              {renditionMessage && <p className="rendition-message">{renditionMessage}</p>}
            </div>

            <form onSubmit={handleClassSubmit}>
              <h3>Nueva clase</h3>
              <input
                type="date"
                value={classForm.date}
                onChange={(event) => setClassForm({ ...classForm, date: event.target.value })}
              />
              <select
                value={classForm.type}
                onChange={(event) => setClassForm({ ...classForm, type: event.target.value })}
              >
                <option>Individual</option>
                <option>Grupo</option>
              </select>
              <div className="payment-rows">
                {classForm.payments.map((payment, index) => (
                  <div key={payment.id} className="payment-row">
                    <input
                      type="text"
                      placeholder={`Alumno ${index + 1}`}
                      value={payment.student}
                      onChange={(event) => updatePayment(index, 'student', event.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Precio"
                      value={payment.amount}
                      onChange={(event) => updatePayment(index, 'amount', event.target.value)}
                    />
                    <select
                      value={payment.paymentMethod}
                      onChange={(event) => updatePayment(index, 'paymentMethod', event.target.value)}
                    >
                      <option>Efectivo</option>
                      <option>Transferencia</option>
                      <option>Otro</option>
                    </select>
                    <label className="checkbox-row compact-checkbox">
                      <input
                        type="checkbox"
                        checked={payment.paid}
                        onChange={(event) => updatePayment(index, 'paid', event.target.checked)}
                      />
                      Pagada
                    </label>
                    {classForm.payments.length > 1 && (
                      <button type="button" className="danger" onClick={() => removePayment(index)}>
                        X
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" className="quick-add" onClick={addPayment}>
                + Agregar otro pago
              </button>
              <input
                type="text"
                placeholder="Observaciones (opcional)"
                value={classForm.notes}
                onChange={(event) => setClassForm({ ...classForm, notes: event.target.value })}
              />
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={classForm.paid}
                  onChange={(event) => setClassForm({ ...classForm, paid: event.target.checked })}
                />
                Ya esta pagada
              </label>
              <button type="submit">Guardar clase</button>
            </form>
          </section>

          <section className="stats-grid">
            <article>
              <p>Clases hoy</p>
              <strong>{todaySummary.classCount}</strong>
            </article>
            <article>
              <p>Ingresos hoy</p>
              <strong>{money(todaySummary.gross)}</strong>
            </article>
            <article>
              <p>Cobrado hoy</p>
              <strong>{money(todaySummary.charged)}</strong>
            </article>
            <article>
              <p>Efectivo hoy</p>
              <strong>{money(todaySummary.cash)}</strong>
            </article>
            <article>
              <p>Transferencia hoy</p>
              <strong>{money(todaySummary.transfer)}</strong>
            </article>
            <article>
              <p>Gastos hoy</p>
              <strong>{money(todaySummary.expenses)}</strong>
            </article>
            <article>
              <p>Rendir hoy ({clubPercent}%)</p>
              <strong>{money(todaySummary.clubShare)}</strong>
            </article>
            <article>
              <p>Club efectivo hoy</p>
              <strong>{money(todaySummary.cashClubShare)}</strong>
            </article>
            <article>
              <p>Club transferencia hoy</p>
              <strong>{money(todaySummary.transferClubShare)}</strong>
            </article>
            <article>
              <p>Neto final hoy</p>
              <strong>{money(todaySummary.finalNet)}</strong>
            </article>
            <article>
              <p>Neto hoy</p>
              <strong>{money(todaySummary.net)}</strong>
            </article>
          </section>

          <section className="lists-grid" ref={recordsRef}>
            <article>
              <h3>Clases del mes</h3>
              <ul>
                {filteredClasses.length === 0 && <li>No hay clases cargadas en este mes.</li>}
                {filteredClasses.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{getClassDisplayName(item)}</strong>
                      <span>
                        {item.date} - {item.type} - {money(item.amount)}
                      </span>
                      <div className="payment-list">
                        {item.payments?.map((payment) => (
                          <span key={payment.id}>
                            {payment.student || 'Sin nombre'} · {money(payment.amount)} · {payment.paymentMethod} ·{' '}
                            {payment.paid ? 'Pagado' : 'Pendiente'}
                          </span>
                        ))}
                      </div>
                      {item.notes?.trim() && <span>Nota: {item.notes}</span>}
                    </div>
                    <div className="item-actions">
                      <button type="button" onClick={() => togglePaid(item.id)}>
                        {item.paid ? 'Pagado' : 'Pendiente'}
                      </button>
                      <button type="button" className="danger" onClick={() => removeClass(item.id)}>
                        Borrar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article>
              <h3>Gastos del mes</h3>
              <ul>
                {filteredExpenses.length === 0 && <li>No hay gastos cargados en este mes.</li>}
                {filteredExpenses.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.concept}</strong>
                      <span>
                        {item.date} - {item.category} - {money(item.amount)}
                      </span>
                      {item.notes?.trim() && <span>Nota: {item.notes}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </section>

          <section className="stats-grid">
            <article>
              <p>Clases</p>
              <strong>{summary.classCount}</strong>
            </article>
            <article>
              <p>Ingresos del mes</p>
              <strong>{money(summary.gross)}</strong>
            </article>
            <article>
              <p>Cobrado</p>
              <strong>{money(summary.charged)}</strong>
            </article>
            <article>
              <p>Efectivo</p>
              <strong>{money(summary.cash)}</strong>
            </article>
            <article>
              <p>Transferencia</p>
              <strong>{money(summary.transfer)}</strong>
            </article>
            <article>
              <p>Pendiente</p>
              <strong>{money(summary.pending)}</strong>
            </article>
            <article>
              <p>Gastos</p>
              <strong>{money(summary.totalExpenses)}</strong>
            </article>
            <article>
              <p>Rendir al club ({clubPercent}%)</p>
              <strong>{money(summary.clubShare)}</strong>
            </article>
            <article>
              <p>Club efectivo</p>
              <strong>{money(summary.cashClubShare)}</strong>
            </article>
            <article>
              <p>Club transferencia</p>
              <strong>{money(summary.transferClubShare)}</strong>
            </article>
            <article>
              <p>Neto final</p>
              <strong>{money(summary.finalNet)}</strong>
            </article>
            <article>
              <p>Neto antes de club</p>
              <strong>{money(summary.net)}</strong>
            </article>
          </section>

          <section className="single-form-section bottom-gap">
            <form onSubmit={handleExpenseSubmit}>
              <h3>Nuevo gasto</h3>
              <input
                type="date"
                value={expenseForm.date}
                onChange={(event) => setExpenseForm({ ...expenseForm, date: event.target.value })}
              />
              <input
                type="text"
                placeholder="Concepto"
                value={expenseForm.concept}
                onChange={(event) =>
                  setExpenseForm({ ...expenseForm, concept: event.target.value })
                }
              />
              <select
                value={expenseForm.category}
                onChange={(event) =>
                  setExpenseForm({ ...expenseForm, category: event.target.value })
                }
              >
                <option>Cancha</option>
                <option>Pelotas</option>
                <option>Otro</option>
              </select>
              <input
                type="number"
                min="0"
                placeholder="Monto"
                value={expenseForm.amount}
                onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })}
              />
              <input
                type="text"
                placeholder="Observaciones (opcional)"
                value={expenseForm.notes}
                onChange={(event) => setExpenseForm({ ...expenseForm, notes: event.target.value })}
              />
              <button type="submit">Guardar gasto</button>
            </form>
          </section>
      </main>
    </div>
  )
}

export default App
