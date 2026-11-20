const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://agenda-34c88-default-rtdb.firebaseio.com'
});

const db = admin.database();

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
  return h * 60 + m;
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

  for (const task of tasks) {
    if (!task || task.done || task.notified || task.date !== todayISO) continue;
    const targetMin = toMinutes(task.time || '09:00');
    if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 2) {
      await sendPush(tokens, `✅ Tarea: ${task.title}`, `${task.subject} · Hora: ${task.time || '09:00'} (Prioridad ${task.priority})`);
      task.notified = true;
      updated = true;
    }
  }

  for (const exam of exams) {
    if (!exam || exam.notified || exam.date !== todayISO) continue;
    const targetMin = toMinutes(exam.time || '08:00');
    if (targetMin !== null && nowMinutes >= targetMin && nowMinutes <= targetMin + 2) {
      await sendPush(tokens, `📝 Examen de ${exam.subject}`, `${exam.topic} · Hora: ${exam.time || '08:00'}`);
      exam.notified = true;
      updated = true;
    }
  }

  if (updated) {
    await db.ref('zoe_planner_2027/tasks').set(tasks);
    await db.ref('zoe_planner_2027/exams').set(exams);
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
