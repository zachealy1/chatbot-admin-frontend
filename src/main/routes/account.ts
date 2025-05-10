import { ensureAuthenticated } from '../modules/auth';

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

export default function (app: Application): void {

  app.get('/account',  ensureAuthenticated, async (req, res) => {
    try {
      const storedCookie =
        (req.user as any)?.springSessionCookie ||
        (req.session as any)?.springSessionCookie ||
        '';
      if (!storedCookie) {
        throw new Error('No Spring Boot session cookie found.');
      }

      // Create a cookie jar and set the stored Spring Boot cookie.
      const jar = new CookieJar();
      jar.setCookieSync(storedCookie, 'http://localhost:4550');

      // Create an axios instance with cookie jar support.
      const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      }));

      // Make parallel requests to your Spring Boot backend endpoints.
      const [usernameRes, emailRes, dayRes, monthRes, yearRes] = await Promise.all([
        client.get('http://localhost:4550/account/username'),
        client.get('http://localhost:4550/account/email'),
        client.get('http://localhost:4550/account/date-of-birth/day'),
        client.get('http://localhost:4550/account/date-of-birth/month'),
        client.get('http://localhost:4550/account/date-of-birth/year')
      ]);

      const context = {
        username: usernameRes.data,
        email: emailRes.data,
        day: dayRes.data,
        month: monthRes.data,
        year: yearRes.data,
        updated: req.query.updated === 'true',
        errors: null
      };

      // Disable caching so that the page reloads fresh each time.
      res.set('Cache-Control', 'no-store');
      res.render('account', context);
    } catch (error) {
      console.error('Error retrieving account details:', error);
      res.render('account', {
        errors: ['Error retrieving account details.'],
        updated: req.query.updated === 'true'
      });
    }
  });

// Add a route for /account/update
  app.get('/account/update', ensureAuthenticated, (req, res) => {
    res.render('update'); // Render the Nunjucks template for update
  });

  app.post('/account/update', async (req, res) => {
    const {
      username,
      email,
      password,
      confirmPassword,
      'date-of-birth-day': day,
      'date-of-birth-month': month,
      'date-of-birth-year': year,
    } = req.body;

    const dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const payload = { email, username, dateOfBirth, password, confirmPassword };

    // Retrieve the stored Spring Boot session cookie from req.user or req.session.
    const storedCookie =
      (req.user as any)?.springSessionCookie ||
      (req.session as any)?.springSessionCookie ||
      '';

    if (!storedCookie) {
      return res.status(401).render('account', {
        errors: ['Session expired or invalid. Please log in again.'],
        username,
        email,
        day,
        month,
        year,
      });
    }

    try {
      // Create a cookie jar and add the stored session cookie.
      const jar = new CookieJar();
      jar.setCookieSync(storedCookie, 'http://localhost:4550');

      // Create an axios client with cookie jar support.
      const client = wrapper(axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      }));

      // Request the CSRF token from the backend.
      const csrfResponse = await client.get('http://localhost:4550/csrf');
      const csrfToken = csrfResponse.data.csrfToken;
      console.log('Retrieved CSRF token for update:', csrfToken);

      // Send the account update POST request with the CSRF token.
      await client.post('http://localhost:4550/account/update', payload, {
        headers: {
          'X-XSRF-TOKEN': csrfToken,
        },
      });

      return res.redirect('/account?updated=true');
    } catch (error) {
      console.error('Error updating account in backend:', error);
      return res.render('account', {
        errors: ['An error occurred during account update. Please try again later.'],
        username,
        email,
        day,
        month,
        year,
      });
    }
  });
}
