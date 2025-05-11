import * as authModule from '../../main/modules/auth';
import requestsRoutes from '../../main/routes/requests';

import axios from 'axios';
import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application, NextFunction, Request, Response } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /requests/pending', () => {
  let stubClient: { get: sinon.SinonStub };

  beforeEach(() => {
    // stub authentication to always pass
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // fake axios client
    stubClient = { get: sinon.stub() } as any;

    // default backend stub: resolves empty list
    stubClient.get
      .withArgs('http://localhost:4550/account/pending')
      .resolves({ data: [] });

    // stub axios.create → our fake client
    sinon.stub(axios, 'create').returns(stubClient as any);

    // stub wrapper → identity
    sinon.stub(axiosCookie, 'wrapper').callsFake(client => client as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    app.use(express.urlencoded({ extended: false }));
    // inject session, user, cookies
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user = {};
      req.cookies = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie = sessionCookie;
      }
      next();
    });
    // mount the route
    requestsRoutes(app);
    return app;
  }

  it('returns 401 if not authenticated', async () => {
    await request(mkApp())
      .get('/requests/pending')
      .expect(401)
      .expect('Content-Type', /json/)
      .expect({ error: 'Not authenticated' });
  });

  it('forwards backend data on success', async () => {
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
    stubClient.get
      .withArgs('http://localhost:4550/account/pending')
      .resolves({ data });

    const res = await request(mkApp('SESSION=1'))
      .get('/requests/pending')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal(data);
  });

  it('returns 500 on backend error', async () => {
    // Clear all previous behaviors on stubClient.get
    stubClient.get.resetBehavior();

    // Now have it reject for any call to that URL
    stubClient.get.rejects(new Error('backend down'));

    await request(mkApp('SESSION=2'))
      .get('/requests/pending')
      .expect(500)
      .expect('Content-Type', /json/)
      .expect({ error: 'Failed to load pending requests' });
  });
});

describe('POST /requests/:requestId/accept', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    // allow authentication
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // create a fake axios client
    stubClient = { get: sinon.stub(), post: sinon.stub() };

    // default CSRF stub returns token
    stubClient.get
      .withArgs('http://localhost:4550/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });

    // stub axios.create → fake client
    sinon.stub(axios, 'create').returns(stubClient as any);

    // stub wrapper → identity
    sinon.stub(axiosCookie, 'wrapper').callsFake(client => client as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    app.use(express.urlencoded({ extended: false }));

    // inject session & user & cookies
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user = {};
      req.cookies = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie = sessionCookie;
      }
      next();
    });

    // override res.render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    requestsRoutes(app);
    return app;
  }

  it('returns 401 when not authenticated', async () => {
    await request(mkApp())
      .post('/requests/42/accept')
      .expect(401)
      .expect('Not authenticated');
  });

  it('redirects on successful accept', async () => {
    // stub approve call to succeed
    stubClient.post
      .withArgs(
        'http://localhost:4550/account/approve/99',
        {},
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({});

    await request(mkApp('SESSION=1'))
      .post('/requests/99/accept')
      .expect(302)
      .expect('Location', '/account-requests?accepted=true');
  });

  it('renders error view on backend failure', async () => {
    // stub approve call to fail
    stubClient.post
      .withArgs(
        'http://localhost:4550/account/approve/123',
        sinon.match.any,
        sinon.match.any
      )
      .rejects(new Error('fail'));

    const res = await request(mkApp('SESSION=2'))
      .post('/requests/123/accept')
      .expect(500)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'account-requests',
      options: {
        accepted: false,
        rejected: false,
        error: 'Failed to accept request'
      }
    });
  });
});

describe('POST /requests/:requestId/reject', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    // allow authentication
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // fake axios client
    stubClient = { get: sinon.stub(), post: sinon.stub() };

    // default CSRF stub
    stubClient.get
      .withArgs('http://localhost:4550/csrf')
      .resolves({ data: { csrfToken: 'tok123' } });

    sinon.stub(axios, 'create').returns(stubClient as any);
    sinon.stub(axiosCookie, 'wrapper').callsFake(c => c as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());

    // inject session & user & cookies
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user = {};
      req.cookies = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie = sessionCookie;
      }
      next();
    });

    // override res.render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    requestsRoutes(app);
    return app;
  }

  it('returns 401 when not authenticated', async () => {
    await request(mkApp())
      .post('/requests/55/reject')
      .expect(401)
      .expect('Not authenticated');
  });

  it('redirects on successful reject', async () => {
    stubClient.post
      .withArgs(
        'http://localhost:4550/account/reject/77',
        {},
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok123' } })
      )
      .resolves({});

    await request(mkApp('SESSION=abc'))
      .post('/requests/77/reject')
      .expect(302)
      .expect('Location', '/account-requests?rejected=true');
  });

  it('renders JSON error on backend failure', async () => {
    stubClient.post
      .withArgs(
        'http://localhost:4550/account/reject/88',
        sinon.match.any,
        sinon.match.any
      )
      .rejects(new Error('failure'));

    const res = await request(mkApp('SESSION=xyz'))
      .post('/requests/88/reject')
      .expect(500)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'account-requests',
      options: {
        accepted: false,
        rejected: false,
        error: 'Failed to reject request'
      }
    });
  });
});
