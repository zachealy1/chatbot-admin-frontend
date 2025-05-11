import forgotRoutes from '../../main/routes/forgot-password';

import axios from 'axios';
import * as axiosCookie from 'axios-cookiejar-support';
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

describe('GET /forgot-password/reset-password', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('renders the reset-password view', async () => {
    const app: Application = express();

    // override res.render to return JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    // mount the forgot-password routes
    forgotRoutes(app);

    const res = await request(app)
      .get('/forgot-password/reset-password')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ view: 'reset-password' });
  });
});

describe('POST /forgot-password/enter-email', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };
  let createStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(console, 'error');

    // our fake axios client
    stubClient = { get: sinon.stub(), post: sinon.stub() } as any;

    // stub axios.create → fake client
    createStub = sinon.stub(axios, 'create').returns(stubClient as any);

    // stub axios-cookiejar-support.wrapper → identity
    wrapperStub = sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake((client) => client as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(cookies: Record<string, string> = {}) {
    const app: Application = express();

    // parse JSON and urlencoded bodies
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // stub req.cookies
    app.use((req, _res, next) => {
      (req as any).cookies = cookies;
      next();
    });

    // stub i18n translator and session
    app.use((req, _res, next) => {
      (req as any).__ = (msg: string) => msg;
      (req as any).session = {};
      next();
    });

    // override res.render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotRoutes(app);
    return app;
  }

  it('re-renders with error on invalid or missing email (default lang=en)', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/enter-email')
      .send({ email: 'bad-email' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'forgot-password',
      options: {
        lang: 'en',
        fieldErrors: { email: 'emailInvalid' },
        email: 'bad-email'
      }
    });

    expect(createStub.notCalled).to.be.true;
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('respects lang=cy cookie on validation error', async () => {
    const app = mkApp({ lang: 'cy' });
    const res = await request(app)
      .post('/forgot-password/enter-email')
      .send({ email: '' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.options.lang).to.equal('cy');
    expect(res.body.options.fieldErrors).to.have.property('email', 'emailInvalid');
  });

  it('redirects to verify-otp on successful submit', async () => {
    // stub CSRF fetch
    stubClient.get
      .withArgs('/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });
    // stub backend call
    stubClient.post
      .withArgs(
        '/forgot-password/enter-email',
        { email: 'user@example.com' },
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({});

    const app = mkApp();
    await request(app)
      .post('/forgot-password/enter-email')
      .send({ email: 'user@example.com' })
      .expect(302)
      .expect('Location', '/forgot-password/verify-otp?lang=en');

    expect(createStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
    expect(stubClient.get.calledOnce).to.be.true;
    expect(stubClient.post.calledOnce).to.be.true;
  });

  it('re-renders with backend error message when response data is string', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokX' } });
    stubClient.post.rejects({ response: { data: 'backend failure' } });

    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/enter-email')
      .send({ email: 'user2@example.com' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'forgot-password',
      options: {
        lang: 'en',
        fieldErrors: { general: 'backend failure' },
        email: 'user2@example.com'
      }
    });
  });

  it('re-renders with default error when backend error has no string body', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokY' } });
    stubClient.post.rejects(new Error('network error'));

    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/enter-email')
      .send({ email: 'user3@example.com' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.options.fieldErrors).to.have.property(
      'general',
      'forgotPasswordError'
    );
  });
});
