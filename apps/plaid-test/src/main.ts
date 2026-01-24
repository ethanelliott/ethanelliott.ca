import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import 'ejs'; // Force inclusion in generated package.json
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  LinkTokenCreateRequest,
  ItemPublicTokenExchangeRequest,
  TransactionsGetRequest,
  AccountsGetRequest,
  InstitutionsGetByIdRequest,
} from 'plaid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Plaid Configuration
// You'll need to set these environment variables:
// PLAID_CLIENT_ID - Your Plaid client ID
// PLAID_SECRET - Your Plaid secret (sandbox/development/production)
// PLAID_ENV - 'sandbox', 'development', or 'production'

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || '';
const PLAID_SECRET = process.env.PLAID_SECRET || '';
const PLAID_ENV = process.env.PLAID_ENV || 'production';

const configuration = new Configuration({
  basePath:
    PlaidEnvironments[PLAID_ENV as keyof typeof PlaidEnvironments] ||
    PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
      'PLAID-SECRET': PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// In-memory storage for testing (replace with DB in production)
interface StoredItem {
  accessToken: string;
  itemId: string;
  institutionId?: string;
  institutionName?: string;
  createdAt: Date;
}

const connectedItems: Map<string, StoredItem> = new Map();

async function main() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // ==================== PAGE ROUTES ====================

  // Home page - shows connected accounts and link button
  app.get('/', async (req: Request, res: Response) => {
    const items = Array.from(connectedItems.entries()).map(([id, item]) => ({
      id,
      ...item,
    }));

    res.render('index', {
      title: 'Plaid API Test',
      items,
      hasCredentials: !!(PLAID_CLIENT_ID && PLAID_SECRET),
      plaidEnv: PLAID_ENV,
    });
  });

  // Link page - initializes Plaid Link
  app.get('/link', async (req: Request, res: Response) => {
    res.render('link', {
      title: 'Connect Bank Account',
    });
  });

  // Success page after linking
  app.get('/success', async (req: Request, res: Response) => {
    const itemId = req.query.item_id as string;
    const item = itemId ? connectedItems.get(itemId) : null;

    res.render('success', {
      title: 'Account Connected',
      item,
      itemId,
    });
  });

  // Account details page
  app.get('/accounts/:itemId', async (req: Request, res: Response) => {
    const { itemId } = req.params;
    const item = connectedItems.get(itemId);

    if (!item) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Item not found',
      });
    }

    try {
      const accountsRequest: AccountsGetRequest = {
        access_token: item.accessToken,
      };
      const accountsResponse = await plaidClient.accountsGet(accountsRequest);

      res.render('accounts', {
        title: 'Accounts',
        accounts: accountsResponse.data.accounts,
        item: accountsResponse.data.item,
        institutionName: item.institutionName,
        itemId,
      });
    } catch (error: any) {
      console.error('Error fetching accounts:', error.response?.data || error);
      res.render('error', {
        title: 'Error',
        message:
          error.response?.data?.error_message || 'Failed to fetch accounts',
        details: error.response?.data,
      });
    }
  });

  // Transactions page
  app.get('/transactions/:itemId', async (req: Request, res: Response) => {
    const { itemId } = req.params;
    const item = connectedItems.get(itemId);

    if (!item) {
      return res.status(404).render('error', {
        title: 'Error',
        message: 'Item not found',
      });
    }

    try {
      // Get transactions from the last 30 days
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const transactionsRequest: TransactionsGetRequest = {
        access_token: item.accessToken,
        start_date: startDate,
        end_date: endDate,
        options: {
          count: 100,
          offset: 0,
        },
      };

      const transactionsResponse = await plaidClient.transactionsGet(
        transactionsRequest
      );

      res.render('transactions', {
        title: 'Transactions',
        transactions: transactionsResponse.data.transactions,
        accounts: transactionsResponse.data.accounts,
        totalTransactions: transactionsResponse.data.total_transactions,
        institutionName: item.institutionName,
        itemId,
        startDate,
        endDate,
      });
    } catch (error: any) {
      console.error(
        'Error fetching transactions:',
        error.response?.data || error
      );
      res.render('error', {
        title: 'Error',
        message:
          error.response?.data?.error_message || 'Failed to fetch transactions',
        details: error.response?.data,
      });
    }
  });

  // ==================== API ROUTES ====================

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      hasCredentials: !!(PLAID_CLIENT_ID && PLAID_SECRET),
      environment: PLAID_ENV,
    });
  });

  // Create link token for Plaid Link initialization
  app.post('/api/create_link_token', async (req: Request, res: Response) => {
    try {
      const request: LinkTokenCreateRequest = {
        user: {
          client_user_id: 'test-user-' + Date.now(),
        },
        client_name: 'Plaid Test App',
        products: [Products.Transactions],
        country_codes: [CountryCode.Us, CountryCode.Ca],
        language: 'en',
      };

      const response = await plaidClient.linkTokenCreate(request);

      res.json({
        link_token: response.data.link_token,
        expiration: response.data.expiration,
      });
    } catch (error: any) {
      console.error(
        'Error creating link token:',
        error.response?.data || error
      );
      res.status(500).json({
        error:
          error.response?.data?.error_message || 'Failed to create link token',
        details: error.response?.data,
      });
    }
  });

  // Exchange public token for access token
  app.post('/api/exchange_token', async (req: Request, res: Response) => {
    try {
      const { public_token, institution } = req.body;

      if (!public_token) {
        return res.status(400).json({ error: 'public_token is required' });
      }

      const exchangeRequest: ItemPublicTokenExchangeRequest = {
        public_token,
      };

      const exchangeResponse = await plaidClient.itemPublicTokenExchange(
        exchangeRequest
      );

      const accessToken = exchangeResponse.data.access_token;
      const itemId = exchangeResponse.data.item_id;

      // Store the access token
      connectedItems.set(itemId, {
        accessToken,
        itemId,
        institutionId: institution?.institution_id,
        institutionName: institution?.name,
        createdAt: new Date(),
      });

      console.log(`Successfully linked item: ${itemId}`);

      res.json({
        success: true,
        item_id: itemId,
        institution_name: institution?.name,
      });
    } catch (error: any) {
      console.error('Error exchanging token:', error.response?.data || error);
      res.status(500).json({
        error:
          error.response?.data?.error_message || 'Failed to exchange token',
        details: error.response?.data,
      });
    }
  });

  // Get all connected items
  app.get('/api/items', (req: Request, res: Response) => {
    const items = Array.from(connectedItems.entries()).map(([id, item]) => ({
      item_id: id,
      institution_id: item.institutionId,
      institution_name: item.institutionName,
      created_at: item.createdAt,
    }));

    res.json({ items });
  });

  // Get accounts for an item
  app.get(
    '/api/items/:itemId/accounts',
    async (req: Request, res: Response) => {
      const { itemId } = req.params;
      const item = connectedItems.get(itemId);

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      try {
        const request: AccountsGetRequest = {
          access_token: item.accessToken,
        };

        const response = await plaidClient.accountsGet(request);

        res.json({
          accounts: response.data.accounts,
          item: response.data.item,
        });
      } catch (error: any) {
        console.error(
          'Error fetching accounts:',
          error.response?.data || error
        );
        res.status(500).json({
          error:
            error.response?.data?.error_message || 'Failed to fetch accounts',
          details: error.response?.data,
        });
      }
    }
  );

  // Get transactions for an item
  app.get(
    '/api/items/:itemId/transactions',
    async (req: Request, res: Response) => {
      const { itemId } = req.params;
      const item = connectedItems.get(itemId);

      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      try {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0];

        const request: TransactionsGetRequest = {
          access_token: item.accessToken,
          start_date: startDate,
          end_date: endDate,
          options: {
            count: 100,
            offset: 0,
          },
        };

        const response = await plaidClient.transactionsGet(request);

        res.json({
          transactions: response.data.transactions,
          accounts: response.data.accounts,
          total_transactions: response.data.total_transactions,
        });
      } catch (error: any) {
        console.error(
          'Error fetching transactions:',
          error.response?.data || error
        );
        res.status(500).json({
          error:
            error.response?.data?.error_message ||
            'Failed to fetch transactions',
          details: error.response?.data,
        });
      }
    }
  );

  // Get institution info
  app.get(
    '/api/institutions/:institutionId',
    async (req: Request, res: Response) => {
      const { institutionId } = req.params;

      try {
        const request: InstitutionsGetByIdRequest = {
          institution_id: institutionId,
          country_codes: [CountryCode.Us, CountryCode.Ca],
        };

        const response = await plaidClient.institutionsGetById(request);

        res.json({
          institution: response.data.institution,
        });
      } catch (error: any) {
        console.error(
          'Error fetching institution:',
          error.response?.data || error
        );
        res.status(500).json({
          error:
            error.response?.data?.error_message ||
            'Failed to fetch institution',
          details: error.response?.data,
        });
      }
    }
  );

  // Delete an item (disconnect bank)
  app.delete('/api/items/:itemId', async (req: Request, res: Response) => {
    const { itemId } = req.params;
    const item = connectedItems.get(itemId);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    try {
      // Remove from Plaid
      await plaidClient.itemRemove({
        access_token: item.accessToken,
      });

      // Remove from local storage
      connectedItems.delete(itemId);

      res.json({ success: true, message: 'Item removed' });
    } catch (error: any) {
      console.error('Error removing item:', error.response?.data || error);
      res.status(500).json({
        error: error.response?.data?.error_message || 'Failed to remove item',
        details: error.response?.data,
      });
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`Plaid Test App running at http://localhost:${PORT}`);
    console.log(`Environment: ${PLAID_ENV}`);
    console.log(
      `Credentials configured: ${!!(PLAID_CLIENT_ID && PLAID_SECRET)}`
    );

    if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
      console.warn(
        '\n⚠️  Warning: PLAID_CLIENT_ID and/or PLAID_SECRET not set!'
      );
      console.warn('Set these environment variables to connect to Plaid.');
      console.warn('Get your credentials at https://dashboard.plaid.com/\n');
    }
  });
}

main().catch(console.error);
