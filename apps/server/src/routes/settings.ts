import { CPK_THRESHOLDS, DEFAULT_CONFIG } from '@pam/core';
import { Hono } from 'hono';
import { z } from 'zod';
import { currentUser, requireAdmin, requireAuth } from '../auth/middleware.js';
import { type AppEnv, HttpError, jsonBody, parse } from '../http.js';
import { serverLog } from '../services/logs.js';
import { getMailSettings, mailConfig, mailSettingsSchema, sendTestMail, setMailSettings } from '../services/mail.js';
import {
  coefficientConfigSchema,
  generalSettingsSchema,
  getCoefficientConfig,
  getGeneralSettings,
  getThresholds,
  setCoefficientConfig,
  setGeneralSettings,
  setThresholds,
  thresholdsSchema,
} from '../services/settings.js';

export const settingsRoutes = new Hono<AppEnv>();

settingsRoutes.get('/coefficients', (c) => {
  requireAuth(c);
  return c.json({ ...getCoefficientConfig(c.get('db')), defaults: DEFAULT_CONFIG });
});

/** Saves a new version. Existing results keep the version they were evaluated with. */
settingsRoutes.put('/coefficients', async (c) => {
  const user = requireAdmin(c);
  const config = parse(coefficientConfigSchema, await jsonBody(c));
  return c.json(setCoefficientConfig(c.get('db'), config, user.id));
});

settingsRoutes.get('/rating', (c) => {
  requireAuth(c);
  return c.json({ ...getThresholds(c.get('db')), defaults: CPK_THRESHOLDS });
});

/** New thresholds apply at once to all results, including those already stored. */
settingsRoutes.put('/rating', async (c) => {
  const user = requireAdmin(c);
  return c.json(setThresholds(c.get('db'), parse(thresholdsSchema, await jsonBody(c)), user.id));
});

settingsRoutes.get('/general', (c) => {
  requireAuth(c);
  return c.json(getGeneralSettings(c.get('db')));
});

settingsRoutes.put('/general', async (c) => {
  const user = requireAdmin(c);
  return c.json(setGeneralSettings(c.get('db'), parse(generalSettingsSchema, await jsonBody(c)), user.id));
});

/** Mail server for invitations (administrators). The password is never returned. */
settingsRoutes.get('/mail', (c) => {
  requireAdmin(c);
  return c.json(getMailSettings(c.get('db'), c.get('config')));
});

settingsRoutes.put('/mail', async (c) => {
  const user = requireAdmin(c);
  const body = parse(mailSettingsSchema, await jsonBody(c));
  setMailSettings(c.get('db'), body, user.id);
  return c.json(getMailSettings(c.get('db'), c.get('config')));
});

/** Sends a test e-mail with the stored settings, by default to the administrator. */
settingsRoutes.post('/mail/test', async (c) => {
  requireAdmin(c);
  const me = currentUser(c);
  const body = parse(z.object({ to: z.string().trim().email().max(200).optional() }), await jsonBody(c));
  const smtp = mailConfig(c.get('db'), c.get('config'));
  if (!smtp) throw new HttpError(400, 'mail_not_configured', 'No mail server is configured.');
  try {
    await sendTestMail(smtp, body.to ?? me.email);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    serverLog(c.get('db'), 'warning', 'mail', `Test e-mail not delivered: ${message}`, { userId: me.id });
    throw new HttpError(502, 'mail_failed', message);
  }
  return c.json({ sent: true, to: body.to ?? me.email });
});
