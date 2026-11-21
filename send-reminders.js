const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://agenda-34c88-default-rtdb.firebaseio.com'
});

const db = admin.database();
const MONTHLY_REMINDER_TIME = '07:30';

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

  const tokens = Object.values(data.fcmTokens)
    .map((entry) => entry && entry.token)
    .filter(Boolean);

  if (tokens.length === 0) {
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

    // Recordatorios previos elegidos por ti (fecha y hora personalizadas)
    if (Array.isArray(task.reminders)) {
      for (const rem of task.reminders) {
        if (!rem || rem.sent || rem.date !== todayISO) continue;
        const targetMin = toMinutes(rem.time || defaultTime);
        if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 2) {
          await sendPush(
            tokens,
            `⏳ Recordatorio: ${task.title}`,
            `${task.subject} · Entrega: ${task.date || 'Sin fecha'} · Hora: ${rem.time || defaultTime}`
          );
          rem.sent = true;
          updated = true;
        }
      }
    }

    // Aviso principal en la fecha y hora límite de la tarea
    if (!task.notified && task.date === todayISO) {
      const targetMin = toMinutes(defaultTime);
      if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 2) {
        await sendPush(
          tokens,
          `✅ Tarea: ${task.title}`,
          `${task.subject} · Hora: ${defaultTime} (Prioridad ${task.priority})`
        );
        task.notified = true;
        updated = true;
      }
    }
  }

  for (const exam of exams) {
    if (!exam) continue;
    const defaultTime = exam.time || '08:00';

    // Recordatorios previos elegidos por ti (fecha y hora personalizadas)
    if (Array.isArray(exam.reminders)) {
      for (const rem of exam.reminders) {
        if (!rem || rem.sent || rem.date !== todayISO) continue;
        const targetMin = toMinutes(rem.time || defaultTime);
        if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 2) {
          await sendPush(
            tokens,
            `⏳ Recordatorio examen: ${exam.subject}`,
            `${exam.topic || 'Evaluación'} · Fecha: ${exam.date || 'Sin fecha'} · Hora: ${rem.time || defaultTime}`
          );
          rem.sent = true;
          updated = true;
        }
      }
    }

    // Aviso principal en la fecha y hora del examen
    if (!exam.notified && exam.date === todayISO) {
      const targetMin = toMinutes(defaultTime);
      if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 2) {
        await sendPush(
          tokens,
          `📝 Examen de ${exam.subject}`,
          `${exam.topic || 'Evaluación'} · Hora: ${defaultTime}`
        );
        exam.notified = true;
        updated = true;
      }
    }
  }

  // Aviso de lo anotado en el Planner Mensual para el día de hoy
  const calendarNotes = data.calendarNotes && typeof data.calendarNotes === 'object' ? data.calendarNotes : {};
  const monthlyNotified = data.monthlyNotified && typeof data.monthlyNotified === 'object' ? data.monthlyNotified : {};
  const shortDateKey = `${nowQuito.getFullYear()}-${nowQuito.getMonth() + 1}-${nowQuito.getDate()}`;
  const dayNoteText = cleanNoteText(calendarNotes[todayISO] || calendarNotes[shortDateKey] || '');
  const monthlyTargetMin = toMinutes(MONTHLY_REMINDER_TIME);

  if (
    dayNoteText &&
    monthlyTargetMin !== null &&
    nowMinutes >= monthlyTargetMin &&
    nowMinutes <= monthlyTargetMin + 2 &&
    monthlyNotified[todayISO] !== dayNoteText
  ) {
    await sendPush(
      tokens,
      `📅 Planner Mensual (${todayISO})`,
      dayNoteText
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

async function sendPush(tokens, title, body) {
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: {
        icon: 'https://upload.wikimedia.org/wikipedia/en/0/04/Kuromi_render.png'
      },
      fcmOptions: {
        link: 'https://zoebastidas26-sketch.github.io/Planner2027/'
      }
    }
  });
  console.log(`Enviadas: ${response.successCount}, Fallidas: ${response.failureCount}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
