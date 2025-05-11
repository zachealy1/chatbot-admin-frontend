import * as authModule from '../../main/modules/auth';
import manageRoutes from '../../main/routes/manage-accounts';

import axios from 'axios';
import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application, NextFunction, Request, Response } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /manage-accounts', () => {
  beforeEach(() => {
    // stub ensureAuthenticated to just call next()
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // fake axios client
    const stubClient = { get: sinon.stub() };

    // stub axios.create → our fake client
    sinon.stub(axios, 'create').returns(stubClient as any);

    // stub wrapper → identity
    sinon.stub(axiosCookie, 'wrapper').callsFake(client => client as any);

    // now stub the backend call URL
    stubClient.get
      .withArgs('http://localhost:4550/account/all')
      .resolves({ data: [] });
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    app.use(express.urlencoded({ extended: false }));

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

    // override res.render → JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    manageRoutes(app);
    return app;
  }

  it('redirects to /login when not authenticated', async () => {
    await request(mkApp())
      .get('/manage-accounts')
      .expect(302)
      .expect('Location', '/login');
  });

  it('renders with no accounts when backend returns empty', async () => {
    const res = await request(mkApp('SESSION=1'))
      .get('/manage-accounts')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'manage-accounts',
      options: {
        deleted: false,
        pages: [1],
        currentPage: 1,
        hasAccounts: false
      }
    });
  });
});
