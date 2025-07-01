import { ensureAuthenticated } from '../modules/auth';

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const { Logger } = require('@hmcts/nodejs-logging');

const logger = Logger.getLogger('app');

export default function (app: Application): void {
  app.get('/manage-accounts', ensureAuthenticated, async (req, res) => {
    const storedSessionCookie =
      (req.user as any)?.springSessionCookie || (req.session as any)?.springSessionCookie || '';

    if (!storedSessionCookie) {
      return res.redirect('/login');
    }

    try {
      const jar = new CookieJar();
      jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');
      const client = wrapper(axios.create({ jar, withCredentials: true }));
      const backendRes = await client.get('http://localhost:4550/account/all');
      const accounts: any[] = backendRes.data;

      const pageSize = 6;
      const totalPages = Math.max(1, Math.ceil(accounts.length / pageSize));
      const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
      const currentPage = Math.min(Math.max(1, parseInt(req.query.page as string, 10) || 1), totalPages);

      // New flag:
      const hasAccounts = accounts.length > 0;

      res.render('manage-accounts', {
        deleted: req.query.deleted === 'true',
        pages,
        currentPage,
        hasAccounts, // ← pass it in
      });
    } catch (err) {
      logger.error('Error fetching managed accounts:', err);
      res.render('manage-accounts', {
        deleted: req.query.deleted === 'true',
        pages: [1],
        currentPage: 1,
        hasAccounts: false, // ← fallback
        error: 'Could not load accounts',
      });
    }
  });

  app.get('/account/all', ensureAuthenticated, async (req, res) => {
    // pull the session cookie you saved at login
    const storedSessionCookie =
      (req.user as any)?.springSessionCookie || (req.session as any)?.springSessionCookie || '';

    if (!storedSessionCookie) {
      logger.error('No Spring session cookie found on request');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      // seed a CookieJar with the login cookie
      const jar = new CookieJar();
      jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');

      // wrap axios so it uses that jar
      const client = wrapper(
        axios.create({
          jar,
          withCredentials: true,
        })
      );

      // fetch the list from Spring Boot
      const backendRes = await client.get('http://localhost:4550/account/all');
      // forward it directly
      return res.json(backendRes.data);
    } catch (err: any) {
      logger.error('Error fetching account list:', err);
      return res.status(500).json({ error: 'Failed to load accounts' });
    }
  });
}
