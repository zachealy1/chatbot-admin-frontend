import * as authModule from '../../main/modules/auth';
import pendingRoutes from '../../main/routes/requests';

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
    pendingRoutes(app);
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
