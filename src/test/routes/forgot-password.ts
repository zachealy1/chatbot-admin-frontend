import forgotRoutes from '../../main/routes/forgot-password';

import { expect } from 'chai';
import express, { Application } from 'express';
import sinon from 'sinon';
import request from 'supertest';

describe('GET /forgot-password', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('renders the forgot-password view', async () => {
    const app: Application = express();

    // override res.render to JSON
    app.use((req, res, next) => {
      res.render = (view: string, opts?: any) => res.json({ view, options: opts });
      next();
    });

    forgotRoutes(app);

    const res = await request(app)
      .get('/forgot-password')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(res.body).to.deep.equal({ view: 'forgot-password' });
  });
});
