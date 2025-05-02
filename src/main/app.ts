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
import i18n from 'i18n';
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

i18n.configure({
  locales:        ['en', 'cy'],
  directory:      path.join(__dirname, 'locales'),
  defaultLocale:  'en',
  cookie:         'lang',
  queryParameter: 'lang',
});
app.use(i18n.init);

// 3) only write the cookie when it really changes
app.use((req, res, next) => {
  // pick up from ?lang or existing cookie
  const requestedLang = (req.query.lang as string) || req.cookies.lang;

  // if it’s one of our supported locales, switch to it
  if (requestedLang && ['en', 'cy'].includes(requestedLang)) {
    // only re-set the cookie if it’s different
    if (req.cookies.lang !== requestedLang) {
      res.cookie('lang', requestedLang, {
        httpOnly: true,
        maxAge:   365 * 24 * 60 * 60 * 1000,
      });
    }
    req.setLocale(requestedLang);
    res.locals.lang = requestedLang;
  } else {
    // nothing in query or cookie→ fallback to defaultLocale
    req.setLocale(i18n.getLocale());
    res.locals.lang = i18n.getLocale();
  }

  // expose translation fn to Nunjucks
  res.locals.__ = req.__.bind(req);
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

  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

  // Server-side validation
  const fieldErrors: Record<string,string> = {};

  if (!username?.trim()) {
    fieldErrors.username = req.__('usernameRequired');
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = req.__('emailInvalid');
  }

  const dob = new Date(
    `${year}-${month?.padStart(2,'0')}-${day?.padStart(2,'0')}`
  );
  const isPast = (d: number | Date) => d instanceof Date && !isNaN(d.getTime()) && d < new Date();
  if (!day || !month || !year || !isPast(dob)) {
    fieldErrors.dateOfBirth = req.__('dobInvalid');
  }

  const strongPwd = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
  if (!password || !strongPwd.test(password)) {
    fieldErrors.password = req.__('passwordCriteria');
  }

  // === Confirm-password validation ===
  if (!confirmPassword) {
    fieldErrors.confirmPassword = req.__('confirmPasswordRequired');
  } else if (password !== confirmPassword) {
    fieldErrors.confirmPassword = req.__('passwordsMismatch');
  }

  // If any errors, re-render with inline errors only
  if (Object.keys(fieldErrors).length) {
    return res.render('register', {
      lang,
      fieldErrors,
      username,
      email,
      day,
      month,
      year,
    });
  }

  // 3) Prepare axios client with CSRF and lang cookie
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 4) Fetch CSRF token
    const { data: { csrfToken } } = await client.get('/csrf');

    // 5) Perform registration
    const dateOfBirth = dob.toISOString().slice(0,10);
    await client.post(
      '/account/register/admin',
      { username, email, password, confirmPassword, dateOfBirth },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 6) Redirect to login with success banner
    return res.redirect(`/login?created=true&lang=${lang}`);

  } catch (err: any) {
    console.error('Registration error:', err.response || err.message);

    // Extract backend message or fallback
    const backendMsg = typeof err.response?.data === 'string'
      ? err.response.data
      : null;
    fieldErrors.general = backendMsg || req.__('registerError');

    // Re-render with just fieldErrors (no summary)
    return res.render('register', {
      lang,
      fieldErrors,
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
  const { username, password } = req.body;
  // 1) Pick up the lang cookie (defaults to 'en')
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

  // 2) Create a cookie‐jar and seed it with our lang cookie
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');

  // 3) Wrap axios so it uses our jar AND auto‐handles XSRF from Spring
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 4) Fetch CSRF token
    const csrfResponse = await client.get('/csrf');
    const csrfToken = csrfResponse.data.csrfToken;

    // 5) Perform login
    const loginResponse = await client.post(
      '/login/admin',
      { username, password },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 6) Persist Spring’s session cookie & CSRF token in our Express session
    const setCookieHeader = loginResponse.headers['set-cookie'];
    const loginCookie = Array.isArray(setCookieHeader)
      ? setCookieHeader.join('; ')
      : setCookieHeader;
    (req.session as any).springSessionCookie = loginCookie;
    (req.session as any).csrfToken = csrfToken;

    // 7) Save and complete passport login
    req.session.save(err => {
      if (err) {
        console.error('Error saving session:', err);
        return res.render('login', {
          error: req.__('loginSessionError'),
          username
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-shadow
      req.login({ username, springSessionCookie: loginCookie, csrfToken }, err => {
        if (err) {
          console.error('Passport login error:', err);
          return next(err);
        }
        return res.redirect('/admin');
      });
    });

  } catch (err: any) {
    console.error('Full login error:', err.response || err.message);

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

app.post('/forgot-password/enter-email', async (req, res) => {
  const { email } = req.body;
  // 1) Pick up the lang cookie (defaults to 'en')
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

  // 2) Server-side validation
  const fieldErrors = {} as any;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    fieldErrors.email = req.__('emailInvalid');
  }

  if (Object.keys(fieldErrors).length) {
    // re-render with inline error
    return res.render('forgot-password', {
      lang,
      fieldErrors,
      email
    });
  }

  // 3) CSRF & axios client setup
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 4) Fetch CSRF token
    const { data: { csrfToken } } = await client.get('/csrf');

    // 5) Call backend forgot-password endpoint
    await client.post(
      '/forgot-password/enter-email',
      { email },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 6) Save email in session for OTP step
    (req.session as any).email = email;

    // 7) Redirect to OTP page
    return res.redirect('/forgot-password/verify-otp?lang=' + lang);

  } catch (err) {
    console.error('[ForgotPassword] Error:', err.response || err.message);

    // fallback general error
    fieldErrors.general = typeof err.response?.data === 'string'
      ? err.response.data
      : req.__('forgotPasswordError');

    return res.render('forgot-password', {
      lang,
      fieldErrors,
      email
    });
  }
});

app.post('/forgot-password/reset-password', async (req, res) => {
  const { password, confirmPassword } = req.body;
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';
  const email = (req.session as any).email;
  const otp   = (req.session as any).verifiedOtp;

  // 1) Server-side validation
  const fieldErrors: Record<string,string> = {};

  if (!password) {
    fieldErrors.password = req.__('passwordRequired');
  } else {
    const strongPwd = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
    if (!strongPwd.test(password)) {
      fieldErrors.password = req.__('passwordCriteria');
    }
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = req.__('confirmPasswordRequired');
  } else if (password !== confirmPassword) {
    fieldErrors.confirmPassword = req.__('passwordsMismatch');
  }

  if (!email || !otp) {
    fieldErrors.general = req.__('resetSessionMissing');
  }

  // If any errors, re-render with those errors
  if (Object.keys(fieldErrors).length) {
    return res.render('reset-password', {
      lang,
      fieldErrors,
      password,
      confirmPassword
    });
  }

  // 2) Prepare Axios + CSRF + lang cookie
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 3) Fetch CSRF token
    const { data: { csrfToken } } = await client.get('/csrf');

    // 4) Call backend to reset-password
    await client.post(
      '/forgot-password/reset-password',
      { email, otp, password, confirmPassword },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 5) On success, redirect to login with reset banner
    return res.redirect(`/login?passwordReset=true&lang=${lang}`);

  } catch (err: any) {
    console.error('[ForgotPassword] Reset error:', err.response || err.message);

    // backend error msg or fallback
    fieldErrors.general =
      typeof err.response?.data === 'string'
        ? err.response.data
        : req.__('resetError');

    return res.render('reset-password', {
      lang,
      fieldErrors,
      password,
      confirmPassword
    });
  }
});

app.post('/forgot-password/verify-otp', async (req, res) => {
  const { oneTimePassword } = req.body;
  const email = (req.session as any).email;
  const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';

  // 1) Server-side validation
  const fieldErrors: Record<string,string> = {};

  if (!email) {
    fieldErrors.general = req.__('noEmailInSession');
  }
  if (!oneTimePassword || !oneTimePassword.trim()) {
    fieldErrors.oneTimePassword = req.__('otpRequired');
  }

  // If any validation errors, re-render
  if (Object.keys(fieldErrors).length) {
    return res.render('verify-otp', {
      lang,
      sent: false,
      fieldErrors,
      oneTimePassword
    });
  }

  // 2) Prepare axios with CSRF & lang
  const jar = new CookieJar();
  jar.setCookieSync(`lang=${lang}`, 'http://localhost:4550');
  const client = wrapper(axios.create({
    baseURL: 'http://localhost:4550',
    jar,
    withCredentials: true,
    xsrfCookieName: 'XSRF-TOKEN',
    xsrfHeaderName: 'X-XSRF-TOKEN'
  }));

  try {
    // 3) Fetch CSRF token
    const { data: { csrfToken } } = await client.get('/csrf');

    // 4) Call backend verify-otp
    await client.post(
      '/forgot-password/verify-otp',
      { email, otp: oneTimePassword },
      { headers: { 'X-XSRF-TOKEN': csrfToken } }
    );

    // 5) Mark OTP as verified in session
    (req.session as any).verifiedOtp = oneTimePassword;

    // 6) Redirect to reset-password
    return res.redirect('/forgot-password/reset-password?lang=' + lang);

  } catch (err: any) {
    console.error('[ForgotPassword] OTP verify error:', err.response || err.message);

    // backend error (expired/invalid OTP)
    fieldErrors.general =
      typeof err.response?.data === 'string'
        ? err.response.data
        : req.__('otpVerifyError');

    return res.render('verify-otp', {
      lang,
      sent: false,
      fieldErrors,
      oneTimePassword
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

app.get('/user-activity', ensureAuthenticated, async (req, res) => {
  // 1) Grab the Spring-session cookie that you stored on login
  const storedSessionCookie =
    (req.user as any)?.springSessionCookie ||
    (req.session as any)?.springSessionCookie ||
    '';

  if (!storedSessionCookie) {
    console.error('No Spring session cookie found');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // 2) Seed a CookieJar with that cookie
    const jar = new CookieJar();
    jar.setCookieSync(storedSessionCookie, 'http://localhost:4550');

    // 3) Wrap axios to send credentials & cookies
    const client = wrapper(axios.create({
      jar,
      withCredentials: true,
    }));

    // 4) Call your backend /user-activity
    const backendRes = await client.get('http://localhost:4550/statistics/user-activity');

    // 5) Forward the JSON payload directly
    return res.json(backendRes.data);

  } catch (err: any) {
    console.error('Error fetching user activity:', err);
    return res.status(500).json({ error: 'Failed to load user activity' });
  }
});

app.get('/chat-category-breakdown', ensureAuthenticated, async (req, res) => {
    // 1) pull our Spring Boot session cookie from Express session or user
    const storedCookie =
      (req.user as any)?.springSessionCookie ||
      (req.session as any)?.springSessionCookie ||
      '';

    if (!storedCookie) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      // 2) create a tough-cookie jar containing that cookie
      const jar = new CookieJar();
      jar.setCookieSync(storedCookie, 'http://localhost:4550');

      // 3) wrap axios so it sends the cookie & XSRF token automatically
      const client = wrapper(
        axios.create({
          jar,
          withCredentials: true,
        })
      );

      // 4) call your Spring Boot statistics endpoint
      const backendRes = await client.get(
        'http://localhost:4550/statistics/chat-category-breakdown'
      );

      // 5) proxy the JSON back
      return res.json(backendRes.data);
    } catch (err: any) {
      console.error('Error fetching chat-category-breakdown:', err);
      return res.status(500).json({ error: 'Failed to fetch data' });
    }
  }
);

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
