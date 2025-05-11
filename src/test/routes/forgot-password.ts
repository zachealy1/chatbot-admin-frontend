import forgotRoutes from '../../main/routes/forgot-password';

import { expect } from 'chai';
import express, { Application } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /forgot-password', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('renders the forgot-password view', async () => {
    const app: Application = express();

    // override res.render to JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotRoutes(app);

    const res = await request(app)
      .get('/forgot-password')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ view: 'forgot-password' });
  });
});

describe('GET /forgot-password/verify-otp', () => {
  afterEach(() => {
    sinon.restore();
  });

  function mkApp(cookies: Record<string, string> = {}) {
    const app: Application = express();
    // stub req.cookies
    app.use((req, _res, next) => {
      (req as any).cookies = cookies;
      next();
    });
    // override res.render to JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });
    forgotRoutes(app);
    return app;
  }

  it('renders defaults when no lang cookie and no sent param', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/forgot-password/verify-otp')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        fieldErrors: {},
        oneTimePassword: ''
      }
    });
  });

  it('respects sent=true query parameter', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/forgot-password/verify-otp?sent=true')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: true,
        fieldErrors: {},
        oneTimePassword: ''
      }
    });
  });

  it('respects sent=false query parameter explicitly', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/forgot-password/verify-otp?sent=false')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        fieldErrors: {},
        oneTimePassword: ''
      }
    });
  });

  it('uses lang=cy from cookie when set', async () => {
    const app = mkApp({ lang: 'cy' });
    const res = await request(app)
      .get('/forgot-password/verify-otp')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'cy',
        sent: false,
        fieldErrors: {},
        oneTimePassword: ''
      }
    });
  });

  it('combines lang=cy cookie and sent=true query', async () => {
    const app = mkApp({ lang: 'cy' });
    const res = await request(app)
      .get('/forgot-password/verify-otp?sent=true')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'cy',
        sent: true,
        fieldErrors: {},
        oneTimePassword: ''
      }
    });
  });
});
