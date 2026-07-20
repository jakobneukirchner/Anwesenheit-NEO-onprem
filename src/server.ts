import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { initSocketServer } from './realtime/socketServer';
import { startAutoCancelJob } from './jobs/autoCancelAttendance';
import { startCleanupExpiredCodesJob } from './jobs/cleanupExpiredCodes';
import { startNightlyBackupJob } from './jobs/nightlyBackup';
import { startReminderNotificationsJob } from './jobs/reminderNotifications';
import { asyncHandler, errorHandler } from './utils/http';
import { getBranding } from './utils/settings';

import authRouter from './modules/auth/routes';
import usersRouter from './modules/users/routes';
import groupsRouter from './modules/groups/routes';
import eventsRouter from './modules/events/routes';
import substitutionsRouter from './modules/substitutions/routes';
import messagesRouter from './modules/messages/routes';
import chatRouter from './modules/chat/routes';
import permissionsRouter from './modules/permissions/routes';
import registrationRouter from './modules/registration/routes';
import settingsRouter from './modules/settings/routes';
import brandingRouter from './modules/branding/routes';
import statisticsRouter from './modules/statistics/routes';
import reportsRouter from './modules/reports/routes';
import systemRouter from './modules/system/routes';
import parentChildRouter from './modules/parentChild/routes';
import badgesRouter from './modules/badges/routes';
import suadRouter from './modules/suad/routes';

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors({ origin: process.env.APP_URL ?? true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// Hochgeladene Assets (Branding-Logos, Favicons)
app.use('/uploads', express.static(process.env.UPLOAD_DIR ?? './uploads'));

// Statische Frontend-Assets
app.use(express.static('frontend/dist'));

// Dynamisches PWA-Manifest
app.get(
  '/manifest.json',
  asyncHandler(async (_req, res) => {
    const b = await getBranding();
    const icon = b.faviconUrl || b.logoUrl || '/icons/icon-512.png';
    res.json({
      name: b.appName,
      short_name: b.appName,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: b.primaryColor,
      icons: [
        { src: icon, sizes: '192x192', type: 'image/png' },
        { src: icon, sizes: '512x512', type: 'image/png' },
      ],
    });
  }),
);

// API-Routen
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/substitutions', substitutionsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/chat', chatRouter);
app.use('/api/permission-profiles', permissionsRouter);
app.use('/api/registration-codes', registrationRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/branding', brandingRouter);
app.use('/api/statistics', statisticsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/system', systemRouter);
app.use('/api/parent-child-links', parentChildRouter);
app.use('/api/badges', badgesRouter);
app.use('/internal/suad', suadRouter);

// Zentraler Error-Handler (nach allen Routen)
app.use(errorHandler);

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
