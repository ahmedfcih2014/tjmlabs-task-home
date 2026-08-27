import express from 'express';

const app = express();
const port = 3030;

app.use(express.json({ limit: '1mb' }));

function logWebhook(req, res) {
  console.log('\n--- webhook received ---');
  console.log('time:', new Date().toISOString());
  console.log('path:', req.path);
  console.log('headers:', {
    'content-type': req.headers['content-type'],
    'x-webhook-signature': req.headers['x-webhook-signature'],
    'x-event-id': req.headers['x-event-id'],
    'x-event-type': req.headers['x-event-type'],
  });
  console.log('body:', JSON.stringify(req.body, null, 2));
  console.log('------------------------\n');

  res.status(200).json({ received: true });
}

app.post('/webhook', logWebhook);
app.get('/', (req, res) => {
  res.send('Webhook simulator is running');
});

// Express 5 no longer supports app.post('*'); accept any other POST path too
app.use((req, res, next) => {
  if (req.method === 'POST') {
    return logWebhook(req, res);
  }
  next();
});

app.listen(port, () => {
  console.log(`Webhook simulator listening on http://127.0.0.1:${port}`);
  console.log('Point subscription destinationUrl here, e.g.:');
  console.log(`  http://127.0.0.1:${port}/webhook`);
});