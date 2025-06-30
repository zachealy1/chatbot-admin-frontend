import authRoutes from '../../main/routes/auth';

import axios from 'axios';
import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /login', () => {
  function mkApp() {
    const app: Application = express();

    // override res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    authRoutes(app);
    return app;
  }

  it('renders default flags when no query params', async () => {
    const res = await request(mkApp())
      .get('/login')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'login',
      options: { created: false, passwordReset: false }
    });
  });

  it('sets created true when created=true', async () => {
    const res = await request(mkApp())
      .get('/login?created=true')
      .expect(200);

    expect(res.body).to.deep.equal({
      view: 'login',
      options: { created: true, passwordReset: false }
    });
  });

  it('sets passwordReset true when passwordReset=true', async () => {
    const res = await request(mkApp())
      .get('/login?passwordReset=true')
      .expect(200);

    expect(res.body).to.deep.equal({
      view: 'login',
      options: { created: false, passwordReset: true }
    });
  });

  it('handles both flags together', async () => {
    const res = await request(mkApp())
      .get('/login?created=true&passwordReset=true')
      .expect(200);

    expect(res.body).to.deep.equal({
      view: 'login',
      options: { created: true, passwordReset: true }
    });
  });

  it('treats other values as false', async () => {
    const res = await request(mkApp())
      .get('/login?created=1&passwordReset=0')
      .expect(200);

    expect(res.body).to.deep.equal({
      view: 'login',
      options: { created: false, passwordReset: false }
    });
  });
});

describe('GET /logout', () => {
  function mkApp(logoutError: Error | null = null) {
    const app: Application = express();

    // stub req.logout and req.session.destroy
    app.use((req, res, next) => {
      const r = req as any;
      r.logout = (cb: (err?: any) => void) => cb(logoutError);
      r.session = {
        destroy: (cb: (err?: any) => void) => cb(undefined),
      };
      next();
    });

    // override res.redirect and res.status/send for capture
    authRoutes(app);
    return app;
  }

  it('redirects to /login when logout succeeds', async () => {
    await request(mkApp(null))
      .get('/logout')
      .expect(302)
      .expect('Location', '/login');
  });

  it('returns 500 when logout callback errors', async () => {
    await request(mkApp(new Error('boom')))
      .get('/logout')
      .expect(500)
      .expect('Content-Type', /text\/plain|text\/html/)
      .expect('Failed to logout');
  });
});

describe('POST /login', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };
  let createStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;

  beforeEach(() => {
    // fake axios client
    stubClient = { get: sinon.stub(), post: sinon.stub() };

    // stub axios.create -> fake client
    createStub = sinon.stub(axios, 'create').returns(stubClient as any);
    // wrapper identity
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(c => c as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(options: {
    sessionSaveError?: Error;
    loginError?: Error;
  } = {}) {
    const app: Application = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());

    // inject session, user, cookies, __ translation
    app.use((req, _res, next) => {
      (req as any).session = {
        save: (cb: (err?: any) => void) => cb(options.sessionSaveError),
      };
      (req as any).login = (_user: any, cb: (err?: any) => void) =>
        cb(options.loginError);
      req.cookies = {}; // default lang=en
      req.__ = (msg: string) => msg;
      next();
    });

    // override res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    // mount routes
    authRoutes(app);
    return app;
  }

  it('redirects to /admin on successful login', async () => {
    stubClient.get
      .withArgs('/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });
    stubClient.post
      .withArgs('/login/admin', { username: 'u', password: 'p' }, sinon.match.object)
      .resolves({ headers: { 'set-cookie': ['S=1'] } });
    await request(mkApp())
      .post('/login')
      .send({ username: 'u', password: 'p' })
      .expect(302)
      .expect('Location', '/admin');
// session populated
    // wrapper and create both called
    expect(createStub.called).to.be.true;
    expect(wrapperStub.called).to.be.true;
  });

  it('re-renders login with session-save error', async () => {
    stubClient.get
      .withArgs('/csrf')
      .resolves({ data: { csrfToken: 'tokA' } });
    stubClient.post.resolves({ headers: { 'set-cookie': ['S=2'] } });

    const res = await request(mkApp({ sessionSaveError: new Error('save fail') }))
      .post('/login')
      .send({ username: 'u2', password: 'p2' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'login',
      options: {
        error: 'loginSessionError',
        username: 'u2'
      }
    });
  });

  it('re-renders login on backend failure with string message', async () => {
    stubClient.get.rejects({ response: { data: 'bad credentials' } });

    const res = await request(mkApp())
      .post('/login')
      .send({ username: 'u3', password: 'p3' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'login',
      options: {
        error: 'bad credentials',
        username: 'u3'
      }
    });
  });

  it('re-renders login on backend failure with default key', async () => {
    stubClient.get.rejects(new Error('network'));

    const res = await request(mkApp())
      .post('/login')
      .send({ username: 'u4', password: 'p4' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'login',
      options: {
        error: 'loginInvalidCredentials',
        username: 'u4'
      }
    });
  });
});
