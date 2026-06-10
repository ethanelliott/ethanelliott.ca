import express from 'express';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import 'ejs'; // Force inclusion in generated package.json
import { closeDB, getDB, setupDatabase } from './db';
import { fmtPrice, getPageContext } from './page-data';
import { closeBrowser, updateDatabase } from './scraper';
import aiRoutes from './ai-routes';
import apiRoutes from './routes/api';
import webRoutes from './routes/web';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

async function main() {
  const db = getDB();
  await setupDatabase(db);

  // Initial update in background
  updateDatabase()
    .then(() => console.log('Initial database update completed.'))
    .catch((error) => console.error('Initial database update failed:', error));

  cron.schedule('*/30 * * * *', async () => {
    console.log('Scheduled task started: Updating database...');
    try {
      await updateDatabase();
      console.log('Scheduled database update completed successfully.');
    } catch (error) {
      console.error('Error during scheduled database update:', error);
    }
  });

  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.locals.fmtPrice = fmtPrice;
  app.use(
    express.static(path.join(__dirname, 'public'), {
      maxAge: '1h',
    })
  );

  app.use(apiRoutes);
  app.use(aiRoutes);
  app.use(webRoutes);

  // 404 handler — anything that fell through the routers
  app.use(async (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const { stats } = await getPageContext(getDB());
    res.status(404).render('error', {
      title: '404',
      status: 404,
      message: 'This page does not exist.',
      stats,
    });
  });

  // Error handler — Express 5 forwards rejected promises from async routes
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      console.error('Unhandled route error:', err);
      if (res.headersSent) {
        next(err);
        return;
      }
      if (req.path.startsWith('/api/')) {
        res.status(500).json({ error: 'Internal server error' });
        return;
      }
      res.status(500).render('error', {
        title: '500',
        status: 500,
        message: 'Something went wrong. Please try again.',
        stats: null,
      });
    }
  );

  app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
  });

  process.on('SIGINT', async () => {
    console.log('\nGracefully shutting down...');
    closeDB();
    await closeBrowser();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
