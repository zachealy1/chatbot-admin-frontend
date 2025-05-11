import i18nRoutes from '../../main/routes/lang';

import { expect } from 'chai';
import express, { Application, Request, Response } from 'express';
import request from 'supertest';

describe('GET /i18n/buttons', () => {
  function mkApp(cookies: Record<string, string> = {}) {
    const app: Application = express();

    // stub cookies and translator
    app.use((req: Request, _res: Response, next) => {
      (req as any).cookies = cookies;
      (req as any).__ = ({ phrase, locale }: { phrase: string; locale: string }) =>
        `${locale}:${phrase}`;
      next();
    });

    // mount the i18n routes
    i18nRoutes(app);
    return app;
  }

  it('returns English translations by default', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/i18n/buttons')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      actionAccept: 'en:actionAccept',
      actionReject: 'en:actionReject',
    });
  });

  it('returns Welsh translations when lang=cy cookie is set', async () => {
    const app = mkApp({ lang: 'cy' });
    const res = await request(app)
      .get('/i18n/buttons')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      actionAccept: 'cy:actionAccept',
      actionReject: 'cy:actionReject',
    });
  });

  it('ignores unrecognized lang cookie and falls back to English', async () => {
    const app = mkApp({ lang: 'fr' });
    const res = await request(app)
      .get('/i18n/buttons')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      actionAccept: 'en:actionAccept',
      actionReject: 'en:actionReject',
    });
  });
});

describe('GET /i18n/actions', () => {
  function mkApp(cookies: Record<string, string> = {}) {
    const app: Application = express();

    // stub cookies and translator
    app.use((req: Request, _res: Response, next) => {
      (req as any).cookies = cookies;
      (req as any).__ = ({ phrase, locale }: { phrase: string; locale: string }) =>
        `${locale}:${phrase}`;
      next();
    });

    i18nRoutes(app);
    return app;
  }

  it('returns English action set by default', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/i18n/actions')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      actionAccept: 'en:actionAccept',
      actionReject: 'en:actionReject',
      actionDelete: 'en:actionDelete',
    });
  });

  it('returns Welsh action set when lang=cy cookie is present', async () => {
    const app = mkApp({ lang: 'cy' });
    const res = await request(app)
      .get('/i18n/actions')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      actionAccept: 'cy:actionAccept',
      actionReject: 'cy:actionReject',
      actionDelete: 'cy:actionDelete',
    });
  });

  it('falls back to English on unrecognized lang cookie', async () => {
    const app = mkApp({ lang: 'fr' });
    const res = await request(app)
      .get('/i18n/actions')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      actionAccept: 'en:actionAccept',
      actionReject: 'en:actionReject',
      actionDelete: 'en:actionDelete',
    });
  });
});
