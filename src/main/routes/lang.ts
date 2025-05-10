import { Application } from 'express';

export default function (app: Application): void {
  app.get('/i18n/buttons', (req, res) => {
    // pick up lang cookie (or default to 'en')
    const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';
    // Use i18n to translate
    const accept = req.__({ phrase: 'actionAccept', locale: lang });
    const reject = req.__({ phrase: 'actionReject',  locale: lang });
    res.json({ actionAccept: accept, actionReject: reject });
  });

  app.get('/i18n/actions', (req, res) => {
    const lang = req.cookies.lang === 'cy' ? 'cy' : 'en';
    const t = {
      actionAccept: req.__({ phrase: 'actionAccept', locale: lang }),
      actionReject: req.__({ phrase: 'actionReject',  locale: lang }),
      actionDelete: req.__({ phrase: 'actionDelete',  locale: lang })
    };
    res.json(t);
  });
}
