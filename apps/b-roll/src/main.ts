import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'ejs'; // Force inclusion in generated package.json
import {
  closeDB,
  deleteFile,
  getFile,
  initDB,
  insertFile,
  listFiles,
  renameFile,
} from './db';
import { attachUser, requireUser, uidOf } from './user';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || '10mb';

function cleanFilename(raw: unknown): string {
  const name = path.basename(String(raw || '')).trim();
  return name || 'untitled.html';
}

function cleanName(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const name = raw.trim().slice(0, 120);
  return name || undefined;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.fmtSize = fmtSize;
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.use(attachUser);

// Home — the user's uploads, with a whole-page drop zone.
app.get('/', requireUser, (req, res) => {
  res.render('index', {
    title: 'Your takes',
    files: listFiles(uidOf(res)),
  });
});

// Upload — JSON body { filename, content } sent by the drop zone.
app.post(
  '/api/files',
  requireUser,
  express.json({ limit: MAX_FILE_SIZE }),
  (req, res) => {
    const { filename, name, content } = req.body ?? {};
    if (typeof content !== 'string' || content.length === 0) {
      res.status(400).json({ error: 'content must be a non-empty string' });
      return;
    }
    const file = insertFile(
      uidOf(res),
      cleanFilename(filename),
      cleanName(name),
      content
    );
    res.status(201).json({ id: file.id, url: `/v/${file.id}` });
  }
);

// Rename — sets the display name shown in lists and on the share page.
app.patch('/api/files/:id', requireUser, express.json(), (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) {
    res.status(400).json({ error: 'name must be a non-empty string' });
    return;
  }
  if (!renameFile(String(req.params.id), uidOf(res), name)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true, name });
});

app.delete('/api/files/:id', requireUser, (req, res) => {
  if (!deleteFile(String(req.params.id), uidOf(res))) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

// Viewer — anyone with the link can see it. Small header, iframe below.
app.get('/v/:id', (req, res) => {
  const file = getFile(String(req.params.id));
  if (!file) {
    res.status(404).render('error', {
      title: 'Not found',
      status: 404,
      message: 'This take does not exist (or was deleted).',
    });
    return;
  }
  res.render('view', { title: file.name, file });
});

// The raw HTML, rendered inside the viewer's sandboxed iframe.
app.get('/v/:id/raw', (req, res) => {
  const file = getFile(String(req.params.id));
  if (!file) {
    res.status(404).send('Not found');
    return;
  }
  res.setHeader('X-Robots-Tag', 'noindex');
  res.type('html').send(file.content);
});

// 404 handler — anything that fell through
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(404).render('error', {
    title: '404',
    status: 404,
    message: 'This page does not exist.',
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
    });
  }
);

async function main() {
  await initDB();

  app.listen(PORT, () => {
    console.log(`B-Roll is running at http://localhost:${PORT}`);
  });

  process.on('SIGINT', () => {
    console.log('\nGracefully shutting down...');
    closeDB();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
