const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const sourcePath = path.resolve(__dirname, 'src/main/assets/js');
const govukFrontend = require(path.resolve(__dirname, 'webpack/govukFrontend'));
const scss = require(path.resolve(__dirname, 'webpack/scss'));
const HtmlWebpack = require(path.resolve(__dirname, 'webpack/htmlWebpack'));

const govukMacrosPath = path.dirname(
  require.resolve('govuk-frontend/dist/govuk/macros/attributes.njk')
);

const devMode = process.env.NODE_ENV !== 'production';
const fileNameSuffix = devMode ? '-dev' : '.[contenthash]';
const filename = `[name]${fileNameSuffix}.js`;

module.exports = {
  plugins: [
    ...govukFrontend.plugins,
    ...scss.plugins,
    ...HtmlWebpack.plugins,
    new CopyWebpackPlugin({
      patterns: [
        {
          from: govukMacrosPath,
          to: path.resolve(__dirname, 'src/main/views/govuk/macros'),
        },
      ],
    }),
  ],
  entry: {
    main: path.resolve(sourcePath, 'index.ts'),
    showPassword: path.resolve(sourcePath, 'show-password.ts'),
    passwordValidationRegister: path.resolve(sourcePath, 'password-validation-register.ts'),
    passwordValidationAccount: path.resolve(sourcePath, 'password-validation-account.ts'),
    dateOfBirthValidation: path.resolve(sourcePath, 'date-of-birth-validation.ts'),
    emailValidation: path.resolve(sourcePath, 'email-validation.ts'),
    listPage: path.resolve(sourcePath, 'list-page.ts'),
    requestPage: path.resolve(sourcePath, 'requests-page.ts'),
    managePage: path.resolve(sourcePath, 'manage-page.ts'),
  },
  mode: devMode ? 'development' : 'production',
  devtool: devMode ? 'inline-source-map' : false,
  module: {
    rules: [
      ...scss.rules,
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    path: path.resolve(__dirname, 'src/main/public/'),
    publicPath: '',
    filename,
  },
};
