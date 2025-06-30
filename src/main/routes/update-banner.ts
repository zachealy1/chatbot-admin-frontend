import { ensureAuthenticated } from '../modules/auth';

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const { Logger } = require('@hmcts/nodejs-logging');

const logger = Logger.getLogger('app');

export default function (app: Application): void {

  app.get('/update-banner', ensureAuthenticated, async (req, res) => {
    // 1. Grab the stored Spring session cookie so we can auth against the backend
    const storedSessionCookie =
      (req.user as any)?.springSessionCookie ||
      (req.session as any)?.springSessionCookie ||
      '';

    if (!storedSessionCookie) {
      logger.error('No Spring session cookie in Express session');
      return res.redirect('/login');
    }

    try {
      // 2. Create a cookie jar, seed it with the login cookie, and wrap axios
      const jar = new CookieJar();
      jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');

      const client = wrapper(
        axios.create({
          jar,
          withCredentials: true,
        })
      );

      // 3. Fetch the banner from your backend
      const bannerResponse = await client.get<{
        id: number;
        title: string;
        content: string;
      }>('http://localhost:4550/support-banner/1');

      const { title, content } = bannerResponse.data;

      // 4. Render the page, passing in bannerTitle, bannerBody, and the updated flag
      res.render('update-banner', {
        bannerTitle: title,
        bannerBody:  content,
        updated:     req.query.updated === 'true',
      });

    } catch (err) {
      logger.error('Failed to load banner for edit:', err);
      // On error, still render the page with defaults and an error message
      res.render('update-banner', {
        bannerTitle: 'Contact Support Team',
        bannerBody:  "If you need assistance, please call us at <strong>0800 123 456</strong> or email <a href='mailto:support@example.com'>support@example.com</a>.",
        updated:     false,
        error:       'Could not load banner — please try again.',
      });
    }
  });

  app.post('/update-banner', async (req, res) => {
    const { bannerTitle, bannerBody } = req.body;

    // Pull your stored Spring Boot session cookie out of the Express session
    const storedSessionCookie =
      (req.user as any)?.springSessionCookie ||
      (req.session as any)?.springSessionCookie ||
      '';

    if (!storedSessionCookie) {
      logger.error('No Spring session cookie in Express session');
      return res.redirect('/login');
    }

    try {
      // Create jar and *set* that cookie for your backend’s host
      const jar = new CookieJar();
      jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');

      const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      }));

      // Now GET /csrf (will use your session cookie) and PUT
      const csrfResponse = await client.get('http://localhost:4550/csrf');
      const csrfToken = csrfResponse.data.csrfToken;

      await client.put(
        'http://localhost:4550/support-banner/1',
        { title: bannerTitle, content: bannerBody },
        { headers: { 'X-XSRF-TOKEN': csrfToken } }
      );

      logger.log('Banner updated successfully');
      return res.redirect('/update-banner?updated=true');

    } catch (err: any) {
      logger.error('Error updating banner:', err);
      return res.render('update-banner', {
        error: 'Could not save banner—please try again.',
        bannerTitle,
        bannerBody,
      });
    }
  });
}
