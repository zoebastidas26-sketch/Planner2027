const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://agenda-34c88-default-rtdb.firebaseio.com'
});

const db = admin.database();
const MONTHLY_REMINDER_TIME = '18:55';
const PLANNER_URL = 'https://zoebastidas26-sketch.github.io/Planner2027/';
const KUROMI_ICON = 'https://upload.wikimedia.org/wikipedia/en/0/04/Kuromi_render.png';

function getQuitoNow() {
  const now = new Date();
  const quitoStr = now.toLocaleString('en-US', { timeZone: 'America/Guayaquil' });
  return new Date(quitoStr);
}

function formatDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toMinutes(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function cleanNoteText(htmlOrText) {
  if (!htmlOrText) return '';
  return String(htmlOrText)
    .replace(/<br\s*\/?>/gi, ' · ')
    .replace(/<\/(div|p|li|tr)>/gi, ' · ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(\s*·\s*)+/g, ' · ')
    .trim();
}

async function run() {
  const snap = await db.ref('zoe_planner_2027').once('value');
  const data = snap.val();
  if (!data || !data.fcmTokens) {
    console.log('Sin tokens registrados.');
    return;
  }

  const tokenEntries = Object.entries(data.fcmTokens)
    .filter(([, entry]) => entry && entry.token);

  if (tokenEntries.length === 0) {
    console.log('Lista de tokens vacía.');
    return;
  }

  const nowQuito = getQuitoNow();
  const todayISO = formatDateISO(nowQuito);
  const nowMinutes = nowQuito.getHours() * 60 + nowQuito.getMinutes();

  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const exams = Array.isArray(data.exams) ? data.exams : [];
  let updated = false;
  let updatedMonthly = false;

  for (const task of tasks) {
    if (!task || task.done) continue;
    const defaultTime = task.time || '09:00';

    if (Array.isArray(task.reminders)) {
      for (let i = 0; i < task.reminders.length; i++) {
        const rem = task.reminders[i];
        if (!rem || rem.sent || rem.date !== todayISO) continue;
        const targetMin = toMinutes(rem.time || defaultTime);
        if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 3) {
          await sendPush(
            tokenEntries,
            `⏳ Recordatorio: ${task.title || 'Tarea'}`,
            `${task.subject || 'General'} · Entrega: ${task.date || 'Sin fecha'} · Hora: ${rem.time || defaultTime}`,
            `task-rem-${task.id || 't'}-${i}-${todayISO}`
          );
          rem.sent = true;
          updated = true;
        }
      }
    }

    if (!task.notified && task.date === todayISO) {
      const targetMin = toMinutes(defaultTime);
      if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 3) {
        await sendPush(
          tokenEntries,
          `✅ Tarea: ${task.title || 'Tarea'}`,
          `${task.subject || 'General'} · Hora: ${defaultTime} (Prioridad ${task.priority || 'Media'})`,
          `task-${task.id || 't'}-${todayISO}`
        );
        task.notified = true;
        updated = true;
      }
    }
  }

  for (const exam of exams) {
    if (!exam) continue;
    const defaultTime = exam.time || '08:00';

    if (Array.isArray(exam.reminders)) {
      for (let i = 0; i < exam.reminders.length; i++) {
        const rem = exam.reminders[i];
        if (!rem || rem.sent || rem.date !== todayISO) continue;
        const targetMin = toMinutes(rem.time || defaultTime);
        if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 3) {
          await sendPush(
            tokenEntries,
            `⏳ Recordatorio examen: ${exam.subject || 'Examen'}`,
            `${exam.topic || 'Evaluación'} · Fecha: ${exam.date || 'Sin fecha'} · Hora: ${rem.time || defaultTime}`,
            `exam-rem-${exam.id || 'e'}-${i}-${todayISO}`
          );
          rem.sent = true;
          updated = true;
        }
      }
    }

    if (!exam.notified && exam.date === todayISO) {
      const targetMin = toMinutes(defaultTime);
      if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 3) {
        await sendPush(
          tokenEntries,
          `📝 Examen de ${exam.subject || 'Materia'}`,
          `${exam.topic || 'Evaluación'} · Hora: ${defaultTime}`,
          `exam-${exam.id || 'e'}-${todayISO}`
        );
        exam.notified = true;
        updated = true;
      }
    }
  }

  const calendarNotes = data.calendarNotes && typeof data.calendarNotes === 'object' ? data.calendarNotes : {};
  const monthlyNotified = data.monthlyNotified && typeof data.monthlyNotified === 'object' ? data.monthlyNotified : {};
  const shortDateKey = `${nowQuito.getFullYear()}-${nowQuito.getMonth() + 1}-${nowQuito.getDate()}`;
  const dayNoteText = cleanNoteText(calendarNotes[todayISO] || calendarNotes[shortDateKey] || '');
  const monthlyTargetMin = toMinutes(MONTHLY_REMINDER_TIME);

  if (
    dayNoteText &&
    monthlyTargetMin !== null &&
    nowMinutes >= monthlyTargetMin &&
    nowMinutes <= monthlyTargetMin + 3 &&
    monthlyNotified[todayISO] !== dayNoteText
  ) {
    await sendPush(
      tokenEntries,
      `📅 Planner Mensual (${todayISO})`,
      dayNoteText,
      `monthly-${todayISO}`
    );
    monthlyNotified[todayISO] = dayNoteText;
    updatedMonthly = true;
  }

  if (updated) {
    await db.ref('zoe_planner_2027/tasks').set(tasks);
    await db.ref('zoe_planner_2027/exams').set(exams);
  }
  if (updatedMonthly) {
    await db.ref('zoe_planner_2027/monthlyNotified').set(monthlyNotified);
  }
}

async function sendPush(tokenEntries, title, body, tag) {
  const tokens = tokenEntries.map(([, entry]) => entry.token);
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    data: {
      title: String(title),
      body: String(body),
      tag: String(tag),
      icon: KUROMI_ICON,
      url: PLANNER_URL
    },
    webpush: {
      headers: {
        Urgency: 'high',
        TTL: '86400'
      },
      fcmOptions: {
        link: PLANNER_URL
      }
    }
  });

  console.log(`[${tag}] Enviadas: ${response.successCount}, Fallidas: ${response.failureCount}`);

  for (let i = 0; i < response.responses.length; i++) {
    const res = response.responses[i];
    if (!res.success && res.error) {
      const code = res.error.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        const [deadKey] = tokenEntries[i];
        await db.ref(`zoe_planner_2027/fcmTokens/${deadKey}`).remove();
        console.log(`Token caducado eliminado: ${deadKey}`);
      }
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
