import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

const { Logger } = require('@hmcts/nodejs-logging');

const logger = Logger.getLogger('app');

export default function (app: Application): void {

  app.get('/login', function(req, res) {
    const { created, passwordReset } = req.query;

    res.render('login', {
      created: created === 'true', // Use 'created' to match the template
      passwordReset: passwordReset === 'true',
    });
  });

  app.get('/logout', (req, res) => {
    req.logout(err => {
      if (err) {
        return res.status(500).send('Failed to logout');
      }
      req.session.destroy(() => {
        res.redirect('/login');
      });
    });
  });

  app.post('/login', async (req, res, next) => {
    const { username, password } = req.body;
    // Pick up the lang cookie (defaults to 'en')
    const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

    // Create a cookie‐jar and seed it with our lang cookie
    const jar = new CookieJar();
    jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');

    // Wrap axios so it uses our jar AND auto‐handles XSRF from Spring
    const client = wrapper(axios.create({
      baseURL: 'http://localhost:4550',
      jar,
      withCredentials: true,
      xsrfCookieName: 'XSRF-TOKEN',
      xsrfHeaderName: 'X-XSRF-TOKEN'
    }));

    try {
      // Fetch CSRF token
      const csrfResponse = await client.get('/csrf');
      const csrfToken = csrfResponse.data.csrfToken;

      // Perform login
      const loginResponse = await client.post(
        '/login/admin',
        { username, password },
        { headers: { 'X-XSRF-TOKEN': csrfToken } }
      );

      // Persist Spring’s session cookie & CSRF token in our Express session
      const setCookieHeader = loginResponse.headers['set-cookie'];
      const loginCookie = Array.isArray(setCookieHeader)
        ? setCookieHeader.join('; ')
        : setCookieHeader;
      (req.session as any).springSessionCookie = loginCookie;
      (req.session as any).csrfToken = csrfToken;

      // Save and complete passport login
      req.session.save(err => {
        if (err) {
          logger.error('Error saving session:', err);
          return res.render('login', {
            error: req.__('loginSessionError'),
            username
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-shadow
        req.login({ username, springSessionCookie: loginCookie, csrfToken }, err => {
          if (err) {
            logger.error('Passport login error:', err);
            return next(err);
          }
          return res.redirect('/admin');
        });
      });

    } catch (err: any) {
      logger.error('Full login error:', err.response || err.message);

      // If Spring returned a text message, use it; otherwise fall back to our i18n key
      const backendMsg = typeof err.response?.data === 'string'
        ? err.response.data
        : null;
      const errorMessage = backendMsg || req.__('loginInvalidCredentials');

      return res.render('login', {
        error: errorMessage,
        username
      });
    }
  });
}
