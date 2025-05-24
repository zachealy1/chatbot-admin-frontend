import { ensureAuthenticated } from '../modules/auth';

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const { Logger } = require('@hmcts/nodejs-logging');

const logger = Logger.getLogger('app');

export default function (app: Application): void {

  // Add a route for /account-requests
  app.get('/account-requests', ensureAuthenticated, async (req, res) => {
    // grab your login cookie
    const storedSessionCookie =
      (req.user as any)?.springSessionCookie ||
      (req.session as any)?.springSessionCookie ||
      '';

    if (!storedSessionCookie) {
      return res.redirect('/login');
    }

    try {
      // fetch all pending requests
      const jar = new CookieJar();
      jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');
      const client = wrapper(axios.create({ jar, withCredentials: true }));
      const backendRes = await client.get('http://localhost:4550/account/pending');
      const allRequests: any[] = backendRes.data;

      // pagination params
      const PAGE_SIZE   = 6;
      const totalPages  = Math.ceil(allRequests.length / PAGE_SIZE) || 1;
      const pages       = Array.from({ length: totalPages }, (_, i) => i + 1);
      const currentPage = Math.min(Math.max(1, parseInt(req.query.page as string, 10) || 1), totalPages);

      const hasRequests = allRequests.length > 0;

      // render template
      res.render('account-requests', {
        accepted:    req.query.accepted === 'true',
        rejected:    req.query.rejected === 'true',
        pages,
        currentPage,
        hasRequests
      });

    } catch (err) {
      logger.error('Error loading account requests:', err);
      res.render('account-requests', {
        accepted:    req.query.accepted === 'true',
        rejected:    req.query.rejected === 'true',
        pages:       [1],
        currentPage: 1,
        error:       'Could not load requests'
      });
    }
  });

  app.post('/accounts/:accountId/delete', ensureAuthenticated, async (req, res) => {
    const { accountId } = req.params;

    // 1) pull your Spring session cookie
    const storedSessionCookie =
      (req.user as any)?.springSessionCookie ||
      (req.session as any)?.springSessionCookie ||
      '';

    if (!storedSessionCookie) {
      logger.error('No Spring session cookie found');
      return res.status(401).send('Not authenticated');
    }

    try {
      // 2) seed a new CookieJar with that cookie
      const jar = new CookieJar();
      jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');

      // 3) wrap axios so it uses the jar & sends cookies
      const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      }));

      // 4) fetch CSRF token (will set XSRF-TOKEN cookie in jar)
      const csrfRes = await client.get('http://localhost:4550/csrf');
      const csrfToken = csrfRes.data.csrfToken;

      // 5) call DELETE /account/{userId}
      await client.delete(
        `http://localhost:4550/account/${accountId}`,
        { headers: { 'X-XSRF-TOKEN': csrfToken } }
      );

      logger.log(`Account deleted: ${accountId}`);
      return res.redirect('/manage-accounts?deleted=true');

    } catch (err: any) {
      logger.error('Error deleting account:', err);
      // Optionally re-render with an error message instead of redirect
      return res.status(500).render('manage-accounts', {
        deleted: false,
        error: 'Failed to delete account. Please try again.',
        // you might also want to pass pages/currentPage here
      });
    }
  });
}
