import * as path from 'path';

import { HTTPError } from './HttpError';
import { AppInsights } from './modules/appinsights';
import { Helmet } from './modules/helmet';
import { Nunjucks } from './modules/nunjucks';
import { PropertiesVolume } from './modules/properties-volume';

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import * as bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import session from 'express-session';
import { glob } from 'glob';
import passport from 'passport';
import favicon from 'serve-favicon';
import { CookieJar } from 'tough-cookie';


require('../../config/passport');

const { setupDev } = require('./development');

const { Logger } = require('@hmcts/nodejs-logging');

const env = process.env.NODE_ENV || 'development';
const developmentMode = env === 'development';

export const app = express();
app.locals.ENV = env;

const logger = Logger.getLogger('app');

new PropertiesVolume().enableFor(app);
new AppInsights().enable();
new Nunjucks(developmentMode).enableFor(app);
// secure the application by adding various HTTP headers to its responses
new Helmet(developmentMode).enableFor(app);

app.use(favicon(path.join(__dirname, '/public/assets/images/favicon.ico')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, max-age=0, must-revalidate, no-store');
  next();
});

app.use(
  session({
    secret: 'yourSecretKeyHere',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

function ensureAuthenticated(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (req.isAuthenticated()) {
    return next(); // Proceed to the route
  }
  res.redirect('/login'); // Redirect to login if not authenticated
}

app.post('/register', async (req, res) => {
  const {
    username,
    email,
    password,
    confirmPassword,
    'date-of-birth-day': day,
    'date-of-birth-month': month,
    'date-of-birth-year': year,
  } = req.body;

  const errors: string[] = [];

  // Regex to enforce a strong password.
  const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  // Validate Username.
  if (!username || username.trim() === '') {
    errors.push('Username is required.');
  }

  // Validate Email.
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.push('Enter a valid email address.');
  }

  // Helper function to validate date of birth.
  const isValidDate = (dobDay: string, dobMonth: string, dobYear: string): boolean => {
    const dateStr = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && date < new Date();
  };

  if (!day || !month || !year || !isValidDate(day, month, year)) {
    errors.push('Enter a valid date of birth.');
  }

  // Validate Password.
  if (!password || !passwordCriteriaRegex.test(password)) {
    errors.push('Password must meet the criteria.');
  }

  // Check if the passwords match.
  if (password !== confirmPassword) {
    errors.push('Passwords do not match.');
  }

  // If there are validation errors, re-render the registration page with error messages.
  if (errors.length > 0) {
    return res.render('register', {
      errors,
      username,
      email,
      day,
      month,
      year,
    });
  }

  // Convert day, month, and year into the expected "YYYY-MM-DD" format.
  const dateOfBirth = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

  try {
    // Create a cookie jar and an axios client that supports cookies.
    const jar = new CookieJar();
    const client = wrapper(axios.create({
      jar,
      withCredentials: true,
      xsrfCookieName: 'XSRF-TOKEN',
      xsrfHeaderName: 'X-XSRF-TOKEN',
    }));

    // Request the CSRF token from the backend.
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('Retrieved CSRF token:', csrfToken);

    // Send the registration POST request using the response body token.
    const response = await client.post('http://localhost:4550/account/register/admin', {
      username,
      email,
      password,
      confirmPassword,
      dateOfBirth,
    }, {
      headers: {
        'X-XSRF-TOKEN': csrfToken,
      }
    });

    console.log('User registered successfully in backend:', response.data);
    res.redirect('/login?created=true');
  } catch (error) {
    console.error('Error during backend registration:', error);
    errors.push('An error occurred during registration. Please try again later.');
    return res.render('register', {
      errors,
      username,
      email,
      day,
      month,
      year,
    });
  }
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

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', function(req, res) {
  const { created, passwordReset } = req.query;

  res.render('login', {
    created: created === 'true', // Use 'created' to match the template
    passwordReset: passwordReset === 'true',
  });
});

app.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // Retrieve the CSRF token from the Spring Boot backend.
    const csrfResponse = await axios.get('http://localhost:4550/csrf', { withCredentials: true });
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('Retrieved CSRF token:', csrfToken);

    // Capture the cookie from the /csrf response.
    const csrfCookieHeader = csrfResponse.headers['set-cookie'];
    const csrfCookie = Array.isArray(csrfCookieHeader)
      ? csrfCookieHeader.join('; ')
      : csrfCookieHeader;
    console.log('Retrieved CSRF cookie:', csrfCookie);

    // Send the login request including the CSRF token and cookie.
    const loginResponse = await axios.post(
      'http://localhost:4550/login/admin',
      { username, password },
      {
        withCredentials: true,
        headers: {
          'X-XSRF-TOKEN': csrfToken,
          Cookie: csrfCookie,
        }
      }
    );

    console.log('Login response headers:', loginResponse.headers);
    const setCookieHeader = loginResponse.headers['set-cookie'];
    const loginCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.join('; ')
      : setCookieHeader;
    console.log('Login Set-Cookie header:', loginCookie);

    // Save both the Spring Boot session cookie and the CSRF token in the Express session.
    (req.session as any).springSessionCookie = loginCookie;
    (req.session as any).csrfToken = csrfToken;
    console.log('Stored springSessionCookie in session:', loginCookie);
    console.log('Stored csrfToken in session:', csrfToken);

    // Explicitly save the session.
    req.session.save((err: any) => {
      if (err) {
        console.error('Error saving session:', err);
      } else {
        console.log('Session saved successfully with springSessionCookie and csrfToken.');
      }
      req.login({ username, springSessionCookie: loginCookie, csrfToken }, err => {
        if (err) {
          return next(err);
        }
        return res.redirect('/admin');
      });
    });
  } catch (error: any) {
    console.error('Full login error:', error.response || error.message);
    const errorMessage = error.response?.data || 'Invalid username or password.';
    return res.render('login', { error: errorMessage, username: req.body.username });
  }
});

app.post('/forgot-password/enter-email', async (req, res) => {
  // Extract the email from the request body
  const { email } = req.body;
  console.log('[ForgotPassword] Received email:', email);

  // Basic local validation for the email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    console.log('[ForgotPassword] Invalid or missing email:', email);
    return res.render('forgot-password', {
      errors: ['Please enter a valid email address.'],
      email, // so the user doesn't lose what they typed
    });
  }

  try {
    // 1) Create a cookie jar & an axios client with CSRF config
    const jar = new CookieJar();
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // 2) Request the CSRF token from the backend
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('[ForgotPassword] Retrieved CSRF token:', csrfToken);

    // 3) Make the POST request to the Spring Boot route
    //    which requires CSRF & possibly does not require authentication
    const response = await client.post(
      'http://localhost:4550/forgot-password/enter-email',
      { email },
      {
        headers: {
          'X-XSRF-TOKEN': csrfToken,
        },
      }
    );

    console.log('[ForgotPassword] Forgot-password call succeeded:', response.data);

    // 4) Store the email in session so we can retrieve it when verifying OTP
    (req.session as any).email = email;

    // 5) If successful, redirect to the next step (e.g., OTP entry)
    return res.redirect('/forgot-password/verify-otp');
  } catch (error) {
    console.error('[ForgotPassword] Error during backend forgot-password:', error);

    // If the backend returned a specific error message, extract it
    let errorMsg = 'An error occurred during the forgot-password process. Please try again later.';
    if (error.response && error.response.data) {
      errorMsg = error.response.data;
    }

    // Re-render the forgot-password screen with an error
    return res.render('forgot-password', {
      errors: [errorMsg],
      email,
    });
  }
});

app.post('/forgot-password/reset-password', async (req, res) => {
  const { password, confirmPassword } = req.body;

  console.log('[ForgotPassword] Received new password & confirmPassword:', password, confirmPassword);

  if (password !== confirmPassword) {
    return res.render('reset-password', {
      error: 'Passwords do not match.',
    });
  }

  const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordCriteriaRegex.test(password)) {
    return res.render('reset-password', {
      error:
        'Your password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.',
    });
  }

  const email = (req.session as any).email;
  const otp = (req.session as any).verifiedOtp;

  if (!email || !otp) {
    console.log('[ForgotPassword] Missing email or otp in session.');
    return res.render('reset-password', {
      error: 'Cannot reset password without a valid email and OTP. Please start again.',
    });
  }

  try {
    const jar = new CookieJar();

    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    console.log('[ForgotPassword] Requesting CSRF token from /csrf...');
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('[ForgotPassword] Retrieved CSRF token for reset-password:', csrfToken);

    console.log('[ForgotPassword] Sending POST /forgot-password/reset-password to backend...');
    const response = await client.post(
      'http://localhost:4550/forgot-password/reset-password',
      {
        email,
        otp,
        password,
        confirmPassword
      },
      {
        headers: { 'X-XSRF-TOKEN': csrfToken },
      }
    );

    console.log('[ForgotPassword] Password reset call succeeded:', response.data);

    return res.redirect('/login?passwordReset=true');

  } catch (error) {
    console.error('[ForgotPassword] Error calling backend /forgot-password/reset-password:', error);

    let errorMsg = 'An error occurred while resetting your password. Please try again.';
    if (error.response && error.response.data) {
      errorMsg = error.response.data;
    }
    console.log('[ForgotPassword] Rendering reset-password with error:', errorMsg);

    return res.render('reset-password', {
      error: errorMsg,
    });
  }
});

app.post('/forgot-password/verify-otp', async (req, res) => {
  const { oneTimePassword } = req.body;
  const email = (req.session as any).email;

  console.log('[ForgotPassword] Received OTP:', oneTimePassword);
  console.log('[ForgotPassword] Using email from session:', email);

  // Validate that both are present
  if (!email) {
    return res.render('verify-otp', {
      error: 'No email found in session. Please request a password reset first.',
    });
  }
  if (!oneTimePassword || oneTimePassword.trim() === '') {
    return res.render('verify-otp', {
      error: 'Please enter the one-time password (OTP).',
    });
  }

  try {
    // 1) Create a cookie jar & axios client for CSRF
    const jar = new CookieJar();
    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN',
      })
    );

    // 2) Fetch CSRF token from Spring Boot
    console.log('[ForgotPassword] Requesting CSRF token for verify-otp...');
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('[ForgotPassword] Retrieved CSRF token:', csrfToken);

    // 3) POST /forgot-password/verify-otp to backend with { email, otp }
    //    The backend verifies the OTP
    await client.post(
      'http://localhost:4550/forgot-password/verify-otp',
      { email, otp: oneTimePassword },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 4) If backend call succeeded, store the verified OTP in session
    //    So we can prove that the user is allowed to reset the password.
    (req.session as any).verifiedOtp = oneTimePassword;
    console.log('[ForgotPassword] OTP verified. Storing in session:', (req.session as any).verifiedOtp);

    // 5) Redirect to /forgot-password/reset-password
    return res.redirect('/forgot-password/reset-password');

  } catch (error) {
    console.error('[ForgotPassword] Error calling backend /forgot-password/verify-otp:', error);

    let errorMessage = 'An error occurred while verifying the OTP. Please try again.';
    if (error.response && error.response.data) {
      errorMessage = error.response.data;  // e.g. "OTP incorrect", "OTP expired", etc.
    }

    return res.render('verify-otp', {
      error: errorMessage,
    });
  }
});

app.post('/forgot-password/resend-otp', async (req, res) => {
  console.log('[ForgotPassword] Resend OTP requested.');

  const email = (req.session as any).email;
  console.log('[ForgotPassword] Email from session:', email);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    console.log('[ForgotPassword] Invalid or missing email in session.');
    return res.render('verify-otp', {
      error: 'No valid email found. Please start the reset process again.',
    });
  }

  try {
    const jar = new CookieJar();

    const client = wrapper(
      axios.create({
        jar,
        withCredentials: true,
        xsrfCookieName: 'XSRF-TOKEN',
        xsrfHeaderName: 'X-XSRF-TOKEN'
      })
    );

    console.log('[ForgotPassword] Requesting CSRF token from /csrf...');
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;
    console.log('[ForgotPassword] Retrieved CSRF token for resend-otp:', csrfToken);

    const response = await client.post(
      'http://localhost:4550/forgot-password/resend-otp',
      { email },
      {
        headers: {
          'X-XSRF-TOKEN': csrfToken,
        },
      }
    );
    console.log('[ForgotPassword] Resend-OTP call succeeded:', response.data);

    return res.redirect('/forgot-password/verify-otp');

  } catch (error) {
    console.error('[ForgotPassword] Error calling backend /forgot-password/resend-otp:', error);

    let errorMsg = 'An error occurred while resending the OTP. Please try again.';
    if (error.response && error.response.data) {
      errorMsg = error.response.data;
    }
    console.log('[ForgotPassword] Rendering verify-otp with error:', errorMsg);

    return res.render('verify-otp', {
      error: errorMsg,
    });
  }
});

app.get('/requests/pending', ensureAuthenticated, async (req, res) => {
  // 1) pull your stored Spring session cookie
  const storedSessionCookie =
    (req.user as any)?.springSessionCookie ||
    (req.session as any)?.springSessionCookie ||
    '';

  if (!storedSessionCookie) {
    console.error('No Spring session cookie found on request');
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
    console.error('Error fetching pending requests:', err);
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
    console.error('No Spring session cookie found');
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

    console.log(`Request accepted: ${requestId}`);
    return res.redirect('/account-requests?accepted=true');

  } catch (err: any) {
    console.error('Error approving request:', err);
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
    console.error('No Spring session cookie found');
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

    console.log(`Request rejected: ${requestId}`);
    return res.redirect('/account-requests?rejected=true');

  } catch (err: any) {
    console.error('Error rejecting request:', err);
    return res.status(500).render('account-requests', {
      accepted: false,
      rejected: false,
      error: 'Failed to reject request'
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
    console.error('No Spring session cookie found');
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

    console.log(`Account deleted: ${accountId}`);
    return res.redirect('/manage-accounts?deleted=true');

  } catch (err: any) {
    console.error('Error deleting account:', err);
    // Optionally re-render with an error message instead of redirect
    return res.status(500).render('manage-accounts', {
      deleted: false,
      error: 'Failed to delete account. Please try again.',
      // you might also want to pass pages/currentPage here
    });
  }
});

app.post('/update-banner', async (req, res) => {
  const { bannerTitle, bannerBody } = req.body;

  // 1) Pull your stored Spring Boot session cookie out of the Express session
  const storedSessionCookie =
    (req.user as any)?.springSessionCookie ||
    (req.session as any)?.springSessionCookie ||
    '';

  if (!storedSessionCookie) {
    console.error('No Spring session cookie in Express session');
    return res.redirect('/login');
  }

  try {
    // 2) Create jar and *set* that cookie for your backend’s host
    const jar = new CookieJar();
    jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');

    const client = wrapper(axios.create({
      jar,
      withCredentials: true,
      xsrfCookieName: 'XSRF-TOKEN',
      xsrfHeaderName: 'X-XSRF-TOKEN',
    }));

    // 3) Now GET /csrf (will use your session cookie) and PUT
    const csrfResponse = await client.get('http://localhost:4550/csrf');
    const csrfToken = csrfResponse.data.csrfToken;

    await client.put(
      'http://localhost:4550/support-banner/1',
      { title: bannerTitle, content: bannerBody },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    console.log('Banner updated successfully');
    return res.redirect('/update-banner?updated=true');

  } catch (err: any) {
    console.error('Error updating banner:', err);
    return res.render('update-banner', {
      error: 'Could not save banner—please try again.',
      bannerTitle,
      bannerBody,
    });
  }
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

app.get('/forgot-password', (req, res) => {
  res.render('forgot-password');
});

app.get('/forgot-password/verify-otp', function(req, res) {
  const { sent } = req.query;

  res.render('verify-otp', {
    sent: sent === 'true',
  });
});

app.get('/forgot-password/reset-password', (req, res) => {
  res.render('reset-password');
});

// Add a route for /register
app.get('/register', (req, res) => {
  res.render('register'); // Render the Nunjucks template for register
});

// Add a route for /admin
app.get('/admin', ensureAuthenticated, (req, res) => {
  res.render('admin'); // Render the Nunjucks template for admin
});

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
    console.error('Error loading account requests:', err);
    res.render('account-requests', {
      accepted:    req.query.accepted === 'true',
      rejected:    req.query.rejected === 'true',
      pages:       [1],
      currentPage: 1,
      error:       'Could not load requests'
    });
  }
});

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

// Add a route for /manage-accounts
app.get('/manage-accounts', ensureAuthenticated, async (req, res) => {
  const storedSessionCookie =
    (req.user as any)?.springSessionCookie ||
    (req.session as any)?.springSessionCookie ||
    '';

  if (!storedSessionCookie) {
    return res.redirect('/login');
  }

  try {
    const jar = new CookieJar();
    jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');
    const client = wrapper(axios.create({ jar, withCredentials: true }));
    const backendRes = await client.get('http://localhost:4550/account/all');
    const accounts: any[] = backendRes.data;

    const pageSize    = 6;
    const totalPages  = Math.max(1, Math.ceil(accounts.length / pageSize));
    const pages       = Array.from({ length: totalPages }, (_, i) => i + 1);
    const currentPage = Math.min(
      Math.max(1, parseInt(req.query.page as string, 10) || 1),
      totalPages
    );

    // New flag:
    const hasAccounts = accounts.length > 0;

    res.render('manage-accounts', {
      deleted:      req.query.deleted === 'true',
      pages,
      currentPage,
      hasAccounts,   // ← pass it in
    });

  } catch (err) {
    console.error('Error fetching managed accounts:', err);
    res.render('manage-accounts', {
      deleted:      req.query.deleted === 'true',
      pages:        [1],
      currentPage:  1,
      hasAccounts:  false,            // ← fallback
      error:        'Could not load accounts'
    });
  }
});


app.get('/account/all', ensureAuthenticated, async (req, res) => {
  // pull the session cookie you saved at login
  const storedSessionCookie =
    (req.user as any)?.springSessionCookie ||
    (req.session as any)?.springSessionCookie ||
    '';

  if (!storedSessionCookie) {
    console.error('No Spring session cookie found on request');
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
    console.error('Error fetching account list:', err);
    return res.status(500).json({ error: 'Failed to load accounts' });
  }
});

app.get('/update-banner', ensureAuthenticated, async (req, res) => {
  // 1. Grab the stored Spring session cookie so we can auth against the backend
  const storedSessionCookie =
    (req.user as any)?.springSessionCookie ||
    (req.session as any)?.springSessionCookie ||
    '';

  if (!storedSessionCookie) {
    console.error('No Spring session cookie in Express session');
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
    console.error('Failed to load banner for edit:', err);
    // On error, still render the page with defaults and an error message
    res.render('update-banner', {
      bannerTitle: 'Contact Support Team',
      bannerBody:  "If you need assistance, please call us at <strong>0800 123 456</strong> or email <a href='mailto:support@example.com'>support@example.com</a>.",
      updated:     false,
      error:       'Could not load banner — please try again.',
    });
  }
});

app.get('/popular-chat-categories', ensureAuthenticated, async (req, res) => {
  // Pull Spring session cookie from Express session/user
  const storedSessionCookie =
    (req.user as any)?.springSessionCookie ||
    (req.session as any)?.springSessionCookie ||
    '';

  if (!storedSessionCookie) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const jar = new CookieJar();
    jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');
    const client = wrapper(axios.create({ jar, withCredentials: true }));

    // Fetch the stats
    const backendRes = await client.get('http://localhost:4550/statistics/popular-chat-categories');
    return res.json(backendRes.data);

  } catch (err: any) {
    console.error('Error fetching popular chat categories:', err);
    return res.status(500).json({ error: 'Failed to load chat categories' });
  }
});

glob
  .sync(__dirname + '/routes/**/*.+(ts|js)')
  .map(filename => require(filename))
  .forEach(routeModule => routeModule.default(app));

setupDev(app, developmentMode);
// returning "not found" page for requests with paths not resolved by the router
app.use((req, res) => {
  res.status(404);
  res.render('not-found');
});

// error handler
app.use((err: HTTPError, req: express.Request, res: express.Response) => {
  logger.error(`${err.stack || err}`);

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = developmentMode ? err : {};
  res.status(err.status || 500);
  res.render('error');
});
