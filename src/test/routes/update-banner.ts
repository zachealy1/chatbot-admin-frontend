import * as authModule from '../../main/modules/auth';
import updateBannerRoutes from '../../main/routes/update-banner';

import axios from 'axios';
import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application, NextFunction, Request, Response } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /update-banner', () => {
  let stubClient: { get: sinon.SinonStub };

  beforeEach(() => {
    // stub auth
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, _res: Response, next: NextFunction) => next());

    // fake axios client
    stubClient = { get: sinon.stub() } as any;

    // stub axios.create -> our fake client
    sinon.stub(axios, 'create').returns(stubClient as any);

    // wrapper identity
    sinon.stub(axiosCookie, 'wrapper').callsFake(c => c as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(sessionCookie?: string) {
    const app: Application = express();
    app.use(express.urlencoded({ extended: false }));

    // inject session/user
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

    // stub res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    updateBannerRoutes(app);
    return app;
  }

  it('redirects to login when no session cookie', async () => {
    await request(mkApp()).get('/update-banner').expect(302).expect('Location', '/login');
  });

  it('renders banner data when backend returns successfully', async () => {
    stubClient.get
      .withArgs('http://localhost:4550/support-banner/1')
      .resolves({ data: { id: 1, title: 'Hello', content: '<p>World</p>' } });

    const res = await request(mkApp('S=1'))
      .get('/update-banner?updated=true')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'update-banner',
      options: {
        bannerTitle: 'Hello',
        bannerBody: '<p>World</p>',
        updated: true,
      },
    });
  });

  it('defaults to fallback banner on backend error', async () => {
    stubClient.get.withArgs('http://localhost:4550/support-banner/1').rejects(new Error('fail'));

    const res = await request(mkApp('S=2')).get('/update-banner').expect(200).expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'update-banner',
      options: {
        bannerTitle: 'Contact Support Team',
        bannerBody:
          "If you need assistance, please call us at <strong>0800 123 456</strong> or email <a href='mailto:support@example.com'>support@example.com</a>.",
        updated: false,
        error: 'Could not load banner — please try again.',
      },
    });
  });
});

describe('POST /update-banner', () => {
  let stubClient: { get: sinon.SinonStub; put: sinon.SinonStub };

  beforeEach(() => {
    // fake axios client
    stubClient = { get: sinon.stub(), put: sinon.stub() };

    // stub CSRF GET
    stubClient.get.withArgs('http://localhost:4550/csrf').resolves({ data: { csrfToken: 'tokXYZ' } });

    // stub axios.create -> fake client
    sinon.stub(axios, 'create').returns(stubClient as any);

    // wrapper identity
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

    // override res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    updateBannerRoutes(app);
    return app;
  }

  it('redirects to login when no session cookie', async () => {
    await request(mkApp())
      .post('/update-banner')
      .send({ bannerTitle: 'T', bannerBody: 'B' })
      .expect(302)
      .expect('Location', '/login');
  });

  it('redirects on successful update', async () => {
    stubClient.put
      .withArgs(
        'http://localhost:4550/support-banner/1',
        { title: 'New', content: 'Body' },
        sinon.match({ headers: { 'X-XSRF-TOKEN': 'tokXYZ' } })
      )
      .resolves({});

    await request(mkApp('S=1'))
      .post('/update-banner')
      .send({ bannerTitle: 'New', bannerBody: 'Body' })
      .expect(302)
      .expect('Location', '/update-banner?updated=true');
  });

  it('renders error on backend failure', async () => {
    stubClient.put.rejects(new Error('oops'));

    const res = await request(mkApp('S=2'))
      .post('/update-banner')
      .send({ bannerTitle: 'Fail', bannerBody: 'Now' })
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({
      view: 'update-banner',
      options: {
        error: 'Could not save banner—please try again.',
        bannerTitle: 'Fail',
        bannerBody: 'Now',
      },
    });
  });
});
