import registerRoutes from '../../main/routes/register';

import axios from 'axios';
import * as axiosCookie from 'axios-cookiejar-support';
import { expect } from 'chai';
import express, { Application } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('Register Routes', () => {
  let stubClient: { get: sinon.SinonStub; post: sinon.SinonStub };

  beforeEach(() => {
    // fake axios client
    stubClient = { get: sinon.stub(), post: sinon.stub() } as any;

    // stub axios.create -> our fake client
    sinon.stub(axios, 'create').returns(stubClient as any);

    // stub wrapper -> identity
    sinon.stub(axiosCookie, 'wrapper').callsFake(client => client as any);
  });

  afterEach(() => {
    sinon.restore();
  });

  function mkApp(cookies: Record<string, string> = {}) {
    const app: Application = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());

    // stub cookies, session, translator
    app.use((req, _res, next) => {
      (req as any).cookies = cookies;
      (req as any).session = {};
      (req as any).__ = (msg: string) => msg;
      next();
    });

    // override res.render -> JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    registerRoutes(app);
    return app;
  }

  describe('GET /register', () => {
    it('renders the register page', async () => {
      const res = await request(mkApp()).get('/register').expect(200).expect('Content-Type', /json/);
      expect(res.body).to.deep.equal({ view: 'register' });
    });
  });

  describe('POST /register', () => {
    it('re-renders with all validation errors when body empty', async () => {
      const res = await request(mkApp()).post('/register').send({}).expect(200).expect('Content-Type', /json/);

      expect(res.body).to.deep.equal({
        view: 'register',
        options: {
          lang: 'en',
          fieldErrors: {
            username: 'usernameRequired',
            email: 'emailInvalid',
            dateOfBirth: 'dobInvalid',
            password: 'passwordCriteria',
            confirmPassword: 'confirmPasswordRequired',
          },
        },
      });
    });

    it('uses Welsh locale when cookie set', async () => {
      const app = mkApp({ lang: 'cy' });
      const res = await request(app).post('/register').send({}).expect(200).expect('Content-Type', /json/);
      expect(res.body.options.lang).to.equal('cy');
    });

    it('redirects on successful registration (lang=en)', async () => {
      // stub CSRF and post
      stubClient.get.withArgs('/csrf').resolves({ data: { csrfToken: 'tok1' } });
      stubClient.post
        .withArgs('/account/register/admin', sinon.match.object, sinon.match({ headers: { 'X-XSRF-TOKEN': 'tok1' } }))
        .resolves({});

      const res = await request(mkApp())
        .post('/register')
        .send({
          username: 'u',
          email: 'u@e.com',
          'date-of-birth-day': '1',
          'date-of-birth-month': '1',
          'date-of-birth-year': '2000',
          password: 'StrongP@ss1',
          confirmPassword: 'StrongP@ss1',
        })
        .expect(302)
        .expect('Location', '/login?created=true&lang=en');

      // no JSON body on redirect
      expect(res.body).to.deep.equal({});
    });

    it('redirects on successful registration (lang=cy)', async () => {
      stubClient.get.resolves({ data: { csrfToken: 'tok2' } });
      stubClient.post.resolves({});

      const res = await request(mkApp({ lang: 'cy' }))
        .post('/register')
        .send({
          username: 'u',
          email: 'u@e.com',
          'date-of-birth-day': '1',
          'date-of-birth-month': '1',
          'date-of-birth-year': '2000',
          password: 'StrongP@ss1',
          confirmPassword: 'StrongP@ss1',
        })
        .expect(302)
        .expect('Location', '/login?created=true&lang=cy');

      expect(res.body).to.deep.equal({});
    });

    it('re-renders with backend string error', async () => {
      stubClient.get.resolves({ data: { csrfToken: 'tok3' } });
      stubClient.post.rejects({ response: { data: 'user exists' } });

      const res = await request(mkApp())
        .post('/register')
        .send({
          username: 'u',
          email: 'u@e.com',
          'date-of-birth-day': '1',
          'date-of-birth-month': '1',
          'date-of-birth-year': '2000',
          password: 'StrongP@ss1',
          confirmPassword: 'StrongP@ss1',
        })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body).to.deep.equal({
        view: 'register',
        options: {
          lang: 'en',
          fieldErrors: { general: 'user exists' },
          username: 'u',
          email: 'u@e.com',
          day: '1',
          month: '1',
          year: '2000',
        },
      });
    });

    it('re-renders with fallback on non-string backend error', async () => {
      stubClient.get.resolves({ data: { csrfToken: 'tok4' } });
      stubClient.post.rejects(new Error('oops'));

      const res = await request(mkApp())
        .post('/register')
        .send({
          username: 'u',
          email: 'u@e.com',
          'date-of-birth-day': '1',
          'date-of-birth-month': '1',
          'date-of-birth-year': '2000',
          password: 'StrongP@ss1',
          confirmPassword: 'StrongP@ss1',
        })
        .expect(200)
        .expect('Content-Type', /json/);

      expect(res.body).to.deep.equal({
        view: 'register',
        options: {
          lang: 'en',
          fieldErrors: { general: 'registerError' },
          username: 'u',
          email: 'u@e.com',
          day: '1',
          month: '1',
          year: '2000',
        },
      });
    });
  });
});
