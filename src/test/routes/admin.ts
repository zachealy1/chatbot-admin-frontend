import * as authModule from '../../main/modules/auth';
import adminRoutes from '../../main/routes/admin';

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

    const res = await request(app)
      .get('/admin')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ view: 'admin' });
  });

  it('redirects to /login when not authenticated', async () => {
    // Stub authentication middleware to redirect
    sinon
      .stub(authModule, 'ensureAuthenticated')
      .callsFake((_req: Request, res: Response) => {
        res.redirect('/login');
      });

    const app: Application = express();
    adminRoutes(app);

    await request(app)
      .get('/admin')
      .expect(302)
      .expect('Location', '/login');
  });
});
