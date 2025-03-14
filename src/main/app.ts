import * as path from 'path';

import { HTTPError } from './HttpError';
import { AppInsights } from './modules/appinsights';
import { Helmet } from './modules/helmet';
import { Nunjucks } from './modules/nunjucks';
import { PropertiesVolume } from './modules/properties-volume';

import * as bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import express from 'express';
import session from 'express-session';
import { glob } from 'glob';
import passport from 'passport';
import favicon from 'serve-favicon';

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

app.post('/forgot-password/enter-email', (req, res) => {
  const email = req.body.email; // Retrieve the email from the form submission

  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !emailRegex.test(email)) {
    // If no email or invalid email is provided, re-render the form with an error message
    return res.render('forgot-password', {
      errors: [
        {
          text: 'Please enter a valid email address.',
          href: '#email',
        },
      ],
    });
  }

  // Simulate email sending logic (replace with your actual logic)
  console.log(`Sending password reset email to: ${email}`);

  // Redirect to the next step (e.g., a page to enter the code)
  res.redirect('/forgot-password/verify-otp/');
});

app.post('/register', (req, res) => {
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

  // Validate Password
  if (!password || !passwordCriteriaRegex.test(password)) {
    errors.push('Password must meet the criteria.');
  }

  // Confirm Password Match
  if (password !== confirmPassword) {
    errors.push('Passwords do not match.');
  }

  // If there are validation errors, re-render the form with error messages
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

  // Simulate registration success
  console.log('User registered successfully:', { username, email });
  res.redirect('/login?created=true');
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

app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err: never, user: Express.User) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.render('login', {
        error: 'Invalid username or password.',
        username: req.body.username,
      });
    }
    req.logIn(user, loginErr => {
      if (loginErr) {
        return next(loginErr);
      }
      return res.redirect('/admin');
    });
  })(req, res, next);
});

app.post('/forgot-password/verify-otp', (req, res) => {
  const { oneTimePassword } = req.body;
  const expectedOTP = '123456'; // Replace with your actual logic

  if (!oneTimePassword || oneTimePassword !== expectedOTP) {
    return res.render('verify-otp', {
      error: 'The one-time password you entered is incorrect. Please try again.',
    });
  }

  res.redirect('/forgot-password/reset-password');
});

app.post('/forgot-password/reset-password', (req, res) => {
  const { password, confirmPassword } = req.body;

  // Validate that both passwords match
  if (password !== confirmPassword) {
    return res.render('reset-password', {
      error: 'Passwords do not match.',
    });
  }

  // Validate password criteria
  const passwordCriteriaRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordCriteriaRegex.test(password)) {
    return res.render('reset-password', {
      error: 'Your password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character.',
    });
  }

  // Simulate updating the password
  console.log('Password reset successfully for user.');

  // Redirect to success page
  res.redirect('/login?passwordReset=true');
});

app.post('/forgot-password/resend-otp', (req, res) => {
  console.log('Resending OTP...');
  res.redirect('/forgot-password/verify-otp?sent=true');
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

app.get('/account', (req, res) => {
  const { updated } = req.query;

  // Render the 'account' template and pass the 'updated' flag
  res.render('account', {
    updated: updated === 'true',
    // Include other necessary data here
  });
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
