import * as authModule from '../../main/modules/auth';
import accountRoutes from '../../main/routes/account';

import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application, NextFunction, Request, Response } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /account', () => {
  let stubClient: { get: sinon.SinonStub };

  beforeEach(() => {
    // 1) Stub ensureAuthenticated → next()
    sinon.stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // 2) Stub axios-cookiejar-support.wrapper to return our fake client
    stubClient = { get: sinon.stub() };
    sinon.stub(axiosCookie, 'wrapper').returns(stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();

    // mount body parser so req.query works
    app.use(express.urlencoded({ extended: false }));

    // inject session/user
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user    = {};
      if (sessionCookie) {
        // if provided, set both user and session cookie
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie    = sessionCookie;
      }
      next();
    });

    // override res.render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    accountRoutes(app);
    return app;
  }

  it('renders error view when no session cookie is present', async () => {
    const app = mkApp();  // no cookie
    const res = await request(app)
      .get('/account')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'account',
      options: {
        errors: ['Error retrieving account details.'],
        updated: false
      }
    });
    // ensure we never attempted to call backend
    expect(stubClient.get.called).to.be.false;
  });

  it('fetches data and renders account view when session cookie present (updated=false)', async () => {
    // stub each backend endpoint
    stubClient.get
      .withArgs('http://localhost:4550/account/username')
      .resolves({ data: 'alice' });
    stubClient.get
      .withArgs('http://localhost:4550/account/email')
      .resolves({ data: 'alice@example.com' });
    stubClient.get
      .withArgs('http://localhost:4550/account/date-of-birth/day')
      .resolves({ data: '5' });
    stubClient.get
      .withArgs('http://localhost:4550/account/date-of-birth/month')
      .resolves({ data: '7' });
    stubClient.get
      .withArgs('http://localhost:4550/account/date-of-birth/year')
      .resolves({ data: '1985' });

    const app = mkApp('SESSION=xyz');
    const res = await request(app)
      .get('/account')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect('Cache-Control', 'no-store');

    expect(res.body).to.deep.equal({
      view: 'account',
      options: {
        username: 'alice',
        email: 'alice@example.com',
        day: '5',
        month: '7',
        year: '1985',
        updated: false,
        errors: null
      }
    });
    expect(stubClient.get.callCount).to.equal(5);
  });

  it('fetches data and renders account view when session cookie present (updated=true)', async () => {
    // reuse stubs from previous test
    stubClient.get.resolves({ data: 'foo' });
    // we only need to check updated flag, so stub generically
    const app = mkApp('SESSION=abc');
    const res = await request(app)
      .get('/account?updated=true')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect('Cache-Control', 'no-store');

    // since stubClient.get returns 'foo' for all calls:
    expect(res.body).to.deep.equal({
      view: 'account',
      options: {
        username: 'foo',
        email: 'foo',
        day: 'foo',
        month: 'foo',
        year: 'foo',
        updated: true,
        errors: null
      }
    });
    expect(stubClient.get.callCount).to.equal(5);
  });
});

describe('GET /account/update', () => {
  let ensureStub: sinon.SinonStub;

  beforeEach(() => {
    // Default: authenticated
    ensureStub = sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp() {
    const app: Application = express();

    // stub render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    accountRoutes(app);
    return app;
  }

  it('renders the update view when authenticated', async () => {
    const app = mkApp();
    const res = await request(app)
      .get('/account/update')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'update',
    });
    expect(ensureStub.calledOnce).to.be.true;
  });

  it('redirects to /login when not authenticated', async () => {
    // Change stub to simulate unauthenticated behaviour
    ensureStub.restore();
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, res: any) => {
        res.redirect('/login');
      });

    const app = mkApp();
    await request(app)
      .get('/account/update')
      .expect(302)
      .expect('Location', '/login');
  });
});

