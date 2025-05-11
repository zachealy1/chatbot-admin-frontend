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

describe('POST /forgot-password/reset-password', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };
  let createStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(console, 'error');

    stubClient = { get: sinon.stub(), post: sinon.stub() } as any;
    createStub = sinon.stub(axios, 'create').returns(stubClient as any);
    wrapperStub = sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake(client => client as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(
    session: Partial<Record<'email' | 'verifiedOtp', string>> = {},
    cookies: Record<string, string> = {}
  ) {
    const app: Application = express();
    // parse JSON and urlencoded bodies
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // stub cookies
    app.use((req, _res, next) => {
      (req as any).cookies = cookies;
      next();
    });

    // stub i18n translator
    app.use((req, _res, next) => {
      (req as any).__ = (msg: string) => msg;
      next();
    });

    // stub session
    app.use((req, _res, next) => {
      (req as any).session = { ...(session as any) };
      next();
    });

    // override render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotRoutes(app);
    return app;
  }

  it('re-renders with errors when fields missing and session missing', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: '', confirmPassword: '' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'reset-password',
      options: {
        lang: 'en',
        fieldErrors: {
          password: 'passwordRequired',
          confirmPassword: 'confirmPasswordRequired',
          general: 'resetSessionMissing',
        },
        password: '',
        confirmPassword: ''
      }
    });

    expect(createStub.notCalled).to.be.true;
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('re-renders with strength errors when both password and confirm are weak', async () => {
    const app = mkApp({ email: 'a@b.com', verifiedOtp: '1234' });
    const res = await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: 'weak', confirmPassword: 'weak' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.options.fieldErrors).to.have.property('password', 'passwordCriteria');
    expect(res.body.options.fieldErrors).to.not.have.property('confirmPassword');
  });

  it('re-renders with mismatch error when passwords do not match', async () => {
    const app = mkApp({ email: 'a@b.com', verifiedOtp: '1234' });
    const res = await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: 'StrongP@ss1', confirmPassword: 'Mismatch1!' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.options.fieldErrors).to.have.property('confirmPassword', 'passwordsMismatch');
  });

  it('redirects on successful reset', async () => {
    stubClient.get
      .withArgs('/csrf')
      .resolves({ data: { csrfToken: 't0k' } });
    stubClient.post
      .withArgs(
        '/forgot-password/reset-password',
        sinon.match({
          email: 'u@e.com',
          otp: '9999',
          password: 'StrongP@ss1',
          confirmPassword: 'StrongP@ss1'
        }),
        sinon.match({ headers: { 'X-XSRF-TOKEN': 't0k' } })
      )
      .resolves({});

    const app = mkApp(
      { email: 'u@e.com', verifiedOtp: '9999' },
      { lang: 'cy' }
    );
    await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: 'StrongP@ss1', confirmPassword: 'StrongP@ss1' })
      .expect(302)
      .expect('Location', '/login?passwordReset=true&lang=cy');

    expect(createStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders with backend string error', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokX' } });
    stubClient.post.rejects({ response: { data: 'backend oops' } });

    const app = mkApp({ email: 'x@y.z', verifiedOtp: '0000' });
    const res = await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: 'StrongP@ss1', confirmPassword: 'StrongP@ss1' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.options.fieldErrors).to.have.property('general', 'backend oops');
  });

  it('re-renders with fallback error when backend error is non-string', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokY' } });
    stubClient.post.rejects(new Error('network fail'));

    const app = mkApp({ email: 'x@y.z', verifiedOtp: '0000' });
    const res = await request(app)
      .post('/forgot-password/reset-password')
      .send({ password: 'StrongP@ss1', confirmPassword: 'StrongP@ss1' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.options.fieldErrors).to.have.property('general', 'resetError');
  });
});

describe('POST /forgot-password/verify-otp', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };
  let createStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(console, 'error');
    stubClient = { get: sinon.stub(), post: sinon.stub() } as any;
    createStub = sinon.stub(axios, 'create').returns(stubClient as any);
    wrapperStub = sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake(client => client as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(
    session: Partial<Record<'email' | 'verifiedOtp', string>> = {},
    cookies: Record<string, string> = {}
  ) {
    const app: Application = express();
    app.use(express.json());                      // ← parse JSON bodies
    app.use(express.urlencoded({ extended: false }));

    app.use((req, _res, next) => {
      (req as any).cookies = cookies;
      next();
    });
    app.use((req, _res, next) => {
      (req as any).__ = (msg: string) => msg;
      next();
    });
    app.use((req, _res, next) => {
      (req as any).session = { ...(session as any) };
      next();
    });
    app.use((req, res, next) => {
      // render → JSON
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });
    forgotRoutes(app);
    return app;
  }

  it('re-renders when session email missing and OTP missing', async () => {
    const app = mkApp();
    const res = await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        oneTimePassword: '',             // now included
        fieldErrors: {
          general: 'noEmailInSession',
          oneTimePassword: 'otpRequired'
        }
      }
    });
    expect(createStub.notCalled).to.be.true;
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('re-renders when OTP missing but email present', async () => {
    const app = mkApp({ email: 'u@e.com' });
    const res = await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.options.fieldErrors).to.deep.equal({
      oneTimePassword: 'otpRequired'
    });
  });

  it('redirects on successful verify-otp (default lang=en)', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post.resolves({});

    const app = mkApp({ email: 'u@e.com' });
    await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '9999' })
      .expect(302)
      .expect('Location', '/forgot-password/reset-password?lang=en');

    expect(createStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('redirects with cy lang when cookie set', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokABC' } });
    stubClient.post.resolves({});

    const app = mkApp({ email: 'x@y.z' }, { lang: 'cy' });
    await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '1234' })
      .expect(302)
      .expect('Location', '/forgot-password/reset-password?lang=cy');
  });

  it('re-renders with backend string error', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokX' } });
    stubClient.post.rejects({ response: { data: 'expired' } });

    const app = mkApp({ email: 'u@e.com' });
    const res = await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '0000' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'verify-otp',
      options: {
        lang: 'en',
        sent: false,
        oneTimePassword: '0000',
        fieldErrors: { general: 'expired' }
      }
    });
  });

  it('re-renders with fallback error when backend non-string error', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokY' } });
    stubClient.post.rejects(new Error('network'));

    const app = mkApp({ email: 'u@e.com' });
    const res = await request(app)
      .post('/forgot-password/verify-otp')
      .send({ oneTimePassword: '1111' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body.options.fieldErrors).to.deep.equal({
      general: 'otpVerifyError'
    });
  });
});
