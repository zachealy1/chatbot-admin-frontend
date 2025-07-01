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
    // Stub ensureAuthenticated -> next()
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // Stub axios-cookiejar-support.wrapper to return our fake client
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
      (req as any).user = {};
      if (sessionCookie) {
        // if provided, set both user and session cookie
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie = sessionCookie;
      }
      next();
    });

    // override res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    accountRoutes(app);
    return app;
  }

  it('renders error view when no session cookie is present', async () => {
    const app = mkApp(); // no cookie
    const res = await request(app).get('/account').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'account',
      options: {
        errors: ['Error retrieving account details.'],
        updated: false,
      },
    });
    // ensure we never attempted to call backend
    expect(stubClient.get.called).to.be.false;
  });

  it('fetches data and renders account view when session cookie present (updated=false)', async () => {
    // stub each backend endpoint
    stubClient.get.withArgs('http://localhost:4550/account/username').resolves({ data: 'alice' });
    stubClient.get.withArgs('http://localhost:4550/account/email').resolves({ data: 'alice@example.com' });
    stubClient.get.withArgs('http://localhost:4550/account/date-of-birth/day').resolves({ data: '5' });
    stubClient.get.withArgs('http://localhost:4550/account/date-of-birth/month').resolves({ data: '7' });
    stubClient.get.withArgs('http://localhost:4550/account/date-of-birth/year').resolves({ data: '1985' });

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
        errors: null,
      },
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
        errors: null,
      },
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

    // stub render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    accountRoutes(app);
    return app;
  }

  it('renders the update view when authenticated', async () => {
    const app = mkApp();
    const res = await request(app).get('/account/update').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'update',
    });
    expect(ensureStub.calledOnce).to.be.true;
  });

  it('redirects to /login when not authenticated', async () => {
    // Change stub to simulate unauthenticated behaviour
    ensureStub.restore();
    sinon.stub(authModule, 'ensureAuthenticated').callsFake((_req: Request, res: any) => {
      res.redirect('/login');
    });

    const app = mkApp();
    await request(app).get('/account/update').expect(302).expect('Location', '/login');
  });
});

describe('POST /account/update', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };
  let wrapperStub: sinon.SinonStub;

  beforeEach(() => {
    // silence console.error from the route
    sinon.stub(console, 'error');

    // fake axios client
    stubClient = {
      get: sinon.stub(),
      post: sinon.stub(),
    };
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // stub session and user, and ensure body fields exist
    app.use((req, _res, next) => {
      req.body = req.body || {};
      req.body['date-of-birth-day'] = req.body['date-of-birth-day'] ?? '';
      req.body['date-of-birth-month'] = req.body['date-of-birth-month'] ?? '';
      req.body['date-of-birth-year'] = req.body['date-of-birth-year'] ?? '';
      (req as any).session = {};
      (req as any).user = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie = sessionCookie;
      }
      next();
    });

    // override render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    accountRoutes(app);
    return app;
  }

  it('returns 401 and re-renders when no session cookie is present', async () => {
    const app = mkApp(); // no cookie
    const res = await request(app)
      .post('/account/update')
      .send({
        username: 'u',
        email: 'u@example.com',
        'date-of-birth-day': '1',
        'date-of-birth-month': '1',
        'date-of-birth-year': '1990',
      })
      .expect(401)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'account',
      options: {
        errors: ['Session expired or invalid. Please log in again.'],
        username: 'u',
        email: 'u@example.com',
        day: '1',
        month: '1',
        year: '1990',
      },
    });
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('redirects to /account?updated=true on successful backend update', async () => {
    // stub CSRF fetch
    stubClient.get.withArgs('http://localhost:4550/csrf').resolves({ data: { csrfToken: 'tok123' } });
    // stub account update POST
    stubClient.post
      .withArgs(
        'http://localhost:4550/account/update',
        {
          email: 'u@example.com',
          username: 'u',
          dateOfBirth: '1990-01-01',
          password: undefined,
          confirmPassword: undefined,
        },
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({});

    const app = mkApp('SESSION=abc');
    await request(app)
      .post('/account/update')
      .send({
        username: 'u',
        email: 'u@example.com',
        'date-of-birth-day': '1',
        'date-of-birth-month': '1',
        'date-of-birth-year': '1990',
      })
      .expect(302)
      .expect('Location', '/account?updated=true');

    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('re-renders with generic error when backend update fails', async () => {
    // stub CSRF fetch
    stubClient.get.withArgs('http://localhost:4550/csrf').resolves({ data: { csrfToken: 'tokXYZ' } });
    // stub account update POST to fail
    stubClient.post.rejects(new Error('boom'));

    const app = mkApp('SESSION=xyz');
    const res = await request(app)
      .post('/account/update')
      .send({
        username: 'user2',
        email: 'user2@example.com',
        'date-of-birth-day': '2',
        'date-of-birth-month': '2',
        'date-of-birth-year': '1992',
      })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'account',
      options: {
        errors: ['An error occurred during account update. Please try again later.'],
        username: 'user2',
        email: 'user2@example.com',
        day: '2',
        month: '2',
        year: '1992',
      },
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });
});
