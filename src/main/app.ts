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

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', function(req, res) {
  res.render('login');
});

app.post('/login/password', (req, res, next) => {
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

// Add a route for /forgot-password
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password'); // Render the Nunjucks template for forgot password
});

// Add a route for /enter-code
app.get('/enter-code', (req, res) => {
  res.render('enter-code'); // Render the Nunjucks template for enter code
});

// Add a route for /reset-password
app.get('/reset-password', (req, res) => {
  res.render('reset-password'); // Render the Nunjucks template for reset password
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
  res.render('account-requests'); // Render the Nunjucks template for account-requests
});

// Add a route for /account
app.get('/account', ensureAuthenticated, (req, res) => {
  res.render('account'); // Render the Nunjucks template for account
});

// Add a route for /account/update
app.get('/account/update', ensureAuthenticated, (req, res) => {
  res.render('update'); // Render the Nunjucks template for update
});

// Add a route for /manage-accounts
app.get('/manage-accounts', ensureAuthenticated, (req, res) => {
  res.render('manage-accounts'); // Render the Nunjucks template for manage-accounts
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
