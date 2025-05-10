import { ensureAuthenticated } from '../modules/auth';

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { Application } from 'express';
import { CookieJar } from 'tough-cookie';

export default function (app: Application): void {
  // Add a route for /admin
  app.get('/admin', ensureAuthenticated, (req, res) => {
    res.render('admin'); // Render the Nunjucks template for admin
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
}
