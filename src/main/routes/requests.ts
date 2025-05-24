import { ensureAuthenticated } from '../modules/auth';

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const { Logger } = require('@hmcts/nodejs-logging');

const logger = Logger.getLogger('app');

export default function (app: Application): void {
  app.get('/requests/pending', ensureAuthenticated, async (req, res) => {
    // 1) pull your stored Spring session cookie
    const storedSessionCookie =
      (req.user as any)?.springSessionCookie ||
      (req.session as any)?.springSessionCookie ||
      '';

    if (!storedSessionCookie) {
      logger.error('No Spring session cookie found on request');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      // 2) seed a CookieJar with that cookie
      const jar = new CookieJar();
      jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');

      // 3) wrap axios so it uses the jar & sends cookies
      const client = wrapper(axios.create({
        jar,
        withCredentials: true,
      }));

      // 4) fetch pending requests from the backend
      const backendRes = await client.get('http://localhost:4550/account/pending');
      // 5) forward the JSON arrays
      return res.json(backendRes.data);

    } catch (err: any) {
      logger.error('Error fetching pending requests:', err);
      return res.status(500).json({ error: 'Failed to load pending requests' });
    }
  });

// Accept account request
  app.post('/requests/:requestId/accept', ensureAuthenticated, async (req, res) => {
    const { requestId } = req.params;

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
      // 2) seed a CookieJar with that cookie
      const jar = new CookieJar();
      jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');

      // 3) wrap axios so it sends cookies and supports XSRF
      const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      }));

      // 4) fetch CSRF token
      const csrfRes = await client.get('http://localhost:4550/csrf');
      const csrfToken = csrfRes.data.csrfToken;

      // 5) call backend approve endpoint
      await client.post(
        `http://localhost:4550/account/approve/${requestId}`,
        {}, // no body
        { headers: { 'X-XSRF-TOKEN': csrfToken } }
      );

      logger.log(`Request accepted: ${requestId}`);
      return res.redirect('/account-requests?accepted=true');

    } catch (err: any) {
      logger.error('Error approving request:', err);
      return res.status(500).render('account-requests', {
        accepted: false,
        rejected: false,
        error: 'Failed to accept request'
      });
    }
  });

// Reject account request
  app.post('/requests/:requestId/reject', ensureAuthenticated, async (req, res) => {
    const { requestId } = req.params;

    const storedSessionCookie =
      (req.user as any)?.springSessionCookie ||
      (req.session as any)?.springSessionCookie ||
      '';

    if (!storedSessionCookie) {
      logger.error('No Spring session cookie found');
      return res.status(401).send('Not authenticated');
    }

    try {
      const jar = new CookieJar();
      jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');

      const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      }));

      const csrfRes = await client.get('http://localhost:4550/csrf');
      const csrfToken = csrfRes.data.csrfToken;

      await client.post(
        `http://localhost:4550/account/reject/${requestId}`,
        {},
        { headers: { 'X-XSRF-TOKEN': csrfToken } }
      );

      logger.log(`Request rejected: ${requestId}`);
      return res.redirect('/account-requests?rejected=true');

    } catch (err: any) {
      logger.error('Error rejecting request:', err);
      return res.status(500).render('account-requests', {
        accepted: false,
        rejected: false,
        error: 'Failed to reject request'
      });
    }
  });
}
