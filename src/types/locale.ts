import type { RecruitmentTag } from "../constants/recruitment";
import type { Category, Job } from "./recruitment";
import type { SubscriptionErrorCode } from "./subscription-error";

export type Language = "EN" | "CHS" | "DE" | "FR" | "JA" | "KO";

export interface SubscriptionMessageParams {
  pattern: string;
  filters: string;
  id: string;
}

export interface LogMessages {
  modules: {
    language: string;
    startup: string;
    commands: string;
    connection: string;
    shutdown: string;
    database: string;
    fetcher: string;
    monitor: string;
    cleanup: string;
    subscription: string;
    presence: string;
    listing: string;
  };
  events: {
    unsupportedLanguage: string;
    languageConfigured: string;
    missingToken: string;
    commandLoaded: string;
    commandInvalid: string;
    commandLoadFailed: string;
    commandNotFound: string;
    commandFailed: string;
    commandErrorReplyFailed: string;
    commandsRegistered: string;
    commandsRegisterFailed: string;
    guildJoined: string;
    botReady: string;
    initializationFailed: string;
    clientError: string;
    clientWarning: string;
    connecting: string;
    loginFailed: string;
    shuttingDown: string;
    shutdownComplete: string;
    databaseOpened: string;
    databaseClosed: string;
    listingsFetched: string;
    expiryUnknown: string;
    monitorSkipped: string;
    monitorFetchFailed: string;
    channelUnavailable: string;
    channelCannotSend: string;
    invalidPatternSkipped: string;
    listingUpdated: string;
    listingSent: string;
    deliveryFailed: string;
    channelProcessingFailed: string;
    monitorComplete: string;
    monitorFailed: string;
    monitorCleanupFailed: string;
    monitorStarted: string;
    monitorStopped: string;
    scheduledCleanupFailed: string;
    deliveryDeleted: string;
    deleteFailed: string;
    channelCleanupFailed: string;
    cleanupFetchFailed: string;
    cleanupComplete: string;
    cleanupStarted: string;
    subscriptionCreated: string;
    subscriptionEdited: string;
    subscriptionCancelled: string;
    presenceFailed: string;
  };
  errors: {
    scopeRequired: string;
    invalidPagination: string;
    channelUnavailable: string;
    cleanupStopped: string;
    botShuttingDown: string;
    fetchHttp: (p: { status: number }) => string;
    fetchNotHtml: string;
    fetchEmptyBody: string;
    fetchTooLarge: string;
    missingListingsContainer: string;
    missingListingId: string;
  };
  invalidLanguage: (p: {
    value: string | undefined;
    supported: readonly Language[];
  }) => string;
}

export type LogModule = keyof LogMessages["modules"];
export type LogEvent = keyof LogMessages["events"];

export interface Messages {
  logs: LogMessages;
  common: {
    unknown: string;
    unlimited: string;
    listSeparator: string;
    now: string;
  };
  embed: {
    description: string;
    category: string;
    server: string;
    creator: string;
    minIlvl: string;
    expires: string;
    party: (p: { current: number | string; total: number | string }) => string;
  };
  commands: {
    subscribe: string;
    list: string;
    edit: string;
    unsubscribe: string;
    clear: string;
    reset: string;
    page: string;
  };
  filters: (p: { centres: string; categories: string }) => string;
  form: {
    createTitle: string;
    editTitle: string;
    pattern: string;
    patternDescription: string;
    dataCentres: string;
    categories: string;
    multiSelect: string;
    createTimeout: string;
    editTimeout: string;
    created: (p: SubscriptionMessageParams) => string;
    edited: (p: SubscriptionMessageParams) => string;
  };
  pager: {
    empty: string;
    summary: (p: { total: number; page: number; pageCount: number }) => string;
    item: (
      p: SubscriptionMessageParams & { index: number; userId: string },
    ) => string;
    selectEdit: string;
    selectDelete: string;
    selectReset: string;
    placeholder: string;
    emptyPattern: string;
    all: string;
    allDescription: string;
    previous: string;
    next: string;
    resetting: string;
    editOpened: string;
    cancelled: string;
  };
  errors: Record<SubscriptionErrorCode, string> & {
    guildOnly: string;
    channelOnly: string;
    userPermissions: string;
    threadClosed: string;
    botPermissions: string;
    botTimedOut: string;
    privateThread: string;
    commandFailed: string;
  };
  cleanup: {
    result: (p: { removed: number; failed: number }) => string;
    fetchFailed: string;
    unlinked: (p: { count: number }) => string;
  };
  presence: {
    fetching: string;
    clearing: string;
    noNextTime: string;
    next: (p: { time: string }) => string;
  };
}

export interface Locale {
  language: Language;
  intlLocale: string;
  dictionary: Readonly<Record<string, string>>;
  categories: Readonly<Record<Category, string>>;
  jobs: Readonly<Record<Job, string>>;
  tags: Readonly<Record<RecruitmentTag, string>>;
  messages: Messages;
}
