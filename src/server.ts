import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { initSocketServer } from './realtime/socketServer';
import { startAutoCancelJob } from './jobs/autoCancelAttendance';
import { startCleanupExpiredCodesJob } from './jobs/cleanupExpiredCodes';
import { startNightlyBackupJob } from './jobs/nightlyBackup';
import { startReminderNotificationsJob } from './jobs/reminderNotifications';

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({ origin: process.env.APP_URL ?? true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Statische Frontend-Assets
app.use(express.static('frontend/dist'));

// API-Routen (werden schrittweise ergänzt)
// app.use('/api/auth',                require('./modules/auth/routes').default);
// app.use('/api/users',               require('./modules/users/routes').default);
// app.use('/api/groups',              require('./modules/groups/routes').default);
// app.use('/api/events',              require('./modules/events/routes').default);
// app.use('/api/attendance',          require('./modules/attendance/routes').default);
// app.use('/api/substitutions',       require('./modules/substitutions/routes').default);
// app.use('/api/messages',            require('./modules/messages/routes').default);
// app.use('/api/chat',                require('./modules/chat/routes').default);
// app.use('/api/permission-profiles', require('./modules/permissions/routes').default);
// app.use('/api/registration-codes',  require('./modules/registration/routes').default);
// app.use('/api/settings',            require('./modules/settings/routes').default);
// app.use('/api/statistics',          require('./modules/statistics/routes').default);
// app.use('/internal/suad',           require('./modules/suad/routes').default);

// Socket.IO
initSocketServer(server);

// Cronjobs starten
startAutoCancelJob();
startCleanupExpiredCodesJob();
startNightlyBackupJob();
startReminderNotificationsJob();

const PORT = parseInt(process.env.PORT ?? '3000', 10);
server.listen(PORT, () => {
  console.log(`Anwesenheit-NEO-onprem läuft auf Port ${PORT}`);
});

export default app;
