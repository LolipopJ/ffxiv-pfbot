import type { Locale } from "../types/locale";
import dictionary from "./generated/de";

export default {
  language: "DE",
  intlLocale: "de-DE",
  dictionary,
  categories: {
    DutyRoulette: "Zufallsinhalt",
    Dungeons: "Dungeons",
    Guildhests: "Gildengeheiße",
    Trials: "Prüfungen",
    Raids: "Raids",
    HighEndDuty: "Schwierige Inhalte",
    Pvp: "PvP",
    GoldSaucer: "Gold Saucer",
    Fates: "FATEs",
    TreasureHunt: "Schatzsuche",
    TheHunt: "Hohe Jagd",
    GatheringForays: "Sammeln",
    DeepDungeons: "Tiefe Gewölbe",
    AdventuringForays: "Feldexkursion",
    None: "Andere",
    "V&C Dungeon Finder": "Gewölbesuche",
  },
  jobs: {
    PLD: "Paladin",
    GLA: "Gladiator",
    WAR: "Krieger",
    MRD: "Marodeur",
    DRK: "Dunkelritter",
    GNB: "Revolverklinge",
    WHM: "Weißmagier",
    CNJ: "Druide",
    SCH: "Gelehrter",
    AST: "Astrologe",
    SGE: "Weiser",
    MNK: "Mönch",
    PGL: "Faustkämpfer",
    DRG: "Dragoon",
    LNC: "Pikenier",
    NIN: "Ninja",
    ROG: "Schurke",
    SAM: "Samurai",
    RPR: "Schnitter",
    VPR: "Viper",
    BSM: "Bestienbändiger",
    BRD: "Barde",
    ARC: "Waldläufer",
    MCH: "Maschinist",
    DNC: "Tänzer",
    BLM: "Schwarzmagier",
    THM: "Thaumaturg",
    SMN: "Beschwörer",
    ACN: "Hermetiker",
    RDM: "Rotmagier",
    PCT: "Piktomant",
    BLU: "Blaumagier",
    ANY: "Jede Rolle",
  },
  tags: {
    None: "Nicht festgelegt",
    "Duty Completion": "Abschluss",
    Practice: "Zur Übung",
    Loot: "Beute sammeln",
    "Duty Complete": "Abgeschlossen",
    "One Player per Job": "Nur ein Spieler je Job",
  },
  messages: {
    logs: {
      modules: {
        language: "Sprache",
        startup: "Start",
        commands: "Befehle",
        connection: "Verbindung",
        shutdown: "Beenden",
        database: "Datenbank",
        fetcher: "Abruf",
        monitor: "Überwachung",
        cleanup: "Bereinigung",
        subscription: "Abonnement",
        presence: "Status",
        listing: "Gruppengesuch",
      },
      events: {
        unsupportedLanguage:
          "LANGUAGE wird nicht unterstützt; EN wird verwendet.",
        languageConfigured: "Sprache des Bots konfiguriert",
        missingToken:
          "DISCORD_BOT_TOKEN fehlt; Umgebungsvariablen oder .env-Datei prüfen",
        commandLoaded: "Befehl geladen",
        commandInvalid:
          "Befehl konnte nicht geladen werden: data- oder execute-Eigenschaft fehlt",
        commandLoadFailed: "Laden des Befehls fehlgeschlagen",
        commandNotFound: "Angeforderter Befehl nicht gefunden",
        commandFailed: "Ausführung des Befehls fehlgeschlagen",
        commandErrorReplyFailed:
          "Fehlerantwort für den Befehl konnte nicht gesendet werden",
        commandsRegistered: "Serverbefehle registriert",
        commandsRegisterFailed:
          "Registrierung der Serverbefehle fehlgeschlagen",
        guildJoined: "Bot ist einem Server beigetreten",
        botReady: "Bot ist online",
        initializationFailed:
          "Initialisierung der Datenbank oder Start der Überwachung fehlgeschlagen",
        clientError: "Discord-Clientfehler",
        clientWarning: "Discord-Clientwarnung",
        connecting: "Verbindung zu Discord wird hergestellt",
        loginFailed: "Anmeldung bei Discord fehlgeschlagen",
        shuttingDown:
          "Bot wird beendet; Überwachungs- und Bereinigungsaufgaben werden abgewartet",
        shutdownComplete: "Bot beendet",
        databaseOpened: "Abonnementdatenbank geöffnet",
        databaseClosed: "Abonnementdatenbank geschlossen",
        listingsFetched: "Gruppensuchseite abgerufen und verarbeitet",
        expiryUnknown:
          "Ablaufzeit des Gruppengesuchs nicht lesbar; gespeicherte Fristen bleiben erhalten, neue Zustellungen laufen eine Stunde nach Erfassung ab",
        monitorSkipped:
          "Keine Prüfung erforderlich: keine Abonnements oder Zustellprotokolle",
        monitorFetchFailed:
          "Abruf der Gruppengesuche fehlgeschlagen; erneuter Versuch bei der nächsten Prüfung, Bereinigung diesmal nur nach gespeicherten Fristen",
        channelUnavailable:
          "Nicht erreichbarer Kanal oder falsche Serverzuordnung übersprungen; Protokolle für erneuten Versuch behalten",
        channelCannotSend:
          "Kanal kann keine Nachrichten senden; Zustellung in diesem Durchlauf übersprungen",
        invalidPatternSkipped:
          "Abonnement mit ungültigem regulärem Ausdruck übersprungen",
        listingUpdated: "Nachricht zum Gruppengesuch aktualisiert",
        listingSent: "Nachricht zum Gruppengesuch gesendet",
        deliveryFailed:
          "Zustellung des Gruppengesuchs fehlgeschlagen; erneuter Versuch bei der nächsten Prüfung",
        channelProcessingFailed:
          "Kanalverarbeitung fehlgeschlagen; Abonnements und Zustellprotokolle für erneuten Versuch behalten",
        monitorComplete: "Prüfung abgeschlossen",
        monitorFailed:
          "Überwachungsaufgabe fehlgeschlagen; erneuter Versuch bei der nächsten Prüfung",
        monitorCleanupFailed:
          "Automatische Bereinigung nach der Überwachung fehlgeschlagen; erneuter Versuch bei der nächsten Bereinigung",
        monitorStarted: "Überwachung der Gruppensuche gestartet",
        monitorStopped: "Überwachung der Gruppensuche beendet",
        scheduledCleanupFailed:
          "Geplante Bereinigung fehlgeschlagen; erneuter Versuch beim nächsten Mal",
        deliveryDeleted: "Nachricht und Zustellprotokoll gelöscht",
        deleteFailed:
          "Löschen fehlgeschlagen; Zustellprotokoll für erneuten Versuch behalten",
        channelCleanupFailed:
          "Kanalbereinigung fehlgeschlagen; Protokolle für erneuten Versuch behalten",
        cleanupFetchFailed:
          "Abruf fehlgeschlagen; Bereinigung nur nach gespeicherten Fristen",
        cleanupComplete: "Bereinigung abgeschlossen",
        cleanupStarted: "Stündliche Bereinigung gestartet",
        subscriptionCreated: "Gruppensuchabonnement erstellt",
        subscriptionEdited: "Gruppensuchabonnement aktualisiert",
        subscriptionCancelled: "Gruppensuchabonnement gekündigt",
        presenceFailed: "Botstatus konnte nicht aktualisiert werden",
      },
      errors: {
        scopeRequired: "Server- und Kanalbereich dürfen nicht leer sein",
        invalidPagination: "Ungültige Parameter für die Seiteneinteilung",
        channelUnavailable:
          "Kanal ist nicht erreichbar oder gehört nicht zum Server",
        cleanupStopped: "Bereinigungsdienst wurde beendet",
        botShuttingDown: "Der Bot wird beendet",
        fetchNotHtml: "XIVPF hat keine HTML-Seite zurückgegeben",
        fetchEmptyBody: "XIVPF hat einen leeren Antwortinhalt zurückgegeben",
        fetchTooLarge: "XIVPF-HTML überschreitet die Antwortgrenze von 16 MiB",
        missingListingsContainer:
          "XIVPF-Container für Gruppengesuche fehlt oder ist nicht eindeutig",
        missingListingId: "XIVPF-Gruppengesuch hat keine ID",
        fetchHttp: ({ status }) => `XIVPF-HTTP-Fehler: ${status}`,
      },
      invalidLanguage: ({ value, supported }) =>
        `LANGUAGE ${JSON.stringify(value)} wird nicht unterstützt; EN wird verwendet. Unterstützt: ${supported.join(", ")}.`,
    },
    common: {
      unknown: "Unbekannt",
      unlimited: "Beliebig",
      listSeparator: ", ",
      now: "Jetzt",
    },
    embed: {
      description: "📃 Kommentar",
      category: "🎯 Kategorie",
      server: "🌍 Welt",
      creator: "👤 Suchender",
      minIlvl: "⚔️ Minimale durchschnittliche Gegenstandsstufe",
      expires: "⏳ Suchdauer",
      party: ({ current, total }) => `👨‍👩‍👧‍👦 Gruppe (${current}/${total})`,
    },
    commands: {
      subscribe: "Gruppensuche in diesem Kanal abonnieren",
      list: "Abonnements dieses Kanals durchblättern",
      edit: "Ein Abonnement dieses Kanals auswählen und bearbeiten",
      unsubscribe: "Ein Abonnement dieses Kanals auswählen und kündigen",
      clear:
        "Nachrichten und Zustellprotokolle beendeter Gruppengesuche in diesem Kanal löschen",
      reset:
        "Nachrichten und Zustellprotokolle ausgewählter oder aller Abonnements sofort löschen",
      page: "Seitennummer, standardmäßig 1",
    },
    filters: ({ centres, categories }) =>
      `Datenzentren: ${centres}\nKategorien: ${categories}`,
    form: {
      createTitle: "Abonnement der Gruppensuche erstellen",
      editTitle: "Abonnement der Gruppensuche bearbeiten",
      pattern: "Regulärer Ausdruck",
      patternDescription:
        "Filtert englische Inhaltsnamen und Originalkommentare. RE2-Syntax, 1–1000 Zeichen.",
      dataCentres: "Datenzentren",
      categories: "Kategorien",
      multiSelect: "Mehrfachauswahl; leer bedeutet beliebig",
      createTimeout: "ℹ️ Zeit abgelaufen. Es wurde kein Abonnement erstellt.",
      editTimeout:
        "ℹ️ Zeit abgelaufen. Es wurden keine Änderungen gespeichert.",
      created: ({ pattern, filters, id }) =>
        `✅ Abonnement in diesem Kanal erstellt.\nAusdruck: ${pattern}\n${filters}\nID: ${id}`,
      edited: ({ pattern, filters, id }) =>
        `✅ Abonnement in diesem Kanal aktualisiert.\nAusdruck: ${pattern}\n${filters}\nID: ${id}`,
    },
    pager: {
      empty: "ℹ️ Dieser Kanal hat keine Abonnements.",
      summary: ({ total, page, pageCount }) =>
        `📋 **Abonnements dieses Kanals** (${total}) | Seite ${page}/${pageCount}`,
      item: ({ index, pattern, filters, id, userId }) =>
        `\n\n${index}. ${pattern}\n${filters}\nID: ${id} | Erstellt von: <@${userId}>`,
      selectEdit: "\nAbonnement zum Bearbeiten auswählen:",
      selectDelete: "\nAbonnement zum Kündigen auswählen:",
      selectReset:
        "\nEin Abonnement auswählen, um dessen Nachrichten und Zustellprotokolle sofort zu löschen, auch aktive Gesuche. Einstellungen bleiben erhalten; aktive Gesuche können bei der nächsten Prüfung erneut gesendet werden. Geteilte Nachrichten werden ebenfalls gelöscht.",
      placeholder: "Abonnement auf dieser Seite auswählen",
      emptyPattern: "(Leerer Ausdruck)",
      all: "Alle Abonnements",
      allDescription:
        "Alle Gesuchsnachrichten und Zustellprotokolle löschen, auch von gekündigten Abonnements",
      previous: "Zurück",
      next: "Weiter",
      resetting: "⏳ Nachrichten werden gelöscht…",
      editOpened:
        "ℹ️ Ausdruck, Datenzentren und Kategorien im Formular bearbeiten und zum Speichern absenden.",
      cancelled: "✅ Abonnement gekündigt.",
    },
    errors: {
      PATTERN_LENGTH: "Der reguläre Ausdruck muss 1–1000 Zeichen enthalten",
      INVALID_PATTERN: "Ungültiger regulärer RE2-Ausdruck",
      INVALID_DATA_CENTRE: "Ungültiges Datenzentrum",
      INVALID_CATEGORY: "Ungültige Kategorie",
      DUPLICATE_SUBSCRIPTION:
        "Dieser Kanal hat bereits ein Abonnement mit demselben Ausdruck und denselben Filtern",
      SUBSCRIPTION_NOT_FOUND:
        "Abonnement nicht gefunden oder Zugriff verweigert.",
      guildOnly: "Diesen Befehl in einem Serverkanal verwenden.",
      channelOnly:
        "Nur Textkanäle, Ankündigungskanäle und Threads werden unterstützt.",
      userPermissions:
        "Du benötigst hier die Berechtigungen „Kanal ansehen“ und „Kanäle verwalten“.",
      threadClosed:
        "Der Thread ist archiviert oder gesperrt. Bitte zuerst wiederherstellen.",
      botPermissions:
        "Der Bot benötigt hier „Kanal ansehen“, „Nachrichten senden“ und „Links einbetten“.",
      botTimedOut: "Der Bot hat einen Timeout. Bitte zuerst aufheben.",
      privateThread:
        "Der Bot kann diesen privaten Thread nicht öffnen. Bitte hinzufügen und Berechtigungen prüfen.",
      commandFailed: "❌ Befehl fehlgeschlagen",
    },
    cleanup: {
      result: ({ removed, failed }) =>
        `${removed} Nachrichten und Zustellprotokolle gelöscht; ${failed} fehlgeschlagen (Protokolle für erneuten Versuch behalten). Abonnements bleiben erhalten.`,
      fetchFailed:
        "\nAbruf fehlgeschlagen; nur bereits gespeicherte Ablaufzeiten wurden zur Bereinigung verwendet.",
      unlinked: ({ count }) =>
        `\n${count} ältere Protokolle sind keinem Abonnement zugeordnet. Zum Löschen „Alle Abonnements“ auswählen.`,
    },
    presence: {
      fetching: "Gruppensuche wird abgerufen und verarbeitet…",
      clearing: "Beendete Gruppengesuche werden gelöscht…",
      noNextTime: "Kein geplanter Zeitpunkt",
      next: ({ time }) => `Nächster Lauf: ${time}`,
    },
  },
} satisfies Locale;
