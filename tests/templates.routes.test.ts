import { describe, expect, it } from 'vitest';

import { ErrorCode } from '@hypermarket/contracts';
import type { AppConfig } from '@hypermarket/core/config/loadEnv';

import { buildServer } from '../apps/api/src/server';

const TEST_CONFIG: AppConfig = {
  nodeEnv: 'test',
  databaseUrl: 'postgres://tester:tester@127.0.0.1:5432/hypermarket_test',
  redisUrl: 'redis://127.0.0.1:6379',
  port: 3000,
  logLevel: 'silent',
  jwtSecret: 'test-jwt-secret-minimum-32-characters',
  jwtIssuer: 'test-suite',
  twilioAccountSid: 'ACtestaccountsid000000000000000000',
  twilioAuthToken: 'test-twilio-auth-token',
  twilioVerifyServiceSid: 'VAtestservicesid000000000000000000',
  platformRootDomain: 'platform.ug',
  paymentDefaultProvider: 'flutterwave',
  paymentReconciliationStaleMinutes: 10,
  flwSecretKey: 'FLWSECK_TEST_PLACEHOLDER',
  flwWebhookSecretHash: 'test-flw-webhook-hash',
  flwBaseUrl: 'https://api.flutterwave.com',
  flwDefaultNetwork: 'MTN',
  notificationDefaultProvider: 'twilio_sms',
  notificationDefaultChannel: 'sms',
  twilioSmsFrom: '+256700000000',
  otpSecret: 'test-otp-secret-minimum-32-characters',
  otpTtlSeconds: 300,
  sessionTtlSeconds: 3600,
  enableDevRoutes: false
};

describe('TMP routes', () => {
  it('lists templates from the in-code registry', async () => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/templates' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      templates: [
        {
          template_id: 'basic-commerce',
          name: 'Basic Commerce',
          description: 'Starter storefront template for a single-tenant retail catalog.',
          versions: ['v1']
        }
      ]
    });

    await server.close();
  });

  it('lists template versions for a known template', async () => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/templates/basic-commerce/versions' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      template: {
        template_id: 'basic-commerce',
        name: 'Basic Commerce',
        versions: [
          {
            template_version: 'v1',
            default_config_payload: {
              brand_name: 'My Shop',
              hero_title: 'Fresh products for Kampala',
              hero_subtitle: 'Fast ordering and same-day delivery for local customers.',
              primary_color: '#0B6E4F',
              cta_label: 'Shop now'
            }
          }
        ]
      }
    });

    await server.close();
  });

  it('returns a JSON schema descriptor for a known template version', async () => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/templates/basic-commerce/versions/v1/schema'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      template: {
        template_id: 'basic-commerce',
        template_version: 'v1',
        schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          additionalProperties: false,
          required: ['brand_name', 'hero_title', 'hero_subtitle', 'primary_color', 'cta_label'],
          properties: {
            brand_name: { type: 'string', minLength: 1, title: 'Brand Name' },
            hero_title: { type: 'string', minLength: 1, title: 'Hero Title' },
            hero_subtitle: { type: 'string', minLength: 1, title: 'Hero Subtitle' },
            primary_color: {
              type: 'string',
              pattern: '^#[0-9A-Fa-f]{6}$',
              title: 'Primary Color'
            },
            cta_label: { type: 'string', minLength: 1, title: 'Call To Action Label' }
          }
        },
        default_config_payload: {
          brand_name: 'My Shop',
          hero_title: 'Fresh products for Kampala',
          hero_subtitle: 'Fast ordering and same-day delivery for local customers.',
          primary_color: '#0B6E4F',
          cta_label: 'Shop now'
        }
      }
    });

    await server.close();
  });

  it.each([
    ['/templates/missing/versions', ErrorCode.TemplateNotFound, 'Template not found'],
    [
      '/templates/basic-commerce/versions/v9/schema',
      ErrorCode.TemplateVersionNotFound,
      'Template version not found'
    ]
  ])('returns specific TMP errors for %s', async (url, errorCode, message) => {
    const server = buildServer({ config: TEST_CONFIG, devRoutesMode: 'disabled' });
    await server.ready();

    const res = await server.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      request_id: expect.any(String),
      error_code: errorCode,
      message
    });

    await server.close();
  });
});
