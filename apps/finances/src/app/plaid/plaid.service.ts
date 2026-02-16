import { inject } from '@ee/di';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  LinkTokenCreateRequest,
  ItemPublicTokenExchangeRequest,
  TransactionsSyncRequest,
  AccountsGetRequest,
  InstitutionsGetByIdRequest,
  ItemGetRequest,
  Transaction as PlaidTransaction,
  RemovedTransaction,
  PlaidError,
} from 'plaid';
import { AxiosError } from 'axios';

// Plaid error codes that require user re-authentication
const REAUTH_ERROR_CODES = [
  'ITEM_LOGIN_REQUIRED',
  'INVALID_CREDENTIALS',
  'INVALID_MFA',
  'ITEM_LOCKED',
  'USER_SETUP_REQUIRED',
  'MFA_NOT_SUPPORTED',
  'INSUFFICIENT_CREDENTIALS',
];

// Plaid error codes that indicate consent expiration
const CONSENT_ERROR_CODES = [
  'ITEM_CONSENT_REVOKED',
  'ITEM_PRODUCT_NOT_READY',
  'ITEM_NOT_FOUND',
];

interface PlaidApiError {
  error_type: string;
  error_code: string;
  error_message: string;
  display_message: string | null;
}
import { Database } from '../data-source';
import { PlaidItem, PlaidItemStatus } from './plaid-item.entity';
import { Account, AccountType } from './account.entity';
import { Transaction, TransactionType } from './transaction.entity';
import { SyncLog, SyncType, SyncStatus } from './sync-log.entity';
import HttpErrors from 'http-errors';

// Plaid configuration from environment
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

export interface SyncResult {
  added: number;
  modified: number;
  removed: number;
  accountsUpdated: number;
  hasMore: boolean;
}

/**
 * Parse a Plaid API error from an Axios error response
 */
function parsePlaidError(error: unknown): PlaidApiError | null {
  if (error instanceof AxiosError && error.response?.data) {
    const data = error.response.data as PlaidApiError;
    if (data.error_code && data.error_type) {
      return data;
    }
  }
  return null;
}

/**
 * Check if a Plaid error requires user re-authentication
 */
function isReauthRequired(error: PlaidApiError): boolean {
  return REAUTH_ERROR_CODES.includes(error.error_code);
}

/**
 * Check if a Plaid error indicates consent was revoked
 */
function isConsentRevoked(error: PlaidApiError): boolean {
  return CONSENT_ERROR_CODES.includes(error.error_code);
}

export class PlaidService {
  private readonly _plaidClient = new PlaidApi(configuration);
  private readonly _plaidItemRepository =
    inject(Database).repositoryFor(PlaidItem);
  private readonly _accountRepository = inject(Database).repositoryFor(Account);
  private readonly _transactionRepository =
    inject(Database).repositoryFor(Transaction);
  private readonly _syncLogRepository = inject(Database).repositoryFor(SyncLog);

  /**
   * Check if Plaid is configured
   */
  isConfigured(): boolean {
    return !!(PLAID_CLIENT_ID && PLAID_SECRET);
  }

  /**
   * Create a link token for initializing Plaid Link
   */
  async createLinkToken(
    userId: string
  ): Promise<{ linkToken: string; expiration: string }> {
    if (!this.isConfigured()) {
      throw new HttpErrors.ServiceUnavailable('Plaid is not configured');
    }

    const request: LinkTokenCreateRequest = {
      user: {
        client_user_id: userId,
      },
      client_name: 'Finance App',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us, CountryCode.Ca],
      language: 'en',
    };

    const response = await this._plaidClient.linkTokenCreate(request);

    return {
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    };
  }

  /**
   * Create a link token for updating an existing item (re-authentication)
   */
  async createUpdateLinkToken(
    userId: string,
    plaidItemId: string
  ): Promise<{ linkToken: string; expiration: string }> {
    const plaidItem = await this._plaidItemRepository.findOne({
      where: { id: plaidItemId, user: { id: userId } },
    });

    if (!plaidItem) {
      throw new HttpErrors.NotFound('Plaid item not found');
    }

    const request: LinkTokenCreateRequest = {
      user: {
        client_user_id: userId,
      },
      client_name: 'Finance App',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us, CountryCode.Ca],
      language: 'en',
      access_token: plaidItem.accessToken,
    };

    const response = await this._plaidClient.linkTokenCreate(request);

    return {
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    };
  }

  /**
   * Exchange public token for access token and save the item
   */
  async exchangeToken(
    userId: string,
    publicToken: string,
    institutionId?: string,
    institutionName?: string
  ): Promise<PlaidItem> {
    const exchangeRequest: ItemPublicTokenExchangeRequest = {
      public_token: publicToken,
    };

    const exchangeResponse = await this._plaidClient.itemPublicTokenExchange(
      exchangeRequest
    );

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Fetch item details to get consent expiration
    let consentExpiresAt: Date | undefined;
    try {
      const itemRequest: ItemGetRequest = {
        access_token: accessToken,
      };
      const itemResponse = await this._plaidClient.itemGet(itemRequest);
      if (itemResponse.data.item.consent_expiration_time) {
        consentExpiresAt = new Date(
          itemResponse.data.item.consent_expiration_time
        );
      }
    } catch (error) {
      console.warn(
        'Failed to fetch item details for consent expiration:',
        error
      );
    }

    // Get institution details if we have the ID
    let institutionLogo: string | undefined;
    let institutionColor: string | undefined;

    if (institutionId) {
      try {
        const instRequest: InstitutionsGetByIdRequest = {
          institution_id: institutionId,
          country_codes: [CountryCode.Us, CountryCode.Ca],
          options: {
            include_optional_metadata: true,
          },
        };
        const instResponse = await this._plaidClient.institutionsGetById(
          instRequest
        );
        institutionLogo = instResponse.data.institution.logo || undefined;
        institutionColor =
          instResponse.data.institution.primary_color || undefined;
        institutionName = instResponse.data.institution.name || institutionName;
      } catch (error) {
        console.warn('Failed to fetch institution details:', error);
      }
    }

    // Check if this item already exists (reconnecting)
    let plaidItem = await this._plaidItemRepository.findOne({
      where: { itemId, user: { id: userId } },
    });

    if (plaidItem) {
      // Update existing item
      plaidItem.accessToken = accessToken;
      plaidItem.status = PlaidItemStatus.ACTIVE;
      plaidItem.lastError = undefined;
      plaidItem.institutionName = institutionName;
      plaidItem.institutionLogo = institutionLogo;
      plaidItem.institutionColor = institutionColor;
      plaidItem.consentExpiresAt = consentExpiresAt;
    } else {
      // Create new item
      plaidItem = this._plaidItemRepository.create({
        itemId,
        accessToken,
        institutionId,
        institutionName,
        institutionLogo,
        institutionColor,
        consentExpiresAt,
        status: PlaidItemStatus.ACTIVE,
        user: { id: userId } as any,
      });
    }

    const savedItem = await this._plaidItemRepository.save(plaidItem);

    // Fetch accounts for this item
    await this.syncAccounts(savedItem, userId);

    // Do initial transaction sync (YTD)
    await this.syncTransactions(savedItem.id, userId, SyncType.INITIAL);

    return savedItem;
  }

  /**
   * Sync accounts for a Plaid item
   */
  async syncAccounts(plaidItem: PlaidItem, userId: string): Promise<number> {
    const request: AccountsGetRequest = {
      access_token: plaidItem.accessToken,
    };

    const response = await this._plaidClient.accountsGet(request);
    let updatedCount = 0;

    for (const plaidAccount of response.data.accounts) {
      let account = await this._accountRepository.findOne({
        where: {
          plaidAccountId: plaidAccount.account_id,
          user: { id: userId },
        },
      });

      const accountType = this.mapAccountType(plaidAccount.type);

      if (account) {
        // Update existing account
        account.name = plaidAccount.name;
        account.officialName = plaidAccount.official_name || undefined;
        account.type = accountType;
        account.subtype = plaidAccount.subtype || undefined;
        account.mask = plaidAccount.mask || undefined;
        account.currentBalance = plaidAccount.balances.current ?? undefined;
        account.availableBalance = plaidAccount.balances.available ?? undefined;
        account.limitAmount = plaidAccount.balances.limit ?? undefined;
        account.isoCurrencyCode =
          plaidAccount.balances.iso_currency_code || 'CAD';
        account.lastBalanceUpdate = new Date();
      } else {
        // Create new account
        account = this._accountRepository.create({
          plaidAccountId: plaidAccount.account_id,
          plaidItem: plaidItem,
          name: plaidAccount.name,
          officialName: plaidAccount.official_name || undefined,
          type: accountType,
          subtype: plaidAccount.subtype || undefined,
          mask: plaidAccount.mask || undefined,
          currentBalance: plaidAccount.balances.current ?? undefined,
          availableBalance: plaidAccount.balances.available ?? undefined,
          limitAmount: plaidAccount.balances.limit ?? undefined,
          isoCurrencyCode: plaidAccount.balances.iso_currency_code || 'CAD',
          lastBalanceUpdate: new Date(),
          user: { id: userId } as any,
        });
      }

      await this._accountRepository.save(account);
      updatedCount++;
    }

    return updatedCount;
  }

  /**
   * Sync transactions using Plaid's transactions/sync endpoint
   * This is the recommended approach for incremental syncing
   */
  async syncTransactions(
    plaidItemId: string,
    userId: string,
    syncType: SyncType = SyncType.INCREMENTAL
  ): Promise<SyncResult> {
    const startTime = Date.now();

    const plaidItem = await this._plaidItemRepository.findOne({
      where: { id: plaidItemId, user: { id: userId } },
    });

    if (!plaidItem) {
      throw new HttpErrors.NotFound('Plaid item not found');
    }

    // Create sync log entry
    const syncLog = this._syncLogRepository.create({
      plaidItem: plaidItem,
      syncType,
      status: SyncStatus.STARTED,
      user: { id: userId } as any,
    });
    await this._syncLogRepository.save(syncLog);

    try {
      // Update account balances first
      const accountsUpdated = await this.syncAccounts(plaidItem, userId);

      let cursor = plaidItem.lastSyncCursor || undefined;
      let hasMore = true;
      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;

      // For initial sync, we want YTD data
      // Plaid's sync endpoint handles this automatically if no cursor exists

      while (hasMore) {
        const request: TransactionsSyncRequest = {
          access_token: plaidItem.accessToken,
          cursor: cursor,
          count: 500, // Max allowed
        };

        const response = await this._plaidClient.transactionsSync(request);

        // Process added transactions
        for (const plaidTxn of response.data.added) {
          await this.processTransaction(plaidTxn, plaidItem, userId);
          totalAdded++;
        }

        // Process modified transactions
        for (const plaidTxn of response.data.modified) {
          await this.processTransaction(plaidTxn, plaidItem, userId);
          totalModified++;
        }

        // Process removed transactions
        for (const removedTxn of response.data.removed) {
          await this.removeTransaction(removedTxn, userId);
          totalRemoved++;
        }

        cursor = response.data.next_cursor;
        hasMore = response.data.has_more;
      }

      // Update the cursor for next sync
      plaidItem.lastSyncCursor = cursor;
      plaidItem.lastSyncAt = new Date();
      plaidItem.status = PlaidItemStatus.ACTIVE;
      plaidItem.lastError = undefined;
      await this._plaidItemRepository.save(plaidItem);

      // Detect transfers after syncing
      await this.detectTransfers(userId);

      // Update sync log
      syncLog.status = SyncStatus.COMPLETED;
      syncLog.transactionsAdded = totalAdded;
      syncLog.transactionsModified = totalModified;
      syncLog.transactionsRemoved = totalRemoved;
      syncLog.accountsUpdated = accountsUpdated;
      syncLog.durationMs = Date.now() - startTime;
      await this._syncLogRepository.save(syncLog);

      return {
        added: totalAdded,
        modified: totalModified,
        removed: totalRemoved,
        accountsUpdated,
        hasMore: false,
      };
    } catch (error: any) {
      // Parse Plaid-specific error information
      const plaidError = parsePlaidError(error);

      // Update sync log with error
      syncLog.status = SyncStatus.FAILED;
      syncLog.error = plaidError
        ? `${plaidError.error_code}: ${plaidError.error_message}`
        : error.message || 'Unknown error';
      syncLog.durationMs = Date.now() - startTime;
      await this._syncLogRepository.save(syncLog);

      // Determine appropriate item status based on error type
      if (plaidError && isReauthRequired(plaidError)) {
        // User needs to re-authenticate with their bank
        plaidItem.status = PlaidItemStatus.PENDING_EXPIRATION;
        plaidItem.lastError = `Re-authentication required: ${
          plaidError.display_message || plaidError.error_message
        }`;
        console.log(
          `🔑 Item ${
            plaidItem.institutionName || plaidItem.itemId
          } requires re-authentication (${plaidError.error_code})`
        );
      } else if (plaidError && isConsentRevoked(plaidError)) {
        // Consent was revoked, item needs to be reconnected
        plaidItem.status = PlaidItemStatus.REVOKED;
        plaidItem.lastError = `Consent revoked: ${
          plaidError.display_message || plaidError.error_message
        }`;
        console.log(
          `❌ Item ${
            plaidItem.institutionName || plaidItem.itemId
          } consent was revoked (${plaidError.error_code})`
        );
      } else {
        // Generic error
        plaidItem.status = PlaidItemStatus.ERROR;
        plaidItem.lastError = plaidError
          ? plaidError.error_message
          : error.message || 'Sync failed';
      }
      await this._plaidItemRepository.save(plaidItem);

      throw error;
    }
  }

  /**
   * Process a single transaction from Plaid
   */
  private async processTransaction(
    plaidTxn: PlaidTransaction,
    plaidItem: PlaidItem,
    userId: string
  ): Promise<void> {
    // Find the account for this transaction
    const account = await this._accountRepository.findOne({
      where: {
        plaidAccountId: plaidTxn.account_id,
        user: { id: userId },
      },
    });

    if (!account) {
      console.warn(
        `Account not found for transaction: ${plaidTxn.transaction_id}`
      );
      return;
    }

    // Check if transaction already exists
    let transaction = await this._transactionRepository.findOne({
      where: {
        plaidTransactionId: plaidTxn.transaction_id,
        user: { id: userId },
      },
    });

    // Determine transaction type
    // Plaid: positive = money out (expense), negative = money in (income)
    const type = this.determineTransactionType(plaidTxn);

    // Get Plaid's personal finance category
    const personalFinanceCategory =
      plaidTxn.personal_finance_category?.primary ||
      plaidTxn.personal_finance_category?.detailed ||
      undefined;

    if (transaction) {
      // Update existing transaction (but preserve user edits)
      transaction.date = plaidTxn.date;
      transaction.authorizedDate = plaidTxn.authorized_date
        ? new Date(plaidTxn.authorized_date)
        : undefined;
      transaction.amount = plaidTxn.amount;
      transaction.type = type;
      transaction.name = plaidTxn.name;
      transaction.merchantName = plaidTxn.merchant_name || undefined;
      transaction.plaidCategory = plaidTxn.category?.join(' > ') || undefined;
      transaction.plaidCategoryId = plaidTxn.category_id || undefined;
      transaction.plaidPersonalFinanceCategory = personalFinanceCategory;
      transaction.pending = plaidTxn.pending;
      transaction.paymentChannel = plaidTxn.payment_channel || undefined;
      transaction.transactionCode = plaidTxn.transaction_code || undefined;
      transaction.locationCity = plaidTxn.location?.city || undefined;
      transaction.locationRegion = plaidTxn.location?.region || undefined;
      transaction.locationCountry = plaidTxn.location?.country || undefined;
      transaction.isoCurrencyCode =
        plaidTxn.iso_currency_code ||
        plaidTxn.unofficial_currency_code ||
        'CAD';
    } else {
      // Create new transaction
      transaction = this._transactionRepository.create({
        plaidTransactionId: plaidTxn.transaction_id,
        account: account,
        date: plaidTxn.date,
        authorizedDate: plaidTxn.authorized_date
          ? new Date(plaidTxn.authorized_date)
          : undefined,
        amount: plaidTxn.amount,
        type: type,
        name: plaidTxn.name,
        merchantName: plaidTxn.merchant_name || undefined,
        plaidCategory: plaidTxn.category?.join(' > ') || undefined,
        plaidCategoryId: plaidTxn.category_id || undefined,
        plaidPersonalFinanceCategory: personalFinanceCategory,
        pending: plaidTxn.pending,
        isReviewed: false,
        paymentChannel: plaidTxn.payment_channel || undefined,
        transactionCode: plaidTxn.transaction_code || undefined,
        locationCity: plaidTxn.location?.city || undefined,
        locationRegion: plaidTxn.location?.region || undefined,
        locationCountry: plaidTxn.location?.country || undefined,
        isoCurrencyCode:
          plaidTxn.iso_currency_code ||
          plaidTxn.unofficial_currency_code ||
          'CAD',
        tags: [],
        user: { id: userId } as any,
      });
    }

    await this._transactionRepository.save(transaction);
  }

  /**
   * Remove a transaction that Plaid says was removed
   */
  private async removeTransaction(
    removedTxn: RemovedTransaction,
    userId: string
  ): Promise<void> {
    const transaction = await this._transactionRepository.findOne({
      where: {
        plaidTransactionId: removedTxn.transaction_id,
        user: { id: userId },
      },
    });

    if (transaction) {
      await this._transactionRepository.remove(transaction);
    }
  }

  /**
   * Detect transfers between accounts
   * Uses fuzzy date matching (±3 days), opposite amounts, different accounts,
   * and keyword/category signals to auto-link transfers with confidence scoring.
   * Also catches bill payments (credit card payments, loan payments, etc.)
   */
  async detectTransfers(userId: string): Promise<number> {
    // Find ALL unlinked, non-pending transactions (not just type=TRANSFER)
    const unlinked = await this._transactionRepository
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.account', 'account')
      .where('t.user.id = :userId', { userId })
      .andWhere('t.linkedTransferId IS NULL')
      .andWhere('t.pending = :pending', { pending: false })
      .orderBy('t.date', 'ASC')
      .getMany();

    // Group by date for efficient matching (expand to ±3 day windows)
    const byDate = new Map<string, typeof unlinked>();
    for (const txn of unlinked) {
      if (!byDate.has(txn.date)) byDate.set(txn.date, []);
      byDate.get(txn.date)!.push(txn);
    }

    const linked = new Set<string>();
    let linkedCount = 0;

    // For each transaction, attempt to find the best match
    for (const txn of unlinked) {
      if (linked.has(txn.id)) continue;

      const txnAmount = parseFloat(txn.amount.toString());

      // Collect candidates within ±3 days
      const dateParts = txn.date.split('-').map(Number);
      const baseDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
      const candidates: Array<{
        candidate: (typeof unlinked)[0];
        confidence: number;
      }> = [];

      for (let offset = -3; offset <= 3; offset++) {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + offset);
        const key = d.toISOString().split('T')[0];
        const group = byDate.get(key);
        if (!group) continue;

        for (const c of group) {
          if (c.id === txn.id) continue;
          if (linked.has(c.id)) continue;
          if (c.account?.id === txn.account?.id) continue;

          const cAmount = parseFloat(c.amount.toString());
          const confidence = this.computeLinkConfidence(
            txnAmount,
            txn.date,
            txn.account?.id || '',
            txn.name,
            txn.type,
            txn.plaidPersonalFinanceCategory,
            cAmount,
            c.date,
            c.account?.id || '',
            c.name,
            c.type,
            c.plaidPersonalFinanceCategory
          );

          if (confidence >= 70) {
            candidates.push({ candidate: c, confidence });
          }
        }
      }

      if (candidates.length === 0) continue;

      // Pick the highest confidence match
      candidates.sort((a, b) => b.confidence - a.confidence);
      const bestMatch = candidates[0];

      // Link them
      txn.linkedTransferId = bestMatch.candidate.id;
      txn.linkedTransferConfidence = bestMatch.confidence;
      txn.type = TransactionType.TRANSFER;
      bestMatch.candidate.linkedTransferId = txn.id;
      bestMatch.candidate.linkedTransferConfidence = bestMatch.confidence;
      bestMatch.candidate.type = TransactionType.TRANSFER;

      await this._transactionRepository.save([txn, bestMatch.candidate]);
      linked.add(txn.id);
      linked.add(bestMatch.candidate.id);
      linkedCount++;
    }

    return linkedCount;
  }

  /**
   * Compute confidence (0-100) that two transactions are a transfer pair
   */
  private computeLinkConfidence(
    amountA: number,
    dateA: string,
    accountIdA: string,
    nameA: string,
    typeA: TransactionType,
    categoryA: string | undefined,
    amountB: number,
    dateB: string,
    accountIdB: string,
    nameB: string,
    typeB: TransactionType,
    categoryB: string | undefined
  ): number {
    // Must be different accounts
    if (accountIdA === accountIdB) return 0;

    let score = 0;

    // ── Amount matching ──
    const sumAmount = amountA + amountB;
    const absA = Math.abs(amountA);
    if (Math.abs(sumAmount) < 0.02) {
      score += 50; // exact opposite
    } else if (absA > 0 && Math.abs(sumAmount) / absA < 0.01) {
      score += 40; // within 1%
    } else {
      return 0; // amounts must be close to opposite
    }

    // ── Date proximity ──
    const dateAMs = new Date(dateA).getTime();
    const dateBMs = new Date(dateB).getTime();
    const daysDiff = Math.abs(dateAMs - dateBMs) / (1000 * 60 * 60 * 24);
    if (daysDiff === 0) {
      score += 25;
    } else if (daysDiff <= 1) {
      score += 20;
    } else if (daysDiff <= 2) {
      score += 15;
    } else if (daysDiff <= 3) {
      score += 10;
    }

    // ── Type / category signals ──
    const transferTypes = [
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT',
      'LOAN_PAYMENTS_MORTGAGE_PAYMENT',
      'LOAN_PAYMENTS_CAR_PAYMENT',
      'LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT',
    ];
    if (
      typeA === TransactionType.TRANSFER ||
      typeB === TransactionType.TRANSFER
    ) {
      score += 10;
    }
    if (
      (categoryA && transferTypes.some((t) => categoryA.includes(t))) ||
      (categoryB && transferTypes.some((t) => categoryB.includes(t)))
    ) {
      score += 10;
    }

    // ── Name keyword signals ──
    const keywords = [
      'transfer',
      'e-transfer',
      'payment',
      'pymt',
      'pmt',
      'bill pay',
      'online banking',
      'internet banking',
      'credit card',
      'visa',
      'mastercard',
      'amex',
    ];
    const nameALower = nameA.toLowerCase();
    const nameBLower = nameB.toLowerCase();
    for (const kw of keywords) {
      if (nameALower.includes(kw) || nameBLower.includes(kw)) {
        score += 5;
        break;
      }
    }

    return Math.min(score, 100);
  }

  /**
   * Determine transaction type based on Plaid data
   */
  private determineTransactionType(
    plaidTxn: PlaidTransaction
  ): TransactionType {
    const nameLower = plaidTxn.name.toLowerCase();
    const detailedCategory = plaidTxn.personal_finance_category?.detailed || '';
    const primaryCategory = plaidTxn.personal_finance_category?.primary || '';

    // Check Plaid categories for transfers
    const isTransferCategory =
      plaidTxn.category?.includes('Transfer') ||
      primaryCategory === 'TRANSFER_IN' ||
      primaryCategory === 'TRANSFER_OUT';

    // Check for bill payment / loan payment categories
    const isBillPayCategory =
      detailedCategory.includes('LOAN_PAYMENTS') ||
      detailedCategory.includes('CREDIT_CARD_PAYMENT') ||
      primaryCategory === 'LOAN_PAYMENTS';

    // Check name for transfer keywords
    const isTransferName =
      nameLower.includes('transfer') ||
      nameLower.includes('e-transfer') ||
      nameLower.includes('etransfer');

    // Check name for bill payment keywords
    const isBillPayName =
      /\b(payment|pymt|pmt|bill pay)\b/.test(nameLower) &&
      /(visa|mastercard|amex|credit card|cibc|rbc|td|bmo|scotiabank|tangerine)/i.test(
        nameLower
      );

    if (
      isTransferCategory ||
      isTransferName ||
      isBillPayCategory ||
      isBillPayName
    ) {
      return TransactionType.TRANSFER;
    }

    // Plaid: positive = money out (expense), negative = money in (income)
    return plaidTxn.amount > 0
      ? TransactionType.EXPENSE
      : TransactionType.INCOME;
  }

  /**
   * Map Plaid account type to our enum
   */
  private mapAccountType(plaidType: string): AccountType {
    switch (plaidType.toLowerCase()) {
      case 'depository':
        return AccountType.DEPOSITORY;
      case 'credit':
        return AccountType.CREDIT;
      case 'loan':
        return AccountType.LOAN;
      case 'investment':
        return AccountType.INVESTMENT;
      case 'brokerage':
        return AccountType.BROKERAGE;
      default:
        return AccountType.OTHER;
    }
  }

  /**
   * Get all Plaid items for a user
   */
  async getItems(userId: string): Promise<PlaidItem[]> {
    return this._plaidItemRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get a specific Plaid item
   */
  async getItem(itemId: string, userId: string): Promise<PlaidItem | null> {
    return this._plaidItemRepository.findOne({
      where: { id: itemId, user: { id: userId } },
    });
  }

  /**
   * Remove a Plaid item (disconnect bank)
   */
  async removeItem(itemId: string, userId: string): Promise<void> {
    const plaidItem = await this._plaidItemRepository.findOne({
      where: { id: itemId, user: { id: userId } },
    });

    if (!plaidItem) {
      throw new HttpErrors.NotFound('Plaid item not found');
    }

    try {
      // Remove from Plaid
      await this._plaidClient.itemRemove({
        access_token: plaidItem.accessToken,
      });
    } catch (error) {
      console.warn('Failed to remove item from Plaid:', error);
      // Continue with local removal even if Plaid call fails
    }

    // Cascade will remove accounts and transactions
    await this._plaidItemRepository.remove(plaidItem);
  }

  /**
   * Get sync logs for a user
   */
  async getSyncLogs(userId: string, limit: number = 20): Promise<SyncLog[]> {
    return this._syncLogRepository.find({
      where: { user: { id: userId } },
      relations: { plaidItem: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Sync all items for a user
   */
  async syncAllItems(userId: string): Promise<Map<string, SyncResult>> {
    const items = await this.getItems(userId);
    const results = new Map<string, SyncResult>();

    for (const item of items) {
      if (item.status === PlaidItemStatus.ACTIVE) {
        try {
          const result = await this.syncTransactions(
            item.id,
            userId,
            SyncType.MANUAL
          );
          results.set(item.id, result);
        } catch (error: any) {
          console.error(`Failed to sync item ${item.id}:`, error);
          results.set(item.id, {
            added: 0,
            modified: 0,
            removed: 0,
            accountsUpdated: 0,
            hasMore: false,
          });
        }
      }
    }

    return results;
  }
}
