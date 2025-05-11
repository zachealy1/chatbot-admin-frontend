import * as authModule from '../../main/modules/auth';
import accountRequestsRoutes from '../../main/routes/accounts';

import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application, NextFunction, Request, Response } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /account-requests', () => {
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub };

  beforeEach(() => {
    sinon.stub(console, 'error');
    // stub auth for all tests
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    stubClient = { get: sinon.stub() };
    wrapperStub = sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user    = {};
      req.cookies          = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie    = sessionCookie;
      }
      next();
    });
    // render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });
    accountRequestsRoutes(app);
    return app;
  }

  it('redirects to /login if not logged in', async () => {
    const app = mkApp();
    await request(app)
      .get('/account-requests')
      .expect(302)
      .expect('Location', '/login');
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('renders with no requests when backend returns empty array', async () => {
    stubClient.get
      .withArgs('http://localhost:4550/account/pending')
      .resolves({ data: [] });

    const app = mkApp('SESSION=1');
    const res = await request(app)
      .get('/account-requests')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'account-requests',
      options: {
        accepted: false,
        rejected: false,
        pages: [1],
        currentPage: 1,
        hasRequests: false,
      },
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('paginates and respects accepted/rejected query flags', async () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ id: i + 1 }));
    stubClient.get
      .withArgs('http://localhost:4550/account/pending')
      .resolves({ data: items });

    const app = mkApp('SESSION=2');
    const res = await request(app)
      .get('/account-requests?accepted=true&rejected=true&page=2')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'account-requests',
      options: {
        accepted: true,
        rejected: true,
        pages: [1, 2],
        currentPage: 2,
        hasRequests: true,
      },
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('renders error on backend failure', async () => {
    stubClient.get.rejects(new Error('backend down'));

    const app = mkApp('SESSION=3');
    const res = await request(app)
      .get('/account-requests')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'account-requests',
      options: {
        accepted: false,
        rejected: false,
        pages: [1],
        currentPage: 1,
        error: 'Could not load requests',
      },
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });
});

describe('POST /accounts/:accountId/delete', () => {
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub; delete: sinon.SinonStub };

  beforeEach(() => {
    sinon.stub(console, 'error');
    // stub auth middleware
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    stubClient = {
      get: sinon.stub(),
      delete: sinon.stub(),
    };
    wrapperStub = sinon
      .stub(axiosCookie, 'wrapper')
      .callsFake(() => stubClient as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user    = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie    = sessionCookie;
      }
      next();
    });
    // render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });
    accountRequestsRoutes(app);
    return app;
  }

  it('responds 401 when not authenticated', async () => {
    const app = mkApp(); // no cookie
    await request(app)
      .post('/accounts/123/delete')
      .expect(401)
      .expect('Not authenticated');
    expect(wrapperStub.notCalled).to.be.true;
  });

  it('redirects on successful delete', async () => {
    stubClient.get
      .withArgs('http://localhost:4550/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });
    stubClient.delete
      .withArgs(
        'http://localhost:4550/account/456',
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({});

    const app = mkApp('SESSION=4');
    await request(app)
      .post('/accounts/456/delete')
      .expect(302)
      .expect('Location', '/manage-accounts?deleted=true');
    expect(wrapperStub.calledOnce).to.be.true;
  });

  it('renders error view on delete failure', async () => {
    stubClient.get.resolves({ data: { csrfToken: 'tokXYZ' } });
    stubClient.delete.rejects(new Error('boom'));

    const app = mkApp('SESSION=5');
    const res = await request(app)
      .post('/accounts/789/delete')
      .expect(500)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'manage-accounts',
      options: {
        deleted: false,
        error: 'Failed to delete account. Please try again.',
      },
    });
    expect(wrapperStub.calledOnce).to.be.true;
  });
});
