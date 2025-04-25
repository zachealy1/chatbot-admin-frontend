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

app.post('/account/update', (req, res) => {
  const { username, email, password, confirmPassword, 'date-of-birth-day': day, 'date-of-birth-month': month, 'date-of-birth-year': year } = req.body;

  // Validation Errors
  const errors: string[] = [];
  const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

  // Validate Username
  if (!username || username.trim() === '') {
    errors.push('Username is required.');
  }

  // Validate Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    errors.push('Enter a valid email address.');
  }

  // Validate Date of Birth
  const isValidDate = (dateOfBirthDay: string, dateOfBirthMonth: string, dateOfBirthYear: string): boolean => {
    const date = new Date(`${dateOfBirthYear}-${dateOfBirthMonth}-${dateOfBirthDay}`);
    return !isNaN(date.getTime()) && date < new Date();
  };

  if (!day || !month || !year || !isValidDate(day, month, year)) {
    errors.push('Enter a valid date of birth.');
  }

  // Validate Password if provided
  if (password) {
    if (!passwordCriteriaRegex.test(password)) {
      errors.push('Password must meet the criteria.');
    }

    // Confirm Password Match
    if (password !== confirmPassword) {
      errors.push('Passwords do not match.');
    }
  }

  // If there are validation errors, re-render the form with error messages
  if (errors.length > 0) {
    return res.render('account', {
      errors,
      username,
      email,
      day,
      month,
      year,
    });
  }

  // Simulate account update success
  console.log('Account updated successfully:', { username, email, day, month, year });
  res.redirect('/account?updated=true');
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

app.post('/requests/:requestId/accept', (req, res) => {
  const { requestId } = req.params;

  console.log(`Request accepted: ${requestId}`);

  res.redirect('/account-requests?accepted=true');
});

app.post('/requests/:requestId/reject', (req, res) => {
  const { requestId } = req.params;

  console.log(`Request rejected: ${requestId}`);

  res.redirect('/account-requests?rejected=true');
});

app.post('/accounts/:accountId/delete', (req, res) => {
  const { accountId } = req.params;

  console.log(`Account deleted: ${accountId}`);

  res.redirect('/manage-accounts?deleted=true');
});

app.post('/update-banner', (req, res) => {
  console.log('Banner updated successfully');
  res.redirect('/update-banner?updated=true');
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
app.get('/account-requests', ensureAuthenticated, (req, res) => {
  const { accepted, rejected } = req.query;

  res.render('account-requests', {
    accepted: accepted === 'true',
    rejected: rejected === 'true',
  });
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
app.get('/manage-accounts', ensureAuthenticated, (req, res) => {
  const { deleted } = req.query;

  res.render('manage-accounts', {
    deleted: deleted === 'true',
  });
});

// Add a route for /update-banner
app.get('/update-banner', ensureAuthenticated, (req, res) => {
  res.render('update-banner'); // Render the Nunjucks template for update-banner
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
