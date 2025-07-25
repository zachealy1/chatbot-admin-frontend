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
import i18n from 'i18n';
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

i18n.configure({
  locales: ['en', 'cy'],
  directory: path.join(__dirname, 'locales'),
  defaultLocale: 'en',
  cookie: 'lang',
  queryParameter: 'lang',
});
app.use(i18n.init);

// only write the cookie when it really changes
app.use((req, res, next) => {
  // pick up from ?lang or existing cookie
  const requestedLang = (req.query.lang as string) || req.cookies.lang;

  // if it’s one of our supported locales, switch to it
  if (requestedLang && ['en', 'cy'].includes(requestedLang)) {
    // only re-set the cookie if it’s different
    if (req.cookies.lang !== requestedLang) {
      res.cookie('lang', requestedLang, {
        httpOnly: true,
        maxAge: 365 * 24 * 60 * 60 * 1000,
      });
    }
    req.setLocale(requestedLang);
    res.locals.lang = requestedLang;
  } else {
    // nothing in query or cookie-> fallback to defaultLocale
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
