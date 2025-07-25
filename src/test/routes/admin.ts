import * as authModule from '../../main/modules/auth';
import adminRoutes from '../../main/routes/admin';

import axios from 'axios';
import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application, NextFunction, Request, Response } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /admin', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('renders the admin view when authenticated', async () => {
    // Stub authentication middleware to call next()
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    const app: Application = express();
    // Override res.render to return JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });
    adminRoutes(app);

    const res = await request(app).get('/admin').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ view: 'admin' });
  });

  it('redirects to /login when not authenticated', async () => {
    // Stub authentication middleware to redirect
    sinon.stub(authModule, 'ensureAuthenticated').callsFake((_req: Request, res: Response) => {
      res.redirect('/login');
    });

    const app: Application = express();
    adminRoutes(app);

    await request(app).get('/admin').expect(302).expect('Location', '/login');
  });
});

describe('GET /popular-chat-categories', () => {
  let createStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;
  let stubClient: { get: sinon.SinonStub };

  beforeEach(() => {
    sinon.stub(console, 'error');

    // bypass real auth
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // fake axios client
    stubClient = { get: sinon.stub() };

    // stub axios.create to return our fake client
    createStub = sinon.stub(axios, 'create').returns(stubClient as any);

    // stub wrapper to just return its argument
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(client => client as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();

    // inject session and user
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie = sessionCookie;
      }
      next();
    });

    // mount all admin & stats routes
    adminRoutes(app);
    return app;
  }

  it('returns 401 when no session cookie', async () => {
    const app = mkApp(); // no cookie
    const res = await request(app).get('/popular-chat-categories').expect(401).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ error: 'Not authenticated' });
    expect(stubClient.get.notCalled).to.be.true;
  });

  it('forwards backend data on success', async () => {
    const data = [{ category: 'test', count: 5 }];
    stubClient.get.withArgs('http://localhost:4550/statistics/popular-chat-categories').resolves({ data });

    const app = mkApp('SESSION=1');
    const res = await request(app).get('/popular-chat-categories').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal(data);
    expect(createStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
    expect(stubClient.get.calledOnce).to.be.true;
  });

  it('returns 500 on backend error', async () => {
    stubClient.get.rejects(new Error('backend fail'));

    const app = mkApp('SESSION=2');
    const res = await request(app).get('/popular-chat-categories').expect(500).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ error: 'Failed to load chat categories' });
    expect(stubClient.get.calledOnce).to.be.true;
  });
});

describe('GET /user-activity', () => {
  let stubClient: { get: sinon.SinonStub };
  let createStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(console, 'error');
    // stub auth to always pass through
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // our fake axios instance
    stubClient = { get: sinon.stub() } as any;
    // stub axios.create to return fake client
    createStub = sinon.stub(axios, 'create').returns(stubClient as any);
    // stub wrapper to return its input
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(client => client as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    // inject session/user
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie = sessionCookie;
      }
      next();
    });
    adminRoutes(app);
    return app;
  }

  it('returns 401 when not authenticated', async () => {
    const app = mkApp(); // no cookie set
    const res = await request(app).get('/user-activity').expect(401).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ error: 'Not authenticated' });
    expect(stubClient.get.notCalled).to.be.true;
  });

  it('forwards backend data on success', async () => {
    const data = { usersOnline: 42 };
    stubClient.get.withArgs('http://localhost:4550/statistics/user-activity').resolves({ data });

    const app = mkApp('SESSION=abc');
    const res = await request(app).get('/user-activity').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal(data);
    expect(createStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
    expect(stubClient.get.calledOnce).to.be.true;
  });

  it('returns 500 on backend error', async () => {
    stubClient.get.rejects(new Error('backend down'));

    const app = mkApp('SESSION=xyz');
    const res = await request(app).get('/user-activity').expect(500).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ error: 'Failed to load user activity' });
    expect(stubClient.get.calledOnce).to.be.true;
  });
});

describe('GET /chat-category-breakdown', () => {
  let stubClient: { get: sinon.SinonStub };
  let createStub: sinon.SinonStub;
  let wrapperStub: sinon.SinonStub;

  beforeEach(() => {
    // silence console.error in the route
    sinon.stub(console, 'error');

    // stub auth to allow through
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // our fake axios instance
    stubClient = { get: sinon.stub() } as any;
    // stub axios.create to return our fake client
    createStub = sinon.stub(axios, 'create').returns(stubClient as any);
    // stub wrapper to return the client unchanged
    wrapperStub = sinon.stub(axiosCookie, 'wrapper').callsFake(client => client as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    // inject session and user
    app.use((req, _res, next) => {
      (req as any).session = {};
      (req as any).user = {};
      if (sessionCookie) {
        (req as any).session.springSessionCookie = sessionCookie;
        (req as any).user.springSessionCookie = sessionCookie;
      }
      next();
    });
    // mount the routes under test
    adminRoutes(app);
    return app;
  }

  it('returns 401 when no session cookie', async () => {
    const app = mkApp(); // no cookie
    const res = await request(app).get('/chat-category-breakdown').expect(401).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ error: 'Not authenticated' });
    expect(stubClient.get.notCalled).to.be.true;
  });

  it('forwards backend data on success', async () => {
    const data = { categories: { A: 3, B: 7 } };
    stubClient.get.withArgs('http://localhost:4550/statistics/chat-category-breakdown').resolves({ data });

    const app = mkApp('SESSION=1');
    const res = await request(app).get('/chat-category-breakdown').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal(data);
    expect(createStub.calledOnce).to.be.true;
    expect(wrapperStub.calledOnce).to.be.true;
    expect(stubClient.get.calledOnce).to.be.true;
  });

  it('returns 500 on backend error', async () => {
    stubClient.get.rejects(new Error('backend fail'));

    const app = mkApp('SESSION=2');
    const res = await request(app).get('/chat-category-breakdown').expect(500).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ error: 'Failed to fetch data' });
    expect(stubClient.get.calledOnce).to.be.true;
  });
});
