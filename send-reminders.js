const admin = require('firebase-admin')
const nodemailer = require('nodemailer')

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://agenda-34c88-default-rtdb.firebaseio.com'
})

const db = admin.database()
const MONTHLY_REMINDER_TIME = '07:30'
const DAILY_SCHEDULE_TIME = '07:45'
const PLANNER_URL = 'https://zoebastidas26-sketch.github.io/Planner2027/'

const DAY_NAMES_ES = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']

const SUBJECT_META = [
  { canonical: 'FÍSICA', tab: 'fisica', fieldPrefix: 'fisica' },
  { canonical: 'MATEMÁTICAS', tab: 'mates', fieldPrefix: 'mates' },
  { canonical: 'INTRO. SISTEMAS', tab: 'sistemas', fieldPrefix: 'sistemas' },
  { canonical: 'EPUS', tab: 'etica', fieldPrefix: 'etica' }
]

const mailTransport =
  process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      })
    : null

function getQuitoNow() {
  const now = new Date()
  const quitoStr = now.toLocaleString('en-US', { timeZone: 'America/Guayaquil' })
  return new Date(quitoStr)
}

function formatDateISO(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toMinutes(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function cleanNoteText(htmlOrText) {
  if (!htmlOrText) return ''
  return String(htmlOrText)
    .replace(/<br\s*\/?>/gi, ' · ')
    .replace(/<\/(div|p|li|tr)>/gi, ' · ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(\s*·\s*)+/g, ' · ')
    .trim()
}

function normalizeSubjectName(rawName) {
  const clean = cleanNoteText(rawName)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

  if (!clean) return ''
  if (clean.includes('FISICA')) return 'FÍSICA'
  if (clean.includes('MATE')) return 'MATEMÁTICAS'
  if (clean.includes('SISTEMA')) return 'INTRO. SISTEMAS'
  if (clean.includes('EPUS') || clean.includes('ETICA')) return 'EPUS'
  return clean
}

function findSubjectMeta(subjectName) {
  const norm = normalizeSubjectName(subjectName)
  return SUBJECT_META.find(s => s.canonical === norm) || null
}

function formatHourLabel(hourNum) {
  return `${String(hourNum).padStart(2, '0')}:00`
}

function buildDailyScheduleDigest(data, nowQuito, tasks, exams) {
  const fields = data.fields && typeof data.fields === 'object' ? data.fields : {}
  const jsDay = nowQuito.getDay()
  const schedDayIdx = jsDay === 0 ? 6 : jsDay - 1
  const dayName = DAY_NAMES_ES[jsDay]

  const defaultSchedule = {
    '7-3': 'EPUS',
    '8-3': 'EPUS',
    '9-2': 'EPUS',
    '15-0': 'MATEMÁTICAS',
    '15-1': 'FÍSICA',
    '15-2': 'MATEMÁTICAS',
    '15-3': 'FÍSICA',
    '15-4': 'FÍSICA',
    '16-0': 'MATEMÁTICAS',
    '16-1': 'FÍSICA',
    '16-2': 'MATEMÁTICAS',
    '16-3': 'FÍSICA',
    '16-4': 'FÍSICA',
    '17-0': 'INTRO. SISTEMAS',
    '17-1': 'MATEMÁTICAS',
    '17-2': 'INTRO. SISTEMAS',
    '17-3': 'MATEMÁTICAS',
    '17-4': 'INTRO. SISTEMAS',
    '18-0': 'INTRO. SISTEMAS',
    '18-1': 'MATEMÁTICAS',
    '18-2': 'INTRO. SISTEMAS',
    '18-3': 'MATEMÁTICAS',
    '18-4': 'INTRO. SISTEMAS'
  }

  const slotMap = new Map()
  const orderedSubjects = []

  for (let h = 7; h <= 20; h++) {
    const slotKey = `${h}-${schedDayIdx}`
    const fieldKey = `sched-${h}-${schedDayIdx}`
    const rawVal = fields[fieldKey] !== undefined ? fields[fieldKey] : (defaultSchedule[slotKey] || '')
    const subj = normalizeSubjectName(rawVal)
    if (!subj) continue

    if (!slotMap.has(subj)) {
      slotMap.set(subj, [])
      orderedSubjects.push(subj)
    }
    slotMap.get(subj).push(formatHourLabel(h))
  }

  const pendingTasks = tasks.filter(t => t && !t.done)
  const allExams = exams.filter(e => Boolean(e))

  if (orderedSubjects.length === 0) {
    let body = `Hoy es ${dayName} y no tienes materias programadas en tu horario.`
    if (pendingTasks.length > 0) {
      const listTxt = pendingTasks
        .map(t => `${t.title || 'Tarea'} (${normalizeSubjectName(t.subject) || 'GENERAL'}${t.date ? ' · ' + t.date : ''})`)
        .join(', ')
      body += ` Tareas pendientes (${pendingTasks.length}): ${listTxt}.`
    }
    if (allExams.length > 0) {
      const examTxt = allExams
        .map(e => `${normalizeSubjectName(e.subject) || 'MATERIA'}: ${e.topic || 'Evaluación'}${e.date ? ' (' + e.date + ')' : ''}`)
        .join(', ')
      body += ` Exámenes registrados (${allExams.length}): ${examTxt}.`
    }
    return {
      title: `📚 Materias de hoy · ${dayName}`,
      body
    }
  }

  const scheduleParts = orderedSubjects.map(subj => {
    const hours = slotMap.get(subj) || []
    return `${hours.join(' y ')} ${subj}`
  })

  const pendingParts = orderedSubjects.map(subj => {
    const meta = findSubjectMeta(subj)
    const items = []

    pendingTasks
      .filter(t => normalizeSubjectName(t.subject) === subj)
      .forEach(t => {
        const extra = [t.date, t.time].filter(Boolean).join(' ')
        items.push(`Tarea: ${t.title || 'Sin título'}${extra ? ` (${extra})` : ''}`)
      })

    allExams
      .filter(e => normalizeSubjectName(e.subject) === subj)
      .forEach(e => {
        const extra = [e.date, e.time].filter(Boolean).join(' ')
        items.push(`Examen: ${e.topic || 'Evaluación'}${extra ? ` (${extra})` : ''}`)
      })

    if (meta) {
      const rawSubjTasks = fields[`${meta.fieldPrefix}-tareas`]
      const cleanSubjTasks = cleanNoteText(rawSubjTasks)
      if (cleanSubjTasks) {
        items.push(`Notas: ${cleanSubjTasks}`)
      }
    }

    if (items.length === 0) {
      return `${subj}: Sin pendientes registrados`
    }
    return `${subj}: ${items.join(' · ')}`
  })

  return {
    title: `📚 Materias de hoy · ${dayName}`,
    body: `Hoy ${dayName.toLowerCase()} tienes ${scheduleParts.join(', ')}. Pendientes por materia -> ${pendingParts.join(' | ')}.`
  }
}

async function sendEmailAlert(title, body, tag) {
  const toList = process.env.REMINDER_TO_EMAIL || process.env.GMAIL_USER
  if (!mailTransport || !toList) {
    console.log(`[${tag}] Falta configurar GMAIL_USER, GMAIL_APP_PASSWORD o REMINDER_TO_EMAIL.`)
    return
  }

  await mailTransport.sendMail({
    from: `"Kuromi Planner 2027" <${process.env.GMAIL_USER}>`,
    to: toList,
    subject: title,
    text: `${title}\n\n${body}\n\nAbrir planner: ${PLANNER_URL}`,
    html: `
      <div style="font-family:sans-serif;background:#120d1a;color:#f5f0f8;padding:20px;border-radius:12px;border:1px solid #7a3d9e;">
        <h2 style="margin:0 0 10px;color:#e8d4f8;">${title}</h2>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">${body}</p>
        <a href="${PLANNER_URL}" style="display:inline-block;padding:10px 16px;background:#5a2d80;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;">Abrir Kuromi Planner</a>
        <p style="margin:14px 0 0;font-size:11px;color:#a898b8;">ID: ${tag}</p>
      </div>
    `
  })
  console.log(`[${tag}] Correo enviado a: ${toList}`)
}

async function run() {
  const snap = await db.ref('zoe_planner_2027').once('value')
  const data = snap.val()
  if (!data) {
    console.log('Sin datos en la base.')
    return
  }

  const nowQuito = getQuitoNow()
  const todayISO = formatDateISO(nowQuito)
  const nowMinutes = nowQuito.getHours() * 60 + nowQuito.getMinutes()

  const tasks = Array.isArray(data.tasks) ? data.tasks : []
  const exams = Array.isArray(data.exams) ? data.exams : []
  let updated = false
  let updatedMonthly = false
  let updatedDailySchedule = false

  for (const task of tasks) {
    if (!task || task.done) continue
    const defaultTime = task.time || '09:00'

    if (Array.isArray(task.reminders)) {
      for (let i = 0; i < task.reminders.length; i++) {
        const rem = task.reminders[i]
        if (!rem || rem.sent || rem.date !== todayISO) continue
        const targetMin = toMinutes(rem.time || defaultTime)
        if (targetMin !== null && nowMinutes >= targetMin) {
          await sendEmailAlert(
            `⏳ Recordatorio: ${task.title || 'Tarea'}`,
            `${task.subject || 'General'} · Entrega: ${task.date || 'Sin fecha'} · Hora: ${rem.time || defaultTime}`,
            `task-rem-${task.id || 't'}-${i}-${todayISO}`
          )
          rem.sent = true
          updated = true
        }
      }
    }

    if (!task.notified && task.date === todayISO) {
      const targetMin = toMinutes(defaultTime)
      if (targetMin !== null && nowMinutes >= targetMin) {
        await sendEmailAlert(
          `✅ Tarea: ${task.title || 'Tarea'}`,
          `${task.subject || 'General'} · Hora: ${defaultTime} (Prioridad ${task.priority || 'Media'})`,
          `task-${task.id || 't'}-${todayISO}`
        )
        task.notified = true
        updated = true
      }
    }
  }

  for (const exam of exams) {
    if (!exam) continue
    const defaultTime = exam.time || '08:00'

    if (Array.isArray(exam.reminders)) {
      for (let i = 0; i < exam.reminders.length; i++) {
        const rem = exam.reminders[i]
        if (!rem || rem.sent || rem.date !== todayISO) continue
        const targetMin = toMinutes(rem.time || defaultTime)
        if (targetMin !== null && nowMinutes >= targetMin) {
          await sendEmailAlert(
            `⏳ Recordatorio examen: ${exam.subject || 'Examen'}`,
            `${exam.topic || 'Evaluación'} · Fecha: ${exam.date || 'Sin fecha'} · Hora: ${rem.time || defaultTime}`,
            `exam-rem-${exam.id || 'e'}-${i}-${todayISO}`
          )
          rem.sent = true
          updated = true
        }
      }
    }

    if (!exam.notified && exam.date === todayISO) {
      const targetMin = toMinutes(defaultTime)
      if (targetMin !== null && nowMinutes >= targetMin) {
        await sendEmailAlert(
          `📝 Examen de ${exam.subject || 'Materia'}`,
          `${exam.topic || 'Evaluación'} · Hora: ${defaultTime}`,
          `exam-${exam.id || 'e'}-${todayISO}`
        )
        exam.notified = true
        updated = true
      }
    }
  }

  const calendarNotes = data.calendarNotes && typeof data.calendarNotes === 'object' ? data.calendarNotes : {}
  const monthlyNotified = data.monthlyNotified && typeof data.monthlyNotified === 'object' ? data.monthlyNotified : {}
  const shortDateKey = `${nowQuito.getFullYear()}-${nowQuito.getMonth() + 1}-${nowQuito.getDate()}`
  const dayNoteText = cleanNoteText(calendarNotes[todayISO] || calendarNotes[shortDateKey] || '')
  const monthlyTargetMin = toMinutes(MONTHLY_REMINDER_TIME)

  if (
    dayNoteText &&
    monthlyTargetMin !== null &&
    nowMinutes >= monthlyTargetMin &&
    monthlyNotified[todayISO] !== dayNoteText
  ) {
    await sendEmailAlert(
      `📅 Planner Mensual (${todayISO})`,
      dayNoteText,
      `monthly-${todayISO}`
    )
    monthlyNotified[todayISO] = dayNoteText
    updatedMonthly = true
  }

  const dailyScheduleNotified =
    data.dailyScheduleNotified && typeof data.dailyScheduleNotified === 'object'
      ? data.dailyScheduleNotified
      : {}
  const dailyScheduleTargetMin = toMinutes(DAILY_SCHEDULE_TIME)

  if (
    dailyScheduleTargetMin !== null &&
    nowMinutes >= dailyScheduleTargetMin &&
    !dailyScheduleNotified[todayISO]
  ) {
    const digest = buildDailyScheduleDigest(data, nowQuito, tasks, exams)
    await sendEmailAlert(
      digest.title,
      digest.body,
      `daily-schedule-${todayISO}`
    )
    dailyScheduleNotified[todayISO] = true
    updatedDailySchedule = true
  }

  if (updated) {
    await db.ref('zoe_planner_2027/tasks').set(tasks)
    await db.ref('zoe_planner_2027/exams').set(exams)
  }
  if (updatedMonthly) {
    await db.ref('zoe_planner_2027/monthlyNotified').set(monthlyNotified)
  }
  if (updatedDailySchedule) {
    await db.ref('zoe_planner_2027/dailyScheduleNotified').set(dailyScheduleNotified)
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
