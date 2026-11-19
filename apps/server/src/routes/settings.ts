import { CPK_THRESHOLDS, DEFAULT_CONFIG } from '@pam/core';
import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../auth/middleware.js';
import { type AppEnv, jsonBody, parse } from '../http.js';
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
